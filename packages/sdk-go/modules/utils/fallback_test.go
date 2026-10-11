package utils

import (
	"encoding/hex"
	"testing"

	"github.com/ethereum/go-ethereum/common"

	"github.com/stablenet/sdk-go/types"
)

// Expected values come from the FlashLoanFallback contract ABI (forge inspect / cast).

func TestEncodeFlashLoanInit_MatchesOnInstallLayout(t *testing.T) {
	got, err := EncodeFlashLoanInit(types.FlashLoanConfig{RequireWhitelistedProtocol: true, LogFlashLoans: false})
	if err != nil {
		t.Fatalf("EncodeFlashLoanInit failed: %v", err)
	}
	want := "0000000000000000000000000000000000000000000000000000000000000001" +
		"0000000000000000000000000000000000000000000000000000000000000000"
	if hex.EncodeToString(got.Bytes()) != want {
		t.Errorf("init data = %x, want abi.encode(true, false)", got.Bytes())
	}
}

func TestEncodeBeginFlashLoan(t *testing.T) {
	got, err := EncodeBeginFlashLoan(common.HexToAddress("0x1111111111111111111111111111111111111111"))
	if err != nil {
		t.Fatalf("EncodeBeginFlashLoan failed: %v", err)
	}
	want := "3c9edbe4" + "0000000000000000000000001111111111111111111111111111111111111111"
	if hex.EncodeToString(got.Bytes()) != want {
		t.Errorf("calldata = %x, want %s", got.Bytes(), want)
	}
}

func TestEncodeFlashLoanAddToWhitelist(t *testing.T) {
	got, err := EncodeFlashLoanAddToWhitelist(common.HexToAddress("0x1111111111111111111111111111111111111111"))
	if err != nil {
		t.Fatalf("EncodeFlashLoanAddToWhitelist failed: %v", err)
	}
	want := "e43252d7" + "0000000000000000000000001111111111111111111111111111111111111111"
	if hex.EncodeToString(got.Bytes()) != want {
		t.Errorf("calldata = %x, want %s", got.Bytes(), want)
	}
}

func TestFlashLoanCallbackSelectors(t *testing.T) {
	cases := map[string]types.Hex{
		"920f5c84": SelectorAaveExecuteOperation,
		"e9cbafb0": SelectorUniswapV3FlashCallback,
		"f04f2707": SelectorBalancerReceiveFlashLoan,
		"23e30c8b": SelectorERC3156OnFlashLoan,
	}
	for want, got := range cases {
		if hex.EncodeToString(got.Bytes()) != want {
			t.Errorf("selector = %x, want %s", got.Bytes(), want)
		}
	}
}
