package service

import "testing"

func TestRPCQuantitiesRejectMalformedExternalValues(t *testing.T) {
	for _, value := range []string{"", "0x", "1", "0x-1", "0xnope", "0x1" + string(make([]byte, 64))} {
		if _, err := parseRPCQuantity(value); err == nil {
			t.Errorf("accepted %q", value)
		}
	}
	n, err := parseRPCQuantity("0x0")
	if err != nil || n.Sign() != 0 {
		t.Fatal("zero nonce rejected")
	}
}
