package executor

import (
	"context"
	"fmt"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"log"
	"math/big"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/config"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/ethereum"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/middleware"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/monitor"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/mpc"
)

// BridgeExecutor handles the execution of bridge requests
type BridgeExecutor struct {
	ethClient *ethereum.Client
	mpcClient *mpc.SignerClient
	monitor   *monitor.EventMonitor
	contracts config.ContractConfig

	// Request tracking
	mu              sync.RWMutex
	pendingRequests map[[32]byte]*domain.BridgeRequest
	processedCount  int
	failedCount     int

	// Event deduplication
	eventTracker *middleware.ProcessedEventTracker

	statePath string
	stateLock *os.File
	// State
	isRunning bool
	isPaused  bool
}

// NewBridgeExecutor creates a new bridge executor
func NewBridgeExecutor(
	ethClient *ethereum.Client,
	mpcClient *mpc.SignerClient,
	eventMonitor *monitor.EventMonitor,
	contracts config.ContractConfig,
	eventTracker *middleware.ProcessedEventTracker,
) *BridgeExecutor {
	return &BridgeExecutor{
		ethClient:       ethClient,
		mpcClient:       mpcClient,
		monitor:         eventMonitor,
		contracts:       contracts,
		pendingRequests: make(map[[32]byte]*domain.BridgeRequest),
		eventTracker:    eventTracker,
	}
}

// Start starts the bridge executor
func (e *BridgeExecutor) Start(ctx context.Context) error {
	e.mu.Lock()
	if e.isRunning {
		e.mu.Unlock()
		return nil
	}
	e.isRunning = true
	e.mu.Unlock()

	log.Println("Starting bridge executor...")

	// Start processing goroutines
	go e.processBridgeInitiated(ctx)
	go e.processApprovedRequests(ctx)
	go e.processChallenges(ctx)
	go e.processEmergencyPause(ctx)
	go e.retryPending(ctx)

	return nil
}

// Stop stops the bridge executor
func (e *BridgeExecutor) Stop() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.isRunning = false
	log.Println("Bridge executor stopped")
}

// processBridgeInitiated processes BridgeInitiated events
func (e *BridgeExecutor) processBridgeInitiated(ctx context.Context) {
	bridgeInitiatedChan := e.monitor.GetBridgeInitiatedChannel()

	for {
		select {
		case <-ctx.Done():
			return
		case event := <-bridgeInitiatedChan:
			e.mu.RLock()
			if !e.isRunning {
				e.mu.RUnlock()
				continue
			}
			e.mu.RUnlock()

			if err := e.handleBridgeInitiated(ctx, event); err != nil {
				log.Printf("Error handling BridgeInitiated event: %v", err)
			}
		}
	}
}

// handleBridgeInitiated handles a BridgeInitiated event
func (e *BridgeExecutor) handleBridgeInitiated(ctx context.Context, event domain.BridgeInitiatedEvent) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if _, exists := e.pendingRequests[event.RequestID]; exists {
		return nil
	}
	if event.Amount == nil || event.Amount.Sign() <= 0 || event.SourceChain != e.ethClient.GetChainID(true).Uint64() || event.TargetChain != e.ethClient.GetChainID(false).Uint64() {
		return fmt.Errorf("invalid bridge event")
	}

	log.Printf("Processing BridgeInitiated: requestId=%x, amount=%s, sender=%s",
		event.RequestID[:8], event.Amount.String(), event.Sender)

	// Create bridge request
	request := &domain.BridgeRequest{
		RequestID:   event.RequestID,
		Sender:      event.Sender,
		Recipient:   event.Recipient,
		Token:       event.Token,
		Amount:      event.Amount,
		SourceChain: event.SourceChain,
		TargetChain: event.TargetChain,
		Fee:         event.Fee,
		Status:      domain.StatusPending,
		InitiatedAt: time.Now(),
		Nonce:       event.Nonce, Deadline: event.Deadline, BlockNumber: event.BlockNumber,
	}

	// Persist before execution. Replay reconstructs events after a restart.
	e.pendingRequests[event.RequestID] = request
	if err := e.saveLocked(); err != nil {
		e.isPaused = true
		return err
	}

	log.Printf("Bridge request %x added to pending queue", event.RequestID[:8])

	return nil
}

