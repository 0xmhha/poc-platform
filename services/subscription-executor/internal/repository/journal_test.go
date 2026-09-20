package repository

import (
	"context"
	"github.com/stablenet/stable-platform/services/subscription-executor/internal/model"
	"sync"
	"testing"
	"time"
)

func TestPendingJournalAndConcurrentFinalization(t *testing.T) {
	ctx := context.Background()
	r := NewInMemoryRepository()
	sub := &model.Subscription{ID: "sub", Status: model.StatusActive, Interval: 3600, MaxExecutions: 2}
	r.Create(ctx, sub)
	record := &model.ExecutionRecord{SubscriptionID: sub.ID, Status: "pending", CreatedAt: time.Now()}
	if err := r.CreateExecutionRecord(ctx, record); err != nil {
		t.Fatal(err)
	}
	if err := r.SaveExecutionUserOpHash(ctx, 1, "0xoperation"); err != nil {
		t.Fatal(err)
	}
	if err := r.CreateExecutionRecord(ctx, &model.ExecutionRecord{SubscriptionID: sub.ID, Status: "pending"}); err == nil {
		t.Fatal("duplicate payment allowed")
	}
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := r.FinalizeExecution(ctx, 1, "0xtransaction", 123); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	got, _ := r.GetByID(ctx, sub.ID)
	if got.ExecutionCount != 1 {
		t.Fatal("period advanced more than once")
	}
	records, _ := r.GetExecutionRecords(ctx, sub.ID, 1)
	if records[0].UserOpHash != "0xoperation" || records[0].TxHash != "0xtransaction" || records[0].GasUsed.Uint64() != 123 {
		t.Fatal("receipt identity lost")
	}
}
