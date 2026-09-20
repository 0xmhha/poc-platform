package service

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"time"

	"github.com/stablenet/stable-platform/services/subscription-executor/internal/client"
	"github.com/stablenet/stable-platform/services/subscription-executor/internal/config"
	"github.com/stablenet/stable-platform/services/subscription-executor/internal/logger"
	"github.com/stablenet/stable-platform/services/subscription-executor/internal/model"
	"github.com/stablenet/stable-platform/services/subscription-executor/internal/repository"
)

// ExecutorService handles subscription execution
type ExecutorService struct {
	cfg              *config.Config
	repo             repository.SubscriptionRepository
	log              *logger.Logger
	stopCh           chan struct{}
	bundlerClient    *client.BundlerClient
	paymasterClient  *client.PaymasterClient
	userOpBuilder    *client.UserOpBuilder
	rpcClient        *client.RPCClient
	signer           *client.UserOpSigner
	permissionClient *client.PermissionClient
}

// NewExecutorService creates a new executor service with the given repository
func NewExecutorService(cfg *config.Config, repo repository.SubscriptionRepository, log *logger.Logger) *ExecutorService {
	// Initialize bundler client
	bundlerClient := client.NewBundlerClient(cfg.BundlerURL, cfg.EntryPointAddress)

	// Initialize paymaster client
	paymasterClient := client.NewPaymasterClient(cfg.PaymasterURL)

	// Initialize UserOp builder
	userOpBuilder := client.NewUserOpBuilder(cfg.ChainID, cfg.EntryPointAddress)

	// Initialize RPC client for nonce queries
	rpcClient := client.NewRPCClient(cfg.RPCURL)

	// Initialize permission client
	permissionClient := client.NewPermissionClient(rpcClient, cfg.SubscriptionManagerAddress)

	// Initialize UserOp signer if private key is configured
	var signer *client.UserOpSigner
	if cfg.ExecutorPrivateKey != "" {
		var err error
		signer, err = client.NewUserOpSigner(cfg.ExecutorPrivateKey, int64(cfg.ChainID), cfg.EntryPointAddress)
		if err != nil {
			log.WithError(err).Warn("failed to initialize signer; payment execution is disabled")
		} else {
			log.Info("executor signer initialized", slog.String("address", signer.GetAddress()))
		}
	} else {
		log.Warn("EXECUTOR_PRIVATE_KEY not set; payment execution is disabled")
	}

	return &ExecutorService{
		cfg:              cfg,
		repo:             repo,
		log:              log,
		stopCh:           make(chan struct{}),
		bundlerClient:    bundlerClient,
		paymasterClient:  paymasterClient,
		userOpBuilder:    userOpBuilder,
		rpcClient:        rpcClient,
		signer:           signer,
		permissionClient: permissionClient,
	}
}

// Start begins the subscription polling loop
func (s *ExecutorService) Start(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(s.cfg.PollingInterval) * time.Second)
	defer ticker.Stop()

	cleanupTicker := time.NewTicker(1 * time.Hour)
	defer cleanupTicker.Stop()

	s.log.Info("starting executor service", slog.Int("polling_interval_seconds", s.cfg.PollingInterval))

	for {
		select {
		case <-ctx.Done():
			s.log.Info("executor service stopped due to context cancellation")
			return
		case <-s.stopCh:
			s.log.Info("executor service stopped")
			return
		case <-ticker.C:
			s.processDueSubscriptions(ctx)
		case <-cleanupTicker.C:
			s.cleanupExpiredIdempotencyRecords(ctx)
		}
	}
}

// cleanupExpiredIdempotencyRecords removes expired idempotency records
func (s *ExecutorService) cleanupExpiredIdempotencyRecords(ctx context.Context) {
	deleted, err := s.repo.DeleteExpiredIdempotencyRecords(ctx)
	if err != nil {
		s.log.WithError(err).Error("failed to cleanup expired idempotency records")
		return
	}
	if deleted > 0 {
		s.log.Info("cleaned up expired idempotency records", slog.Int64("deleted", deleted))
	}
}

