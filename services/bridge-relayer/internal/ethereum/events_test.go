package ethereum

import (
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"math/big"
	"strings"
	"testing"
)

func TestBridgeInitiatedDecodesCanonicalFeeNonceDeadline(t *testing.T) {
	parsed, err := abi.JSON(strings.NewReader(bridgeABIJSON))
	if err != nil {
		t.Fatal(err)
	}
	c := &Client{bridgeABI: parsed}
	event := parsed.Events["BridgeInitiated"]
	data, err := event.Inputs.NonIndexed().Pack(common.HexToAddress("0x1111111111111111111111111111111111111111"), big.NewInt(990), big.NewInt(1), big.NewInt(2), big.NewInt(10), big.NewInt(7), big.NewInt(900000))
	if err != nil {
		t.Fatal(err)
	}
	log := types.Log{Topics: []common.Hash{event.ID, common.HexToHash("0x01"), common.HexToHash("0x02"), common.HexToHash("0x03")}, Data: data}
	result, err := c.DecodeBridgeLog(log)
	if err != nil {
		t.Fatal(err)
	}
	if result["nonce"].(*big.Int).Uint64() != 7 || result["deadline"].(*big.Int).Uint64() != 900000 || result["amount"].(*big.Int).Uint64() != 990 {
		t.Fatal("event payload mismatch")
	}
	log.Topics = log.Topics[:3]
	if _, err = c.DecodeBridgeLog(log); err == nil {
		t.Fatal("accepted obsolete event schema")
	}
}
