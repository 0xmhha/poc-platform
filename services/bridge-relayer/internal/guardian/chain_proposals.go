package guardian

import (
	"context"
	"fmt"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
	"math/big"
	"time"
)

const proposalABI = `[{"type":"function","name":"getProposal","inputs":[{"name":"proposalId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"","type":"tuple","internalType":"struct BridgeGuardian.Proposal","components":[{"name":"id","type":"uint256","internalType":"uint256"},{"name":"proposalType","type":"uint8","internalType":"enum BridgeGuardian.ProposalType"},{"name":"proposer","type":"address","internalType":"address"},{"name":"target","type":"address","internalType":"address"},{"name":"data","type":"bytes","internalType":"bytes"},{"name":"dataHash","type":"bytes32","internalType":"bytes32"},{"name":"approvalCount","type":"uint256","internalType":"uint256"},{"name":"createdAt","type":"uint256","internalType":"uint256"},{"name":"expiresAt","type":"uint256","internalType":"uint256"},{"name":"status","type":"uint8","internalType":"enum BridgeGuardian.ProposalStatus"}]}],"stateMutability":"view"},{"type":"function","name":"proposalCount","inputs":[],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"}]`

type chainProposal struct {
	Id            *big.Int
	ProposalType  uint8
	Proposer      common.Address
	Target        common.Address
	Data          []byte
	DataHash      [32]byte
	ApprovalCount *big.Int
	CreatedAt     *big.Int
	ExpiresAt     *big.Int
	Status        uint8
}

func (m *GuardianMonitor) refreshProposals(ctx context.Context) error {
	if m.ethClient == nil {
		return fmt.Errorf("guardian chain client unavailable")
	}
	result, err := m.ethClient.ReadContract(ctx, m.contracts.BridgeGuardian, proposalABI, "proposalCount", false)
	if err != nil {
		return err
	}
	count := result[0].(*big.Int)
	if !count.IsUint64() {
		return fmt.Errorf("invalid proposal count")
	}
	// Refresh tracked proposals and discover new proposals in bounded batches.
	m.mu.RLock()
	ids := make([]uint64, 0, len(m.activeProposals)+100)
	for id := range m.activeProposals {
		ids = append(ids, id)
	}
	last := m.lastProposal
	m.mu.RUnlock()
	end := count.Uint64()
	if end < last {
		return fmt.Errorf("guardian proposal count regressed; rescan required")
	}
	if end-last > 100 {
		end = last + 100
	}
	for id := last + 1; id <= end; id++ {
		ids = append(ids, id)
	}
	names := []string{"none", "unpause", "blacklist", "whitelist", "update_config", "recovery", "add_guardian", "remove_guardian", "update_threshold"}
	statuses := []string{"pending", "approved", "executed", "cancelled", "expired"}
	for _, id := range ids {
		result, err = m.ethClient.ReadContract(ctx, m.contracts.BridgeGuardian, proposalABI, "getProposal", false, new(big.Int).SetUint64(id))
		if err != nil {
			return err
		}
		p := abi.ConvertType(result[0], new(chainProposal)).(*chainProposal)
		if int(p.ProposalType) >= len(names) || int(p.Status) >= len(statuses) || !p.Id.IsUint64() || !p.ApprovalCount.IsUint64() || !p.ExpiresAt.IsInt64() || !p.CreatedAt.IsInt64() {
			return fmt.Errorf("invalid guardian proposal")
		}
		if p.Status >= 2 || p.ExpiresAt.Int64() < time.Now().Unix() {
			m.RemoveProposal(id)
			continue
		}
		proposal := &domain.GuardianProposal{ID: id, ProposalType: names[p.ProposalType], Proposer: p.Proposer.Hex(), Target: p.Target.Hex(), Data: p.Data, DataHash: p.DataHash, ApprovalCount: p.ApprovalCount.Uint64(), CreatedAt: time.Unix(p.CreatedAt.Int64(), 0), ExpiresAt: time.Unix(p.ExpiresAt.Int64(), 0), Status: statuses[p.Status]}
		m.AddProposal(proposal)
	}
	m.mu.Lock()
	m.lastProposal = end
	m.mu.Unlock()
	return nil
}