// Stop stops the executor service
func (s *ExecutorService) Stop() {
	close(s.stopCh)
}

// CreateSubscription creates a new subscription
func (s *ExecutorService) CreateSubscription(ctx context.Context, req *model.CreateSubscriptionRequest) (*model.Subscription, error) {
	amount, ok := new(big.Int).SetString(req.Amount, 10)
	if !ok {
		return nil, fmt.Errorf("invalid amount: %s", req.Amount)
	}

	now := time.Now()
	sub := &model.Subscription{
		ID:             generateID(),
		SmartAccount:   req.SmartAccount,
		Recipient:      req.Recipient,
		Token:          req.Token,
		Amount:         amount,
		Interval:       int64(req.IntervalDays) * 86400,
		NextExecution:  now.Add(time.Duration(req.IntervalDays) * 24 * time.Hour),
		ExecutionCount: 0,
		MaxExecutions:  req.MaxExecutions,
		Status:         model.StatusActive,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	if err := s.repo.Create(ctx, sub); err != nil {
		return nil, fmt.Errorf("failed to save subscription: %w", err)
	}

	s.log.WithSubscription(sub.ID).Info("created subscription", slog.String("account", sub.SmartAccount))
	return sub, nil
}

// GetSubscription returns a subscription by ID
func (s *ExecutorService) GetSubscription(ctx context.Context, id string) (*model.Subscription, error) {
	sub, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get subscription: %w", err)
	}
	if sub == nil {
		return nil, fmt.Errorf("subscription not found: %s", id)
	}
	return sub, nil
}

// GetSubscriptionsByAccount returns all subscriptions for an account
func (s *ExecutorService) GetSubscriptionsByAccount(ctx context.Context, account string) ([]*model.Subscription, error) {
	subs, err := s.repo.GetByAccount(ctx, account)
	if err != nil {
		return nil, fmt.Errorf("failed to get subscriptions: %w", err)
	}
	return subs, nil
}

// CancelSubscription cancels a subscription
func (s *ExecutorService) CancelSubscription(ctx context.Context, id string) error {
	if err := s.repo.UpdateStatus(ctx, id, model.StatusCancelled); err != nil {
		return fmt.Errorf("failed to cancel subscription: %w", err)
	}
	s.log.WithSubscription(id).Info("cancelled subscription")
	return nil
}

// PauseSubscription pauses a subscription
func (s *ExecutorService) PauseSubscription(ctx context.Context, id string) error {
	if err := s.repo.UpdateStatus(ctx, id, model.StatusPaused); err != nil {
		return fmt.Errorf("failed to pause subscription: %w", err)
	}
	s.log.WithSubscription(id).Info("paused subscription")
	return nil
}

// ResumeSubscription resumes a paused subscription
func (s *ExecutorService) ResumeSubscription(ctx context.Context, id string) error {
	sub, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get subscription: %w", err)
	}
	if sub == nil {
		return fmt.Errorf("subscription not found: %s", id)
	}
	if sub.Status != model.StatusPaused {
		return fmt.Errorf("subscription is not paused: %s", id)
	}

	if err := s.repo.UpdateStatus(ctx, id, model.StatusActive); err != nil {
		return fmt.Errorf("failed to resume subscription: %w", err)
	}
	s.log.WithSubscription(id).Info("resumed subscription")
	return nil
}

// processDueSubscriptions processes all subscriptions that are due
func (s *ExecutorService) processDueSubscriptions(ctx context.Context) {
	// Use GetDueSubscriptions for read-only check
	// In production, consider using GetDueSubscriptionsWithLock for concurrent workers
	dueSubscriptions, err := s.repo.GetDueSubscriptions(ctx, 100)
	if err != nil {
		s.log.WithError(err).Error("failed to get due subscriptions")
		return
	}

	if len(dueSubscriptions) == 0 {
		return
	}

	s.log.Info("found due subscriptions", slog.Int("count", len(dueSubscriptions)))

	for _, sub := range dueSubscriptions {
		if err := s.executeSubscription(ctx, sub); err != nil {
			s.log.WithSubscription(sub.ID).WithError(err).Error("failed to execute subscription")
		}
	}
}

