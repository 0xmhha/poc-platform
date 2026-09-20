package executor

import (
	"encoding/json"
	"fmt"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
	"math/big"
	"os"
	"path/filepath"
	"syscall"
)

type persistedState struct {
	Version   int
	Chain     string
	Requests  []*domain.BridgeRequest
	Processed int
	Failed    int
	Paused    bool
}

func (e *BridgeExecutor) stateIdentity() string {
	return fmt.Sprintf("%s:%s:%s:%s", e.ethClient.GetChainID(true), e.ethClient.GetChainID(false), e.contracts.SecureBridge, e.contracts.SourceBridge)
}
func (e *BridgeExecutor) EnablePersistence(path string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if path == "" {
		return fmt.Errorf("bridge state file is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	if e.stateLock != nil {
		return fmt.Errorf("persistence already enabled")
	}
	lock, err := os.OpenFile(path+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		return fmt.Errorf("bridge journal already in use: %w", err)
	}
	keep := false
	defer func() {
		if !keep {
			syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
			lock.Close()
		}
	}()
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if err == nil {
		var state persistedState
		if err = json.Unmarshal(data, &state); err != nil {
			return err
		}
		if state.Version != 1 || state.Chain != e.stateIdentity() {
			return fmt.Errorf("bridge state identity does not match configuration")
		}
		for _, request := range state.Requests {
			if request == nil || request.Amount == nil {
				return fmt.Errorf("invalid bridge state")
			}
			e.pendingRequests[request.RequestID] = request
		}
		e.processedCount = state.Processed
		e.failedCount = state.Failed
		e.isPaused = state.Paused
	}
	e.statePath = path
	if err := e.saveLocked(); err != nil {
		return err
	}
	e.stateLock = lock
	keep = true
	return nil
}
func (e *BridgeExecutor) saveLocked() error {
	if e.statePath == "" {
		return nil
	}
	state := persistedState{Version: 1, Chain: e.stateIdentity(), Processed: e.processedCount, Failed: e.failedCount, Paused: e.isPaused}
	for _, request := range e.pendingRequests {
		state.Requests = append(state.Requests, request)
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(e.statePath), ".bridge-state-*")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	if err = os.Rename(temporary, e.statePath); err != nil {
		return err
	}
	dir, err := os.Open(filepath.Dir(e.statePath))
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}
func cloneRequest(request *domain.BridgeRequest) *domain.BridgeRequest {
	copy := *request
	if request.Amount != nil {
		copy.Amount = new(big.Int).Set(request.Amount)
	}
	if request.Fee != nil {
		copy.Fee = new(big.Int).Set(request.Fee)
	}
	copy.Signatures = nil
	return &copy
}