// processApprovedRequests processes approved requests
func (e *BridgeExecutor) processApprovedRequests(ctx context.Context) {
	requestApprovedChan := e.monitor.GetRequestApprovedChannel()

	for {
		select {
		case <-ctx.Done():
			return
		case event := <-requestApprovedChan:
			e.mu.RLock()
			if !e.isRunning {
				e.mu.RUnlock()
				continue
			}
			e.mu.RUnlock()

			if err := e.handleRequestApproved(ctx, event); err != nil {
				log.Printf("Error handling RequestApproved event: %v", err)
			}
		}
	}
}

// handleRequestApproved handles a RequestApproved event
func (e *BridgeExecutor) handleRequestApproved(ctx context.Context, event domain.RequestApprovedEvent) error {
	// Approval events may arrive before source events. The retry worker always reads authoritative target status.
	e.mu.Lock()
	defer e.mu.Unlock()
	if request, ok := e.pendingRequests[event.RequestID]; ok && request.Status == domain.StatusPending {
		request.Status = domain.StatusApproved
		return e.saveLocked()
	}
	return nil
}

// executeBridgeCompletion executes the completeBridge transaction
func (e *BridgeExecutor) executeBridgeCompletion(ctx context.Context, request *domain.BridgeRequest) error {
	// 1. Create bridge message for signing
	msg := domain.BridgeMessage{
		RequestID:   request.RequestID,
		Sender:      request.Sender,
		Recipient:   request.Recipient,
		Token:       request.Token,
		Amount:      request.Amount,
		SourceChain: request.SourceChain,
		TargetChain: request.TargetChain,
		Nonce:       request.Nonce,
		Deadline:    request.Deadline,
	}

	// 2. Collect MPC signatures
	log.Printf("Collecting MPC signatures for request %x", request.RequestID[:8])
	signatures, err := e.mpcClient.CollectSignatures(ctx, msg)
	if err != nil {
		return fmt.Errorf("failed to collect MPC signatures: %w", err)
	}
	request.Signatures = signatures

	// 3. Encode completeBridge call
	callData, err := e.ethClient.EncodeCompleteBridge(
		request.RequestID,
		request.Sender,
		request.Recipient,
		request.Token,
		request.Amount,
		request.SourceChain,
		request.Nonce,
		request.Deadline,
		signatures,
	)
	if err != nil {
		return fmt.Errorf("failed to encode completeBridge call: %w", err)
	}

	// 4. Send transaction to target chain
	log.Printf("Sending completeBridge transaction for request %x", request.RequestID[:8])
	txHash, err := e.ethClient.SendTransaction(ctx, e.contracts.SecureBridge, callData, big.NewInt(0), false)
	if err != nil {
		return fmt.Errorf("failed to send transaction: %w", err)
	}

	log.Printf("Transaction sent: %s", txHash)
	request.TxHash = txHash
	if err := e.persistRequest(request); err != nil {
		return err
	}

	// 5. Wait for confirmation
	success, err := e.ethClient.WaitForTransaction(ctx, txHash, false)
	if err != nil {
		return fmt.Errorf("failed waiting for transaction: %w", err)
	}

	if !success {
		return fmt.Errorf("transaction %s failed", txHash)
	}

	return nil
}

// processChallenges processes challenge events
func (e *BridgeExecutor) processChallenges(ctx context.Context) {
	challengedChan := e.monitor.GetRequestChallengedChannel()
	resolvedChan := e.monitor.GetChallengeResolvedChannel()

	for {
		select {
		case <-ctx.Done():
			return
		case event := <-challengedChan:
			e.handleRequestChallenged(event)
		case event := <-resolvedChan:
			e.handleChallengeResolved(event)
		}
	}
}

// handleRequestChallenged handles a RequestChallenged event
func (e *BridgeExecutor) handleRequestChallenged(event domain.RequestChallengedEvent) {
	log.Printf("Request %x challenged by %s: %s", event.RequestID[:8], event.Challenger, event.Reason)

	e.mu.Lock()
	defer e.mu.Unlock()

	if request, exists := e.pendingRequests[event.RequestID]; exists {
		request.Status = domain.StatusChallenged
	}
}