// executeSubscription executes a single subscription payment
func (s *ExecutorService) executeSubscription(ctx context.Context, sub *model.Subscription) error {
	s.log.WithSubscription(sub.ID).Info("executing subscription", slog.String("account", sub.SmartAccount))

	// Reconcile pending submissions before creating another operation, including after restart.
	records, err := s.repo.GetExecutionRecords(ctx, sub.ID, 100)
	if err != nil {
		return err
	}
	for _, record := range records {
		if record.Status == "pending" {
			if record.UserOpHash == "" {
				return fmt.Errorf("pending execution has no broadcast journal; manual reconciliation required")
			}
			receipt, err := s.bundlerClient.WaitForReceipt(ctx, record.UserOpHash, 60*time.Second)
			if err != nil {
				return err
			}
			var id int64
			fmt.Sscanf(record.ID, "%d", &id)
			if !receipt.Success {
				return s.repo.UpdateExecutionRecord(ctx, id, "failed", receipt.Receipt.TransactionHash, receipt.Reason, "")
			}
			gas, err := parseRPCQuantity(receipt.ActualGasUsed)
			if err != nil || !gas.IsUint64() {
				return fmt.Errorf("invalid receipt gas")
			}
			return s.repo.FinalizeExecution(ctx, id, receipt.Receipt.TransactionHash, gas.Uint64())
		}
	}

	// Validate ERC-7715 permission before execution
	if sub.PermissionID != "" && s.permissionClient != nil {
		hasPermission, err := s.permissionClient.IsPermissionValid(ctx, sub.PermissionID)
		if err != nil {
			return fmt.Errorf("permission check failed: %w", err)
		} else if !hasPermission {
			s.log.WithSubscription(sub.ID).Warn("permission revoked or expired")
			sub.Status = model.StatusPermissionRevoked
			sub.UpdatedAt = time.Now()
			if updateErr := s.repo.Update(ctx, sub); updateErr != nil {
				s.log.WithSubscription(sub.ID).WithError(updateErr).Error("failed to update subscription status")
			}
			return fmt.Errorf("subscription %s: permission revoked or expired", sub.ID)
		}
	}

	// Create execution record — unique partial index on (subscription_id) WHERE status='pending'
	// prevents duplicate concurrent executions for the same subscription
	record := &model.ExecutionRecord{
		SubscriptionID: sub.ID,
		Status:         "pending",
		CreatedAt:      time.Now(),
	}
	if err := s.repo.CreateExecutionRecord(ctx, record); err != nil {
		s.log.WithSubscription(sub.ID).Info("skipping duplicate execution", slog.String("reason", err.Error()))
		return nil
	}

	// Parse record ID for updates
	var recordID int64
	if record.ID != "" {
		fmt.Sscanf(record.ID, "%d", &recordID)
	}

	// Execute UserOperation
	prepared := false
	txHash, gasUsed, err := s.submitUserOperation(ctx, sub, func(hash string) error {
		if err := s.repo.SaveExecutionUserOpHash(ctx, recordID, hash); err != nil {
			return err
		}
		prepared = true
		return nil
	})
	if err != nil {
		// Update record as failed
		if recordID > 0 && !prepared {
			s.updateExecutionRecord(ctx, recordID, "failed", "", 0, err.Error())
		}
		return fmt.Errorf("failed to submit user operation: %w", err)
	}

	return s.repo.FinalizeExecution(ctx, recordID, txHash, gasUsed)
}

