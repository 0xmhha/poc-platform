package guardian

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/config"
	"github.com/stablenet/stable-platform/services/bridge-relayer/internal/ethereum"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestGuardianReadsAndRemovesResolvedOnChainProposals(t *testing.T) {
	parsed, err := abi.JSON(strings.NewReader(proposalABI))
	if err != nil {
		t.Fatal(err)
	}
	var status atomic.Uint32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			ID     json.RawMessage   `json:"id"`
			Params []json.RawMessage `json:"params"`
		}
		json.NewDecoder(r.Body).Decode(&request)
		var call map[string]string
		json.Unmarshal(request.Params[0], &call)
		input := strings.TrimPrefix(call["input"], "0x")
		if input == "" {
			input = strings.TrimPrefix(call["data"], "0x")
		}
		data, _ := hex.DecodeString(input)
		method, err := parsed.MethodById(data)
		if err != nil {
			t.Error(err)
			return
		}
		var output []byte
		if method.Name == "proposalCount" {
			output, err = method.Outputs.Pack(big.NewInt(1))
		} else {
			output, err = method.Outputs.Pack(chainProposal{Id: big.NewInt(1), ProposalType: 1, Proposer: common.HexToAddress("0x1"), Target: common.HexToAddress("0x2"), Data: []byte{}, ApprovalCount: big.NewInt(2), CreatedAt: big.NewInt(time.Now().Unix()), ExpiresAt: big.NewInt(time.Now().Add(time.Hour).Unix()), Status: uint8(status.Load())})
		}
		if err != nil {
			t.Error(err)
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"jsonrpc": "2.0", "id": request.ID, "result": "0x" + hex.EncodeToString(output)})
	}))
	defer server.Close()
	client, err := ethereum.NewClient(config.EthereumConfig{SourceRPCURL: server.URL, TargetRPCURL: server.URL, SourceChainID: 1, TargetChainID: 2})
	if err != nil {
		t.Fatal(err)
	}
	monitor := NewGuardianMonitor(client, config.ContractConfig{BridgeGuardian: "0x1111111111111111111111111111111111111111"})
	if err := monitor.refreshProposals(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(monitor.GetActiveProposals()) != 1 {
		t.Fatal("proposal not discovered")
	}
	status.Store(2)
	if err := monitor.refreshProposals(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(monitor.GetActiveProposals()) != 0 {
		t.Fatal("executed proposal retained as active")
	}
}