// handleChallengeResolved handles a ChallengeResolved event
func (e *BridgeExecutor) handleChallengeResolved(event domain.ChallengeResolvedEvent) {
	log.Printf("Challenge for request %x resolved: success=%v", event.RequestID[:8], event.ChallengeSuccess)

	e.mu.Lock()
	defer e.mu.Unlock()

	if request, exists := e.pendingRequests[event.RequestID]; exists {
		if event.ChallengeSuccess {
			request.Status = domain.StatusRefunded
			// Retain terminal records for durable deduplication.
		} else {
			request.Status = domain.StatusApproved
		}
	}
}

// processEmergencyPause handles emergency pause events
func (e *BridgeExecutor) processEmergencyPause(ctx context.Context) {
	pauseChan := e.monitor.GetEmergencyPauseChannel()

	for {
		select {
		case <-ctx.Done():
			return
		case event := <-pauseChan:
			log.Printf("Emergency pause triggered by %s: %s", event.Guardian, event.Reason)
			e.Pause()
		}
	}
}

// Pause pauses the executor
func (e *BridgeExecutor) Pause() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.isPaused = true
	if err := e.saveLocked(); err != nil {
		log.Printf("Persist pause failed: %v", err)
	}
	log.Println("Bridge executor paused")
}

// Resume resumes the executor
func (e *BridgeExecutor) Resume() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.isPaused = false
	if err := e.saveLocked(); err != nil {
		e.isPaused = true
		log.Printf("Persist resume failed: %v", err)
	}
	log.Println("Bridge executor resumed")
}

// IsPaused returns whether the executor is paused
func (e *BridgeExecutor) IsPaused() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.isPaused
}

// GetPendingRequestCount returns the number of pending requests
func (e *BridgeExecutor) GetPendingRequestCount() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	count := 0
	for _, r := range e.pendingRequests {
		if r.Status != domain.StatusExecuted && r.Status != domain.StatusRefunded && r.Status != domain.StatusCancelled {
			count++
		}
	}
	return count
}

// GetProcessedCount returns the number of processed requests
func (e *BridgeExecutor) GetProcessedCount() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.processedCount
}

// GetFailedCount returns the number of failed requests
func (e *BridgeExecutor) GetFailedCount() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.failedCount
}

// GetPendingRequests returns all pending requests
func (e *BridgeExecutor) GetPendingRequests() []*domain.BridgeRequest {
	e.mu.RLock()
	defer e.mu.RUnlock()

	requests := make([]*domain.BridgeRequest, 0, len(e.pendingRequests))
	for _, req := range e.pendingRequests {
		if req.Status != domain.StatusExecuted && req.Status != domain.StatusRefunded && req.Status != domain.StatusCancelled {
			requests = append(requests, cloneRequest(req))
		}
	}
	return requests
}

// GetRequest returns a specific request by ID
func (e *BridgeExecutor) GetRequest(requestID [32]byte) (*domain.BridgeRequest, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	req, exists := e.pendingRequests[requestID]
	if !exists {
		return nil, false
	}
	return cloneRequest(req), true
}

const verifierABI = `[
 {"type":"function","name":"getRequestStatus","inputs":[{"type":"bytes32"}],"outputs":[{"type":"uint8"}]},
 {"type":"function","name":"canApprove","inputs":[{"type":"bytes32"}],"outputs":[{"type":"bool"}]},
 {"type":"function","name":"approveRequest","inputs":[{"type":"bytes32"}],"outputs":[]},
 {"type":"function","name":"submitRequest","inputs":[{"type":"bytes32"},{"type":"address"},{"type":"address"},{"type":"address"},{"type":"uint256"},{"type":"uint256"},{"type":"uint256"}],"outputs":[{"type":"uint256"}]}
]`