// submitUserOperation builds and submits a UserOperation for a subscription payment
func (s *ExecutorService) submitUserOperation(ctx context.Context, sub *model.Subscription, journal func(string) error) (string, uint64, error) {
	if s.signer == nil {
		return "", 0, fmt.Errorf("executor signer is not configured")
	}
	chainID := fmt.Sprintf("0x%x", s.cfg.ChainID)

	// 1. Get nonce from EntryPoint
	nonce, err := s.rpcClient.GetNonce(ctx, sub.SmartAccount, s.cfg.EntryPointAddress)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get nonce: %w", err)
	}
	nonceInt, err := parseRPCQuantity(nonce)
	if err != nil {
		return "", 0, err
	}

	// 2. Build UserOperation
	userOp := s.userOpBuilder.CreateUserOperation(
		sub.SmartAccount,
		nonceInt,
		sub.Token,
		sub.Recipient,
		sub.Amount,
	)

	// 3. Get gas prices
	gasPrice, err := s.rpcClient.GetGasPrice(ctx)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get gas price: %w", err)
	}
	maxPriorityFee, err := s.rpcClient.GetMaxPriorityFeePerGas(ctx)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get priority fee: %w", err)
	}

	gasPriceInt, err := parseRPCQuantity(gasPrice)
	if err != nil {
		return "", 0, err
	}
	maxPriorityFeeInt, err := parseRPCQuantity(maxPriorityFee)
	if err != nil {
		return "", 0, err
	}

	// Set gas fees (maxPriorityFeePerGas || maxFeePerGas)
	userOp.GasFees = client.PackGasFees(maxPriorityFeeInt, gasPriceInt)

	// 4. Get paymaster stub data for gas estimation
	stubReq := &client.PaymasterStubDataRequest{
		Sender:   userOp.Sender,
		Nonce:    userOp.Nonce,
		InitCode: userOp.InitCode,
		CallData: userOp.CallData,
	}
	stubData, err := s.paymasterClient.GetPaymasterStubData(ctx, stubReq, chainID, s.cfg.EntryPointAddress)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get paymaster stub data: %w", err)
	}

	// Set stub paymaster data for gas estimation
	pmVerifyGas, err := parseRPCQuantity(stubData.PaymasterVerificationGasLimit)
	if err != nil {
		return "", 0, err
	}
	pmPostOpGas, err := parseRPCQuantity(stubData.PaymasterPostOpGasLimit)
	if err != nil {
		return "", 0, err
	}
	userOp.PaymasterAndData = client.PackPaymasterAndData(
		stubData.Paymaster,
		pmVerifyGas,
		pmPostOpGas,
		stubData.PaymasterData,
	)

	// 5. Estimate gas via bundler
	// Use a dummy signature for estimation (65 bytes of 0x01)
	userOp.Signature = "0x" + fmt.Sprintf("%0130x", 1)
	gasEstimate, err := s.bundlerClient.EstimateUserOperationGas(ctx, userOp)
	if err != nil {
		return "", 0, fmt.Errorf("failed to estimate gas: %w", err)
	}

	// 6. Set estimated gas limits
	verifyGas, err := parseRPCQuantity(gasEstimate.VerificationGasLimit)
	if err != nil {
		return "", 0, err
	}
	callGas, err := parseRPCQuantity(gasEstimate.CallGasLimit)
	if err != nil {
		return "", 0, err
	}
	preVerifyGas, err := parseRPCQuantity(gasEstimate.PreVerificationGas)
	if err != nil {
		return "", 0, err
	}

	userOp.AccountGasLimits = client.PackAccountGasLimits(verifyGas, callGas)
	userOp.PreVerificationGas = fmt.Sprintf("0x%x", preVerifyGas)

	// 7. Get final paymaster data with signature
	pmDataReq := &client.PaymasterDataRequest{
		Sender:             userOp.Sender,
		Nonce:              userOp.Nonce,
		InitCode:           userOp.InitCode,
		CallData:           userOp.CallData,
		AccountGasLimits:   userOp.AccountGasLimits,
		PreVerificationGas: userOp.PreVerificationGas,
		GasFees:            userOp.GasFees,
	}
	pmData, err := s.paymasterClient.GetPaymasterData(ctx, pmDataReq, chainID, s.cfg.EntryPointAddress)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get paymaster data: %w", err)
	}

	// Update paymaster data with final signature
	finalPmVerifyGas := pmVerifyGas
	finalPmPostOpGas := pmPostOpGas
	if pmData.PaymasterVerificationGasLimit != "" {
		finalPmVerifyGas, err = parseRPCQuantity(pmData.PaymasterVerificationGasLimit)
		if err != nil {
			return "", 0, err
		}
	}
	if pmData.PaymasterPostOpGasLimit != "" {
		finalPmPostOpGas, err = parseRPCQuantity(pmData.PaymasterPostOpGasLimit)
		if err != nil {
			return "", 0, err
		}
	}
	userOp.PaymasterAndData = client.PackPaymasterAndData(
		pmData.Paymaster,
		finalPmVerifyGas,
		finalPmPostOpGas,
		pmData.PaymasterData,
	)

	// 8. A real configured signer is required for submission.
	signature, err := s.signer.SignUserOp(userOp)
	if err != nil {
		return "", 0, fmt.Errorf("failed to sign userOp: %w", err)
	}
	userOp.Signature = signature

	// Journal the deterministic hash BEFORE the network call. Lost acknowledgments
	// remain pending and cannot trigger a second payment with a new nonce.
	expectedHash, err := s.signer.UserOpHash(userOp)
	if err != nil {
		return "", 0, err
	}
	if err = journal(expectedHash); err != nil {
		return "", 0, err
	}

	// 9. Submit to bundler
	userOpHash, err := s.bundlerClient.SendUserOperation(ctx, userOp)
	if err != nil {
		return "", 0, fmt.Errorf("failed to send user operation: %w", err)
	}
	if !strings.EqualFold(userOpHash, expectedHash) {
		return "", 0, fmt.Errorf("bundler returned mismatched operation hash")
	}
	s.log.Info("UserOperation submitted", slog.String("userOpHash", userOpHash))

	// 10. Wait for receipt
	receipt, err := s.bundlerClient.WaitForReceipt(ctx, userOpHash, 60*time.Second)
	if err != nil {
		return "", 0, fmt.Errorf("failed to get receipt: %w", err)
	}

	if !receipt.Success {
		return "", 0, fmt.Errorf("user operation failed: %s", receipt.Reason)
	}

	// Parse gas used
	gasUsed := uint64(0)
	if receipt.ActualGasUsed != "" {
		gasUsedInt, err := parseRPCQuantity(receipt.ActualGasUsed)
		if err != nil {
			return "", 0, err
		}
		gasUsed = gasUsedInt.Uint64()
	}

	return receipt.Receipt.TransactionHash, gasUsed, nil
}

