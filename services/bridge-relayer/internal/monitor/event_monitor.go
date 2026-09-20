package monitor

import (
	"context"
	"github.com/ethereum/go-ethereum/crypto"
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/config"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/ethereum"
)

// EventMonitor monitors blockchain events for bridge operations
type EventMonitor struct {
	ethClient          *ethereum.Client
	contracts          config.ContractConfig
	pollInterval       time.Duration
	blockConfirmations uint64
	maxBlockRange      uint64
	retryAttempts      int
	retryDelay         time.Duration

	// Event channels
	bridgeInitiated   chan domain.BridgeInitiatedEvent
	requestApproved   chan domain.RequestApprovedEvent
	requestChallenged chan domain.RequestChallengedEvent
	challengeResolved chan domain.ChallengeResolvedEvent
	emergencyPause    chan domain.EmergencyPauseEvent

	// State
	mu                  sync.RWMutex
	lastProcessedBlock  uint64
	lastOptimisticBlock uint64
	lastGuardianBlock   uint64
	isRunning           bool
	isPaused            bool
}

// NewEventMonitor creates a new event monitor
func NewEventMonitor(ethClient *ethereum.Client, cfg config.MonitorConfig, contracts config.ContractConfig) *EventMonitor {
	if contracts.SourceBridge == "" {
		contracts.SourceBridge = contracts.SecureBridge
	}
	if cfg.MaxBlockRange == 0 {
		cfg.MaxBlockRange = 1000
	}
	if cfg.PollInterval <= 0 {
		cfg.PollInterval = 5 * time.Second
	}
	return &EventMonitor{
		lastProcessedBlock: cfg.StartBlock, lastOptimisticBlock: cfg.TargetStartBlock, lastGuardianBlock: cfg.TargetStartBlock,
		ethClient:          ethClient,
		contracts:          contracts,
		pollInterval:       cfg.PollInterval,
		blockConfirmations: cfg.BlockConfirmations,
		maxBlockRange:      cfg.MaxBlockRange,
		retryAttempts:      cfg.RetryAttempts,
		retryDelay:         cfg.RetryDelay,
		bridgeInitiated:    make(chan domain.BridgeInitiatedEvent, 100),
		requestApproved:    make(chan domain.RequestApprovedEvent, 100),
		requestChallenged:  make(chan domain.RequestChallengedEvent, 100),
		challengeResolved:  make(chan domain.ChallengeResolvedEvent, 100),
		emergencyPause:     make(chan domain.EmergencyPauseEvent, 10),
	}
}

// Start starts the event monitor
func (m *EventMonitor) Start(ctx context.Context) error {
	m.mu.Lock()
	if m.isRunning {
		m.mu.Unlock()
		return nil
	}
	m.isRunning = true
	m.mu.Unlock()

	log.Println("Starting event monitor...")

	// Start monitoring goroutines
	go m.monitorSourceChain(ctx)
	go m.monitorOptimisticVerifier(ctx)
	go m.monitorGuardian(ctx)

	return nil
}

// Stop stops the event monitor
func (m *EventMonitor) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.isRunning = false
	log.Println("Event monitor stopped")
}

// monitorSourceChain monitors the source chain for BridgeInitiated events
func (m *EventMonitor) monitorSourceChain(ctx context.Context) {
	ticker := time.NewTicker(m.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.mu.RLock()
			if !m.isRunning || m.isPaused {
				m.mu.RUnlock()
				continue
			}
			m.mu.RUnlock()

			if err := m.processSourceChainEvents(ctx); err != nil {
				log.Printf("Error processing source chain events: %v", err)
			}
		}
	}
}

// processSourceChainEvents processes BridgeInitiated events from the source chain
func (m *EventMonitor) processSourceChainEvents(ctx context.Context) error {
	latestBlock, err := m.ethClient.GetLatestBlock(ctx, true)
	if err != nil {
		return err
	}

	// Apply confirmations
	if latestBlock < m.blockConfirmations {
		return nil
	}
	confirmedBlock := latestBlock - m.blockConfirmations
	m.mu.RLock()
	last := m.lastProcessedBlock
	m.mu.RUnlock()
	if confirmedBlock <= last {
		return nil
	}

	fromBlock := last + 1
	toBlock := confirmedBlock

	// Limit block range
	if toBlock-fromBlock > m.maxBlockRange {
		toBlock = fromBlock + m.maxBlockRange
	}

	log.Printf("Processing blocks %d to %d for BridgeInitiated events", fromBlock, toBlock)

	logs, err := m.ethClient.FilterLogs(ctx, m.contracts.SourceBridge, fromBlock, toBlock, true)
	if err != nil {
		return err
	}
	topic := crypto.Keccak256Hash([]byte("BridgeInitiated(bytes32,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256)"))
	for _, entry := range logs {
		if len(entry.Topics) > 0 && entry.Topics[0] == topic {
			if err = m.dispatchBridge(ctx, entry); err != nil {
				return err
			}
		}
	}

	m.mu.Lock()
	m.lastProcessedBlock = toBlock
	m.mu.Unlock()

	return nil
}