func (e *BridgeExecutor) persistRequest(request *domain.BridgeRequest) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.pendingRequests[request.RequestID] = cloneRequest(request)
	if err := e.saveLocked(); err != nil {
		e.isPaused = true
		return err
	}
	return nil
}
func (e *BridgeExecutor) retryPending(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.mu.RLock()
			running := e.isRunning && !e.isPaused
			e.mu.RUnlock()
			if !running {
				continue
			}
			for _, request := range e.GetPendingRequests() {
				if e.IsPaused() {
					break
				}
				stepCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
				err := e.advance(stepCtx, request)
				cancel()
				if err != nil {
					request.LastError = err.Error()
					log.Printf("Bridge %x awaiting retry: %v", request.RequestID[:8], err)
				} else {
					request.LastError = ""
				}
				if err = e.persistRequest(request); err != nil {
					log.Printf("Bridge persistence failed; paused: %v", err)
					break
				}
			}
		}
	}
}
func (e *BridgeExecutor) advance(ctx context.Context, request *domain.BridgeRequest) error {
	result, err := e.ethClient.ReadContract(ctx, e.contracts.OptimisticVerifier, verifierABI, "getRequestStatus", false, request.RequestID)
	if err != nil {
		return err
	}
	status := domain.RequestStatus(result[0].(uint8))
	if status == domain.StatusExecuted || status == domain.StatusRefunded || status == domain.StatusCancelled {
		if status == domain.StatusExecuted && request.Status != status {
			e.mu.Lock()
			e.processedCount++
			e.mu.Unlock()
		}
		request.Status = status
		return nil
	}
	request.Status = status
	if request.Deadline == 0 || uint64(time.Now().Unix()) > request.Deadline {
		return fmt.Errorf("bridge authorization expired; source refund requires review")
	}
	parsed, err := abi.JSON(strings.NewReader(verifierABI))
	if err != nil {
		return err
	}
	if status == domain.StatusNone {
		if request.RegistrationTxHash != "" {
			ok, err := e.ethClient.WaitForTransaction(ctx, request.RegistrationTxHash, false)
			if err != nil {
				return err
			}
			if !ok {
				return fmt.Errorf("target registration reverted; operator review required")
			}
			return nil
		}
		data, err := parsed.Pack("submitRequest", request.RequestID, common.HexToAddress(request.Sender), common.HexToAddress(request.Recipient), common.HexToAddress(request.Token), request.Amount, new(big.Int).SetUint64(request.SourceChain), new(big.Int).SetUint64(request.TargetChain))
		if err != nil {
			return err
		}
		hash, err := e.ethClient.SendTransaction(ctx, e.contracts.OptimisticVerifier, data, big.NewInt(0), false)
		if err != nil {
			return err
		}
		request.RegistrationTxHash = hash
		return e.persistRequest(request)
	}
	if status == domain.StatusPending {
		if request.ApprovalTxHash != "" {
			ok, err := e.ethClient.WaitForTransaction(ctx, request.ApprovalTxHash, false)
			if err != nil {
				return err
			}
			if !ok {
				return fmt.Errorf("target approval reverted; operator review required")
			}
			return nil
		}
		ready, err := e.ethClient.ReadContract(ctx, e.contracts.OptimisticVerifier, verifierABI, "canApprove", false, request.RequestID)
		if err != nil {
			return err
		}
		if !ready[0].(bool) {
			return nil
		}
		data, err := parsed.Pack("approveRequest", request.RequestID)
		if err != nil {
			return err
		}
		hash, err := e.ethClient.SendTransaction(ctx, e.contracts.OptimisticVerifier, data, big.NewInt(0), false)
		if err != nil {
			return err
		}
		request.ApprovalTxHash = hash
		return e.persistRequest(request)
	}
	if status == domain.StatusChallenged {
		return nil
	}
	if status != domain.StatusApproved {
		return fmt.Errorf("unsupported bridge status")
	}
	if request.TxHash != "" {
		ok, err := e.ethClient.WaitForTransaction(ctx, request.TxHash, false)
		if err != nil {
			return err
		}
		if !ok {
			return fmt.Errorf("bridge completion reverted; operator review required")
		}
		return nil
	}
	return e.executeBridgeCompletion(ctx, request)
}
