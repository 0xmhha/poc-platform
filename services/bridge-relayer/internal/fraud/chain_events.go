package fraud

import (
	"context"
	"fmt"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
	"math/big"
	"strings"
	"time"
)

const proofEventsABI = `[{"type":"function","name":"getProofRecord","inputs":[{"name":"requestId","type":"bytes32","internalType":"bytes32"}],"outputs":[{"name":"","type":"tuple","internalType":"struct FraudProofVerifier.ProofRecord","components":[{"name":"submitter","type":"address","internalType":"address"},{"name":"proofType","type":"uint8","internalType":"enum FraudProofVerifier.FraudProofType"},{"name":"proofHash","type":"bytes32","internalType":"bytes32"},{"name":"submittedAt","type":"uint256","internalType":"uint256"},{"name":"verified","type":"bool","internalType":"bool"},{"name":"isValid","type":"bool","internalType":"bool"}]}],"stateMutability":"view"},{"type":"event","name":"FraudProofSubmitted","inputs":[{"name":"requestId","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"proofType","type":"uint8","indexed":false,"internalType":"enum FraudProofVerifier.FraudProofType"},{"name":"submitter","type":"address","indexed":true,"internalType":"address"},{"name":"proofHash","type":"bytes32","indexed":false,"internalType":"bytes32"}],"anonymous":false},{"type":"event","name":"FraudProofVerified","inputs":[{"name":"requestId","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"proofType","type":"uint8","indexed":false,"internalType":"enum FraudProofVerifier.FraudProofType"},{"name":"isValid","type":"bool","indexed":false,"internalType":"bool"},{"name":"verifier","type":"address","indexed":true,"internalType":"address"}],"anonymous":false}]`

type chainProofRecord struct {
	Submitter   common.Address
	ProofType   uint8
	ProofHash   [32]byte
	SubmittedAt *big.Int
	Verified    bool
	IsValid     bool
}

func (m *FraudMonitor) refreshProofEvents(ctx context.Context) error {
	if m.ethClient == nil {
		return fmt.Errorf("fraud chain client unavailable")
	}
	latest, err := m.ethClient.GetFinalizedBlock(ctx, false)
	if err != nil {
		return err
	}
	m.mu.RLock()
	last := m.lastProofBlock
	m.mu.RUnlock()
	if latest <= last {
		return nil
	}
	end := latest
	if end-last > 1000 {
		end = last + 1000
	}
	logs, err := m.ethClient.FilterLogs(ctx, m.contracts.FraudProofVerifier, last+1, end, false)
	if err != nil {
		return err
	}
	parsed, err := abi.JSON(strings.NewReader(proofEventsABI))
	if err != nil {
		return err
	}
	for _, entry := range logs {
		if entry.Removed || len(entry.Topics) < 2 {
			continue
		}
		event, err := parsed.EventByID(entry.Topics[0])
		if err != nil {
			continue
		}
		id := [32]byte(entry.Topics[1])
		result, err := m.ethClient.ReadContract(ctx, m.contracts.FraudProofVerifier, proofEventsABI, "getProofRecord", false, id)
		if err != nil {
			return err
		}
		p := abi.ConvertType(result[0], new(chainProofRecord)).(*chainProofRecord)
		if !p.SubmittedAt.IsInt64() {
			return fmt.Errorf("invalid proof timestamp")
		}
		record := &domain.ProofRecord{Submitter: p.Submitter.Hex(), ProofType: domain.FraudProofType(p.ProofType), ProofHash: p.ProofHash, SubmittedAt: time.Unix(p.SubmittedAt.Int64(), 0), Verified: p.Verified, IsValid: p.IsValid}
		m.mu.Lock()
		previous := m.proofRecords[p.ProofHash]
		changed := previous == nil || previous.Verified != p.Verified || previous.IsValid != p.IsValid
		m.proofRecords[p.ProofHash] = record
		m.mu.Unlock()
		if changed {
			severity := "medium"
			if p.Verified && p.IsValid {
				severity = "critical"
			}
			m.SendAlert(FraudAlert{RequestID: id, AlertType: event.Name, Severity: severity, Details: "Observed deployed fraud verifier record", Timestamp: time.Now(), ProofType: record.ProofType})
		}
	}
	m.mu.Lock()
	m.lastProofBlock = end
	m.mu.Unlock()
	return nil
}
