package monitor

import (
	"context"
	"fmt"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/domain"
	"math/big"
	"strings"
	"time"
)

const controlEventsABI = `[
 {"type":"event","name":"RequestApproved","inputs":[{"name":"requestId","type":"bytes32","indexed":true},{"name":"timestamp","type":"uint256"}]},
 {"type":"event","name":"RequestChallenged","inputs":[{"name":"requestId","type":"bytes32","indexed":true},{"name":"challenger","type":"address","indexed":true},{"name":"bondAmount","type":"uint256"},{"name":"reason","type":"string"}]},
 {"type":"event","name":"ChallengeResolved","inputs":[{"name":"requestId","type":"bytes32","indexed":true},{"name":"challengeSuccessful","type":"bool"},{"name":"challenger","type":"address","indexed":true},{"name":"reward","type":"uint256"}]},
 {"type":"event","name":"EmergencyPause","inputs":[{"name":"guardian","type":"address","indexed":true},{"name":"reason","type":"string"}]}
]`

func uint64Field(data map[string]interface{}, key string) (uint64, error) {
	n, ok := data[key].(*big.Int)
	if !ok || !n.IsUint64() {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return n.Uint64(), nil
}
func (m *EventMonitor) dispatchBridge(ctx context.Context, entry types.Log) error {
	if entry.Removed {
		return nil
	}
	data, err := m.ethClient.DecodeBridgeLog(entry)
	if err != nil {
		return err
	}
	source, err := uint64Field(data, "sourceChain")
	if err != nil {
		return err
	}
	target, err := uint64Field(data, "targetChain")
	if err != nil {
		return err
	}
	if source != m.ethClient.GetChainID(true).Uint64() || target != m.ethClient.GetChainID(false).Uint64() {
		return nil
	}
	nonce, err := uint64Field(data, "nonce")
	if err != nil {
		return err
	}
	deadline, err := uint64Field(data, "deadline")
	if err != nil {
		return err
	}
	event := domain.BridgeInitiatedEvent{RequestID: data["requestID"].([32]byte), Sender: data["sender"].(common.Address).Hex(), Recipient: data["recipient"].(common.Address).Hex(), Token: data["token"].(common.Address).Hex(), Amount: data["amount"].(*big.Int), Fee: data["fee"].(*big.Int), SourceChain: source, TargetChain: target, Nonce: nonce, Deadline: deadline, BlockNumber: entry.BlockNumber}
	select {
	case m.bridgeInitiated <- event:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (m *EventMonitor) controlLogs(ctx context.Context, address string, last uint64) (uint64, error) {
	latest, err := m.ethClient.GetLatestBlock(ctx, false)
	if err != nil {
		return last, err
	}
	if latest < m.blockConfirmations || latest-m.blockConfirmations <= last {
		return last, nil
	}
	end := latest - m.blockConfirmations
	if end-last > m.maxBlockRange {
		end = last + m.maxBlockRange
	}
	logs, err := m.ethClient.FilterLogs(ctx, address, last+1, end, false)
	if err != nil {
		return last, err
	}
	parsed, err := abi.JSON(strings.NewReader(controlEventsABI))
	if err != nil {
		return last, err
	}
	for _, entry := range logs {
		if entry.Removed || len(entry.Topics) == 0 {
			continue
		}
		event, err := parsed.EventByID(entry.Topics[0])
		if err != nil {
			continue
		}
		data := map[string]interface{}{}
		if err = event.Inputs.NonIndexed().UnpackIntoMap(data, entry.Data); err != nil {
			return last, err
		}
		var indexed abi.Arguments
		for _, input := range event.Inputs {
			if input.Indexed {
				indexed = append(indexed, input)
			}
		}
		if err = abi.ParseTopicsIntoMap(data, indexed, entry.Topics[1:]); err != nil {
			return last, err
		}
		switch event.Name {
		case "RequestApproved":
			timestamp, err := uint64Field(data, "timestamp")
			if err != nil {
				return last, err
			}
			value := domain.RequestApprovedEvent{RequestID: data["requestId"].([32]byte), Timestamp: time.Unix(int64(timestamp), 0)}
			select {
			case m.requestApproved <- value:
			case <-ctx.Done():
				return last, ctx.Err()
			}
		case "RequestChallenged":
			value := domain.RequestChallengedEvent{RequestID: data["requestId"].([32]byte), Challenger: data["challenger"].(common.Address).Hex(), BondAmount: data["bondAmount"].(*big.Int), Reason: data["reason"].(string)}
			select {
			case m.requestChallenged <- value:
			case <-ctx.Done():
				return last, ctx.Err()
			}
		case "ChallengeResolved":
			value := domain.ChallengeResolvedEvent{RequestID: data["requestId"].([32]byte), ChallengeSuccess: data["challengeSuccessful"].(bool), Challenger: data["challenger"].(common.Address).Hex(), Reward: data["reward"].(*big.Int)}
			select {
			case m.challengeResolved <- value:
			case <-ctx.Done():
				return last, ctx.Err()
			}
		case "EmergencyPause":
			value := domain.EmergencyPauseEvent{Guardian: data["guardian"].(common.Address).Hex(), Reason: data["reason"].(string)}
			select {
			case m.emergencyPause <- value:
			case <-ctx.Done():
				return last, ctx.Err()
			}
		}
	}
	return end, nil
}
