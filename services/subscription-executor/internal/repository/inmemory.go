package repository

import (
	"context"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/stablenet/stable-platform/services/subscription-executor/internal/model"
)

// InMemoryRepository implements SubscriptionRepository using in-memory storage
// Use this for development and testing only
type InMemoryRepository struct {
	subscriptions    map[string]*model.Subscription
	executionRecords map[string][]*model.ExecutionRecord
	idempotencyKeys  map[string]*model.IdempotencyRecord
	mu               sync.RWMutex
	recordIDCounter  int64
}

// NewInMemoryRepository creates a new in-memory repository
func NewInMemoryRepository() *InMemoryRepository {
	return &InMemoryRepository{
		subscriptions:    make(map[string]*model.Subscription),
		executionRecords: make(map[string][]*model.ExecutionRecord),
		idempotencyKeys:  make(map[string]*model.IdempotencyRecord),
	}
}

func (r *InMemoryRepository) Create(ctx context.Context, sub *model.Subscription) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.subscriptions[sub.ID] = sub
	return nil
}

func (r *InMemoryRepository) GetByID(ctx context.Context, id string) (*model.Subscription, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	sub, exists := r.subscriptions[id]
	if !exists {
		return nil, nil
	}
	return sub, nil
}

func (r *InMemoryRepository) GetByAccount(ctx context.Context, account string) ([]*model.Subscription, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*model.Subscription
	for _, sub := range r.subscriptions {
		if sub.SmartAccount == account {
			result = append(result, sub)
		}
	}
	return result, nil
}

func (r *InMemoryRepository) Update(ctx context.Context, sub *model.Subscription) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.subscriptions[sub.ID]; !exists {
		return fmt.Errorf("subscription not found: %s", sub.ID)
	}
	r.subscriptions[sub.ID] = sub
	return nil
}

func (r *InMemoryRepository) UpdateStatus(ctx context.Context, id string, status model.SubscriptionStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	sub, exists := r.subscriptions[id]
	if !exists {
		return fmt.Errorf("subscription not found: %s", id)
	}
	sub.Status = status
	sub.UpdatedAt = time.Now()
	return nil
}

func (r *InMemoryRepository) GetDueSubscriptions(ctx context.Context, limit int) ([]*model.Subscription, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*model.Subscription
	now := time.Now()
	for _, sub := range r.subscriptions {
		if sub.Status == model.StatusActive &&
			now.After(sub.NextExecution) &&
			(sub.MaxExecutions == 0 || sub.ExecutionCount < sub.MaxExecutions) {
			result = append(result, sub)
			if len(result) >= limit {
				break
			}
		}
	}
	return result, nil
}

func (r *InMemoryRepository) GetDueSubscriptionsWithLock(ctx context.Context, limit int) ([]*model.Subscription, error) {
	// In-memory doesn't support locking, just return same as GetDueSubscriptions
	return r.GetDueSubscriptions(ctx, limit)
}

func (r *InMemoryRepository) CreateExecutionRecord(ctx context.Context, record *model.ExecutionRecord) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Enforce unique pending execution per subscription (mirrors DB partial unique index)
	if record.Status == "pending" {
		for _, rec := range r.executionRecords[record.SubscriptionID] {
			if rec.Status == "pending" {
				return fmt.Errorf("duplicate pending execution for subscription: %s", record.SubscriptionID)
			}
		}
	}

	r.recordIDCounter++
	record.ID = fmt.Sprintf("%d", r.recordIDCounter)
	r.executionRecords[record.SubscriptionID] = append(r.executionRecords[record.SubscriptionID], record)
	return nil
}

func (r *InMemoryRepository) UpdateExecutionRecord(ctx context.Context, id int64, status, txHash, errMsg string, gasUsed string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	idStr := fmt.Sprintf("%d", id)
	for _, records := range r.executionRecords {
		for _, record := range records {
			if record.ID == idStr {
				record.Status = status
				record.TxHash = txHash
				record.Error = errMsg
				return nil
			}
		}
	}
	return fmt.Errorf("execution record not found: %d", id)
}

func (r *InMemoryRepository) GetExecutionRecords(ctx context.Context, subscriptionID string, limit int) ([]*model.ExecutionRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	records := r.executionRecords[subscriptionID]
	result := make([]*model.ExecutionRecord, 0)
	for i := len(records) - 1; i >= 0 && len(result) < limit; i-- {
		copy := *records[i]
		result = append(result, &copy)
	}
	return result, nil
}

func (r *InMemoryRepository) GetIdempotencyRecord(ctx context.Context, key, method, path string) (*model.IdempotencyRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	compositeKey := key + "|" + method + "|" + path
	rec, exists := r.idempotencyKeys[compositeKey]
	if !exists {
		return nil, nil
	}
	if time.Now().After(rec.ExpiresAt) {
		return nil, nil
	}
	return rec, nil
}

func (r *InMemoryRepository) SaveIdempotencyRecord(ctx context.Context, record *model.IdempotencyRecord) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	compositeKey := record.Key + "|" + record.Method + "|" + record.Path
	// First-writer-wins: do not overwrite existing record
	if _, exists := r.idempotencyKeys[compositeKey]; exists {
		return nil
	}
	r.idempotencyKeys[compositeKey] = record
	return nil
}

func (r *InMemoryRepository) DeleteExpiredIdempotencyRecords(ctx context.Context) (int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var deleted int64
	now := time.Now()
	for k, rec := range r.idempotencyKeys {
		if now.After(rec.ExpiresAt) {
			delete(r.idempotencyKeys, k)
			deleted++
		}
	}
	return deleted, nil
}

func (r *InMemoryRepository) Ping(ctx context.Context) error {
	return nil
}

func (r *InMemoryRepository) Close() {
	// No-op for in-memory
}

func (r *InMemoryRepository) SaveExecutionUserOpHash(ctx context.Context, id int64, hash string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, records := range r.executionRecords {
		for _, record := range records {
			if record.ID == fmt.Sprint(id) && record.Status == "pending" && (record.UserOpHash == "" || record.UserOpHash == hash) {
				record.UserOpHash = hash
				return nil
			}
		}
	}
	return fmt.Errorf("pending execution not found")
}
func (r *InMemoryRepository) FinalizeExecution(ctx context.Context, id int64, txHash string, gasUsed uint64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, records := range r.executionRecords {
		for _, record := range records {
			if record.ID != fmt.Sprint(id) {
				continue
			}
			if record.Status == "success" {
				return nil
			}
			if record.Status != "pending" {
				return fmt.Errorf("execution is not pending")
			}
			sub := r.subscriptions[record.SubscriptionID]
			if sub == nil {
				return fmt.Errorf("subscription not found")
			}
			now := time.Now()
			sub.LastExecution = &now
			sub.ExecutionCount++
			sub.NextExecution = now.Add(time.Duration(sub.Interval) * time.Second)
			sub.UpdatedAt = now
			if sub.MaxExecutions > 0 && sub.ExecutionCount >= sub.MaxExecutions {
				sub.Status = model.StatusExpired
			}
			record.Status = "success"
			record.TxHash = txHash
			record.GasUsed = new(big.Int).SetUint64(gasUsed)
			record.Error = ""
			return nil
		}
	}
	return fmt.Errorf("execution not found")
}