// monitorOptimisticVerifier monitors the optimistic verifier for approval events
func (m *EventMonitor) monitorOptimisticVerifier(ctx context.Context) {
	ticker := time.NewTicker(m.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.mu.RLock()
			if !m.isRunning || m.isPaused {
				m.mu.RUnlock()
				continue
			}
			m.mu.RUnlock()

			if err := m.processOptimisticEvents(ctx); err != nil {
				log.Printf("Error processing optimistic verifier events: %v", err)
			}
		}
	}
}

// processOptimisticEvents processes events from the OptimisticVerifier
func (m *EventMonitor) processOptimisticEvents(ctx context.Context) error {
	m.mu.RLock()
	last := m.lastOptimisticBlock
	m.mu.RUnlock()
	next, err := m.controlLogs(ctx, m.contracts.OptimisticVerifier, last)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.lastOptimisticBlock = next
	m.mu.Unlock()
	return nil
}

// monitorGuardian monitors the guardian contract for emergency events
func (m *EventMonitor) monitorGuardian(ctx context.Context) {
	ticker := time.NewTicker(m.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.mu.RLock()
			if !m.isRunning {
				m.mu.RUnlock()
				continue
			}
			m.mu.RUnlock()

			if err := m.processGuardianEvents(ctx); err != nil {
				log.Printf("Error processing guardian events: %v", err)
			}
		}
	}
}

// processGuardianEvents processes events from the BridgeGuardian
func (m *EventMonitor) processGuardianEvents(ctx context.Context) error {
	m.mu.RLock()
	last := m.lastGuardianBlock
	m.mu.RUnlock()
	next, err := m.controlLogs(ctx, m.contracts.BridgeGuardian, last)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.lastGuardianBlock = next
	m.mu.Unlock()
	return nil
}

// GetBridgeInitiatedChannel returns the channel for BridgeInitiated events
func (m *EventMonitor) GetBridgeInitiatedChannel() <-chan domain.BridgeInitiatedEvent {
	return m.bridgeInitiated
}

// GetRequestApprovedChannel returns the channel for RequestApproved events
func (m *EventMonitor) GetRequestApprovedChannel() <-chan domain.RequestApprovedEvent {
	return m.requestApproved
}

// GetRequestChallengedChannel returns the channel for RequestChallenged events
func (m *EventMonitor) GetRequestChallengedChannel() <-chan domain.RequestChallengedEvent {
	return m.requestChallenged
}

// GetChallengeResolvedChannel returns the channel for ChallengeResolved events
func (m *EventMonitor) GetChallengeResolvedChannel() <-chan domain.ChallengeResolvedEvent {
	return m.challengeResolved
}

// GetEmergencyPauseChannel returns the channel for EmergencyPause events
func (m *EventMonitor) GetEmergencyPauseChannel() <-chan domain.EmergencyPauseEvent {
	return m.emergencyPause
}

// Pause pauses the event monitor
func (m *EventMonitor) Pause() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.isPaused = true
	log.Println("Event monitor paused")
}

// Resume resumes the event monitor
func (m *EventMonitor) Resume() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.isPaused = false
	log.Println("Event monitor resumed")
}

// IsPaused returns whether the monitor is paused
func (m *EventMonitor) IsPaused() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.isPaused
}

// GetLastProcessedBlock returns the last processed block number
func (m *EventMonitor) GetLastProcessedBlock() uint64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.lastProcessedBlock
}

// SetLastProcessedBlock sets the last processed block number
func (m *EventMonitor) SetLastProcessedBlock(blockNumber uint64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastProcessedBlock = blockNumber
}

// SimulateBridgeInitiated simulates a BridgeInitiated event for testing
func (m *EventMonitor) SimulateBridgeInitiated(event domain.BridgeInitiatedEvent) {
	select {
	case m.bridgeInitiated <- event:
	default:
		log.Println("Warning: BridgeInitiated channel full, event dropped")
	}
}

// SimulateRequestApproved simulates a RequestApproved event for testing
func (m *EventMonitor) SimulateRequestApproved(event domain.RequestApprovedEvent) {
	select {
	case m.requestApproved <- event:
	default:
		log.Println("Warning: RequestApproved channel full, event dropped")
	}
}

// CreateBridgeInitiatedEvent creates a BridgeInitiatedEvent from raw data
func CreateBridgeInitiatedEvent(
	requestID [32]byte,
	sender, recipient, token string,
	amount *big.Int,
	sourceChain, targetChain uint64,
	fee *big.Int,
) domain.BridgeInitiatedEvent {
	return domain.BridgeInitiatedEvent{
		RequestID:   requestID,
		Sender:      sender,
		Recipient:   recipient,
		Token:       token,
		Amount:      amount,
		SourceChain: sourceChain,
		TargetChain: targetChain,
		Fee:         fee,
	}
}

// SyncStatus reports observed progress against finalized chain heads. RPC failure is not healthy.
func (m *EventMonitor) SyncStatus(ctx context.Context) (bool, bool) {
	source, err := m.ethClient.GetLatestBlock(ctx, true)
	if err != nil {
		return false, false
	}
	target, err := m.ethClient.GetLatestBlock(ctx, false)
	if err != nil {
		return false, false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	if !m.isRunning || source < m.blockConfirmations || target < m.blockConfirmations {
		return false, false
	}
	return m.lastProcessedBlock >= source-m.blockConfirmations, m.lastOptimisticBlock >= target-m.blockConfirmations && m.lastGuardianBlock >= target-m.blockConfirmations
}
