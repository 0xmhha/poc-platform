package fraud

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"sync"
	"time"

	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/config"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
)

var (
	ErrVerificationUnavailable = errors.New("authoritative fraud verification is unavailable")
	ErrInvalidProof            = errors.New("invalid fraud proof")
	ErrProofAlreadyExists      = errors.New("fraud proof already exists")
	ErrProofExpired            = errors.New("fraud proof expired")
	ErrInvalidSignatures       = errors.New("invalid signatures")
	ErrInsufficientBond        = errors.New("insufficient bond")
)

// VerificationResult contains the result of a fraud proof verification
type VerificationResult struct {
	IsValid     bool                  `json:"isValid"`
	ProofType   domain.FraudProofType `json:"proofType"`
	RequestID   [32]byte              `json:"requestId"`
	ErrorReason string                `json:"errorReason,omitempty"`
	VerifiedAt  time.Time             `json:"verifiedAt"`
}

// FraudProofVerifier handles fraud proof verification logic
type FraudProofVerifier struct {
	backend VerificationBackend
	cfg     config.ContractConfig

	mu             sync.RWMutex
	pendingProofs  map[[32]byte]*domain.FraudProof
	verifiedProofs map[[32]byte]*VerificationResult

	// Challenge period in seconds
	challengePeriod uint64
	// Minimum bond required to submit fraud proof
	minBondAmount *big.Int
}

// VerificationBackend must verify the evidence against authoritative chain state.
// Network failure is distinct from a valid verdict of false.
type VerificationBackend func(context.Context, *domain.FraudProof) (bool, error)

func (v *FraudProofVerifier) SetVerificationBackend(backend VerificationBackend) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.backend = backend
}

// NewFraudProofVerifier creates a new fraud proof verifier
func NewFraudProofVerifier(cfg config.ContractConfig) *FraudProofVerifier {
	return &FraudProofVerifier{
		cfg:             cfg,
		pendingProofs:   make(map[[32]byte]*domain.FraudProof),
		verifiedProofs:  make(map[[32]byte]*VerificationResult),
		challengePeriod: 86400,            // 24 hours default
		minBondAmount:   big.NewInt(1e18), // 1 ETH default
	}
}

// SetChallengePeriod sets the challenge period in seconds
func (v *FraudProofVerifier) SetChallengePeriod(period uint64) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.challengePeriod = period
}

// SetMinBondAmount sets the minimum bond amount required
func (v *FraudProofVerifier) SetMinBondAmount(amount *big.Int) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.minBondAmount = new(big.Int).Set(amount)
}

// GetChallengePeriod returns the challenge period
func (v *FraudProofVerifier) GetChallengePeriod() uint64 {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.challengePeriod
}

// GetMinBondAmount returns the minimum bond amount
func (v *FraudProofVerifier) GetMinBondAmount() *big.Int {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return new(big.Int).Set(v.minBondAmount)
}

// SubmitFraudProof submits a new fraud proof for verification
func (v *FraudProofVerifier) SubmitFraudProof(ctx context.Context, proof *domain.FraudProof) error {
	if proof == nil {
		return ErrInvalidProof
	}

	// Validate proof type
	if !isValidProofType(proof.ProofType) {
		return ErrInvalidProof
	}

	// Check proof data - need at least evidence or state proof
	if len(proof.Evidence) == 0 && len(proof.StateProof) == 0 {
		return ErrInvalidProof
	}

	v.mu.Lock()
	defer v.mu.Unlock()

	// Check if proof already exists
	if _, exists := v.pendingProofs[proof.RequestID]; exists {
		return ErrProofAlreadyExists
	}

	// Add to pending proofs
	v.pendingProofs[proof.RequestID] = cloneProof(proof)

	return nil
}

// VerifyFraudProof verifies a pending fraud proof
func (v *FraudProofVerifier) VerifyFraudProof(ctx context.Context, requestID [32]byte) (*VerificationResult, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	proof, exists := v.pendingProofs[requestID]
	if !exists {
		return nil, ErrInvalidProof
	}

	result := &VerificationResult{
		ProofType:  proof.ProofType,
		RequestID:  requestID,
		VerifiedAt: time.Now(),
	}

	if v.backend == nil {
		return nil, ErrVerificationUnavailable
	}
	valid, err := v.backend(ctx, cloneProof(proof))
	if err != nil {
		return nil, err
	} // Retain pending evidence for retry.
	result.IsValid = valid

	if !result.IsValid && result.ErrorReason == "" {
		result.ErrorReason = "verification failed"
	}

	// Move to verified proofs
	delete(v.pendingProofs, requestID)
	v.verifiedProofs[requestID] = result

	return result, nil
}

func cloneProof(proof *domain.FraudProof) *domain.FraudProof {
	copy := *proof
	copy.Evidence = append([]byte(nil), proof.Evidence...)
	copy.StateProof = append([]byte(nil), proof.StateProof...)
	copy.MerkleProof = append([][32]byte(nil), proof.MerkleProof...)
	return &copy
}

// GetPendingProof returns a pending fraud proof
func (v *FraudProofVerifier) GetPendingProof(requestID [32]byte) (*domain.FraudProof, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	proof, exists := v.pendingProofs[requestID]
	if !exists {
		return nil, false
	}
	return cloneProof(proof), true
}

// GetVerifiedProof returns a verified proof result
func (v *FraudProofVerifier) GetVerifiedProof(requestID [32]byte) (*VerificationResult, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()
	result, exists := v.verifiedProofs[requestID]
	if !exists {
		return nil, false
	}
	copy := *result
	return &copy, true
}

// GetPendingProofsCount returns the number of pending proofs
func (v *FraudProofVerifier) GetPendingProofsCount() int {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return len(v.pendingProofs)
}

// GetVerifiedProofsCount returns the number of verified proofs
func (v *FraudProofVerifier) GetVerifiedProofsCount() int {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return len(v.verifiedProofs)
}

// ComputeProofHash computes a hash for a fraud proof
func ComputeProofHash(proof *domain.FraudProof) [32]byte {
	data := append(proof.RequestID[:], proof.Evidence...)
	data = append(data, proof.StateProof...)
	data = append(data, byte(proof.ProofType))
	return sha256.Sum256(data)
}

// ProofHashToHex converts a proof hash to hex string
func ProofHashToHex(hash [32]byte) string {
	return hex.EncodeToString(hash[:])
}

// isValidProofType checks if the proof type is valid
func isValidProofType(pt domain.FraudProofType) bool {
	switch pt {
	case domain.FraudProofInvalidSignature,
		domain.FraudProofDoubleSpending,
		domain.FraudProofInvalidAmount,
		domain.FraudProofInvalidToken,
		domain.FraudProofReplayAttack:
		return true
	default:
		return false
	}
}