// updateExecutionRecord updates an execution record with the result
func (s *ExecutorService) updateExecutionRecord(ctx context.Context, recordID int64, status string, txHash string, gasUsed uint64, errMsg string) {
	gasUsedStr := ""
	if gasUsed > 0 {
		gasUsedStr = fmt.Sprintf("%d", gasUsed)
	}

	if err := s.repo.UpdateExecutionRecord(ctx, recordID, status, txHash, errMsg, gasUsedStr); err != nil {
		s.log.WithError(err).Error("failed to update execution record",
			slog.Int64("record_id", recordID),
			slog.String("status", status),
		)
	}
}

// generateID generates a unique ID
func generateID() string {
	return fmt.Sprintf("sub_%d", time.Now().UnixNano())
}

// Reject malformed external JSON-RPC quantities instead of slicing or silently using zero.
func parseRPCQuantity(value string) (*big.Int, error) {
	if !strings.HasPrefix(value, "0x") || len(value) <= 2 {
		return nil, fmt.Errorf("invalid RPC quantity")
	}
	number, ok := new(big.Int).SetString(value[2:], 16)
	if !ok || number.Sign() < 0 || number.BitLen() > 256 {
		return nil, fmt.Errorf("invalid RPC quantity")
	}
	return number, nil
}
func (s *ExecutorService) Ready() error {
	if s.signer == nil {
		return fmt.Errorf("executor signer is not configured")
	}
	return nil
}
