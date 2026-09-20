package fraud

import (
	"context"
	"fmt"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
)

type ContractReader interface {
	ReadContract(context.Context, string, string, string, bool, ...interface{}) ([]interface{}, error)
}

// ChainVerificationBackend simulates the deployed verifier for previously submitted
// proofs. Callers must submit the proof on chain first; reverted/unavailable reads
// retain the proof as pending. This read does not claim to finalize a transaction.
func ChainVerificationBackend(client ContractReader, address string) VerificationBackend {
	const contractABI = `[{"type":"function","name":"verifyFraudProof","inputs":[{"name":"proof","type":"tuple","components":[{"name":"requestId","type":"bytes32"},{"name":"proofType","type":"uint8"},{"name":"merkleProof","type":"bytes32[]"},{"name":"stateProof","type":"bytes"},{"name":"evidence","type":"bytes"}]}],"outputs":[{"type":"bool"}]}]`
	return func(ctx context.Context, proof *domain.FraudProof) (bool, error) {
		if client == nil || address == "" {
			return false, ErrVerificationUnavailable
		}
		value := struct {
			RequestId   [32]byte
			ProofType   uint8
			MerkleProof [][32]byte
			StateProof  []byte
			Evidence    []byte
		}{proof.RequestID, uint8(proof.ProofType), proof.MerkleProof, proof.StateProof, proof.Evidence}
		result, err := client.ReadContract(ctx, address, contractABI, "verifyFraudProof", false, value)
		if err != nil {
			return false, err
		}
		if len(result) != 1 {
			return false, fmt.Errorf("invalid verifier response")
		}
		valid, ok := result[0].(bool)
		if !ok {
			return false, fmt.Errorf("invalid verifier response")
		}
		return valid, nil
	}
}
