package executor

import (
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/config"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/ethereum"
	"math/big"
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func testExecutor(t *testing.T) *BridgeExecutor {
	t.Helper()
	client, err := ethereum.NewClient(config.EthereumConfig{SourceRPCURL: "http://127.0.0.1:1", TargetRPCURL: "http://127.0.0.1:2", SourceChainID: 1, TargetChainID: 2})
	if err != nil {
		t.Fatal(err)
	}
	return NewBridgeExecutor(client, nil, nil, config.ContractConfig{SecureBridge: "0x1111111111111111111111111111111111111111"}, nil)
}
func unlock(e *BridgeExecutor) {
	if e.stateLock != nil {
		syscall.Flock(int(e.stateLock.Fd()), syscall.LOCK_UN)
		e.stateLock.Close()
		e.stateLock = nil
	}
}
func TestJournalRestartsAndLocksConcurrentRelayers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.json")
	e := testExecutor(t)
	defer unlock(e)
	if err := e.EnablePersistence(path); err != nil {
		t.Fatal(err)
	}
	other := testExecutor(t)
	if err := other.EnablePersistence(path); err == nil {
		t.Fatal("concurrent writer acquired journal")
	}
	id := [32]byte{1}
	e.pendingRequests[id] = &domain.BridgeRequest{RequestID: id, Amount: big.NewInt(100), Status: domain.StatusPending, TxHash: "0xsubmitted"}
	if err := e.saveLocked(); err != nil {
		t.Fatal(err)
	}
	unlock(e)
	if err := other.EnablePersistence(path); err != nil {
		t.Fatal(err)
	}
	defer unlock(other)
	if other.pendingRequests[id].TxHash != "0xsubmitted" {
		t.Fatal("pending transaction was lost")
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("journal permissions not private")
	}
}
func TestCorruptJournalFailsClosed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bridge.json")
	os.WriteFile(path, []byte("broken"), 0600)
	if err := testExecutor(t).EnablePersistence(path); err == nil {
		t.Fatal("silently reset corrupt journal")
	}
}
