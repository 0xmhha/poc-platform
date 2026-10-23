package utils

import (
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/stablenet/sdk-go/types"
)

// ============================================================================
// Interface IDs and Selectors
// ============================================================================

// Standard ERC interface IDs.
var (
	InterfaceERC165  = types.Hex([]byte{0x01, 0xff, 0xc9, 0xa7}) // supportsInterface(bytes4)
	InterfaceERC721  = types.Hex([]byte{0x80, 0xac, 0x58, 0xcd})
	InterfaceERC1155 = types.Hex([]byte{0xd9, 0xb6, 0x7a, 0x26})
	InterfaceERC777  = types.Hex([]byte{0x90, 0x5a, 0xe9, 0xfd})
)

// ERC721 and ERC1155 callback selectors.
var (
	SelectorERC721Received       = CalculateSelector("onERC721Received(address,address,uint256,bytes)")
	SelectorERC1155Received      = CalculateSelector("onERC1155Received(address,address,uint256,uint256,bytes)")
	SelectorERC1155BatchReceived = CalculateSelector("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)")
	SelectorERC777TokensReceived = CalculateSelector("tokensReceived(address,address,address,uint256,bytes,bytes)")
)

// ERC721 and ERC1155 return values (magic values).
var (
	ERC721ReceivedReturn       = types.Hex([]byte{0x15, 0x0b, 0x7a, 0x02}) // bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))
	ERC1155ReceivedReturn      = types.Hex([]byte{0xf2, 0x3a, 0x6e, 0x61}) // bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"))
	ERC1155BatchReceivedReturn = types.Hex([]byte{0xbc, 0x19, 0x7c, 0x81}) // bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"))
)

// InterfaceSelectors maps interface names to their selectors.
var InterfaceSelectors = map[string]types.Hex{
	"ERC165":  InterfaceERC165,
	"ERC721":  InterfaceERC721,
	"ERC1155": InterfaceERC1155,
	"ERC777":  InterfaceERC777,
}

// InterfaceIDs maps interface names to their IDs (same as selectors for ERC standards).
var InterfaceIDs = InterfaceSelectors

// CalculateSelector calculates the function selector from a signature.
func CalculateSelector(signature string) types.Hex {
	hash := crypto.Keccak256([]byte(signature))
	return types.Hex(hash[:4])
}

// ============================================================================
// Token Receiver Fallback Utils
// ============================================================================

// TokenReceiverCapability describes a token receiver capability.
type TokenReceiverCapability struct {
	Interface string
	Selector  types.Hex
	Supported bool
}

// EncodeTokenReceiverInit encodes token receiver fallback initialization data.
func EncodeTokenReceiverInit(config types.TokenReceiverConfig) (types.Hex, error) {
	bytes4ArrayType := mustNewType("bytes4[]")

	arguments := abi.Arguments{
		{Type: bytes4ArrayType, Name: "supportedInterfaces"},
	}

	// Convert hex to [4]byte
	interfaces := make([][4]byte, len(config.SupportedInterfaces))
	for i, iface := range config.SupportedInterfaces {
		var sel [4]byte
		copy(sel[:], iface.Bytes())
		interfaces[i] = sel
	}

	encoded, err := arguments.Pack(interfaces)
	if err != nil {
		return nil, fmt.Errorf("failed to encode token receiver init: %w", err)
	}

	return types.Hex(encoded), nil
}

// DecodeTokenReceiverFlags decodes token receiver flags from initialization data.
func DecodeTokenReceiverFlags(data types.Hex) ([]types.Hex, error) {
	bytes4ArrayType := mustNewType("bytes4[]")

	arguments := abi.Arguments{
		{Type: bytes4ArrayType, Name: "supportedInterfaces"},
	}

	values, err := arguments.Unpack(data.Bytes())
	if err != nil {
		return nil, fmt.Errorf("failed to decode token receiver flags: %w", err)
	}

	if len(values) < 1 {
		return nil, fmt.Errorf("insufficient data for token receiver flags")
	}

	interfacesRaw, ok := values[0].([][4]byte)
	if !ok {
		return nil, fmt.Errorf("invalid interfaces type")
	}

	interfaces := make([]types.Hex, len(interfacesRaw))
	for i, iface := range interfacesRaw {
		interfaces[i] = types.Hex(iface[:])
	}

	return interfaces, nil
}

// ValidateTokenReceiverConfig validates token receiver configuration.
func ValidateTokenReceiverConfig(config types.TokenReceiverConfig) *ValidationResult {
	result := &ValidationResult{Valid: true}

	if len(config.SupportedInterfaces) == 0 {
		result.AddError("At least one supported interface is required")
	}

	for i, iface := range config.SupportedInterfaces {
		if len(iface) < 4 {
			result.AddError(fmt.Sprintf("Interface %d must be at least 4 bytes", i+1))
		}
	}

	return result
}

// GetTokenReceiverHandlers returns the handlers supported by a token receiver.
func GetTokenReceiverHandlers(interfaces []types.Hex) []TokenReceiverCapability {
	capabilities := []TokenReceiverCapability{
		{Interface: "ERC721", Selector: SelectorERC721Received, Supported: false},
		{Interface: "ERC1155Single", Selector: SelectorERC1155Received, Supported: false},
		{Interface: "ERC1155Batch", Selector: SelectorERC1155BatchReceived, Supported: false},
		{Interface: "ERC777", Selector: SelectorERC777TokensReceived, Supported: false},
	}

	for i := range capabilities {
		for _, iface := range interfaces {
			if len(iface) >= 4 && len(capabilities[i].Selector) >= 4 {
				var sel1, sel2 [4]byte
				copy(sel1[:], iface.Bytes()[:4])
				copy(sel2[:], capabilities[i].Selector.Bytes()[:4])
				if sel1 == sel2 {
					capabilities[i].Supported = true
					break
				}
			}
		}
	}

	return capabilities
}

// EncodeERC721ReceivedReturn encodes the return value for onERC721Received.
func EncodeERC721ReceivedReturn() types.Hex {
	return ERC721ReceivedReturn
}

// EncodeERC1155ReceivedReturn encodes the return value for onERC1155Received.
func EncodeERC1155ReceivedReturn() types.Hex {
	return ERC1155ReceivedReturn
}

// EncodeERC1155BatchReceivedReturn encodes the return value for onERC1155BatchReceived.
func EncodeERC1155BatchReceivedReturn() types.Hex {
	return ERC1155BatchReceivedReturn
}

// ============================================================================
// Flash Loan Fallback Utils
// ============================================================================

// FlashLoanCallbackConfig describes flash loan callback configuration.
type FlashLoanCallbackConfig struct {
	Lender types.Address
	Token  types.Address
	Amount *big.Int
	Fee    *big.Int
	Data   types.Hex
}

// Flash loan callback selectors handled by FlashLoanFallback. Register the one(s) matching the
// lender as fallback selectors on the account.
var (
	SelectorAaveExecuteOperation     = CalculateSelector("executeOperation(address[],uint256[],uint256[],address,bytes)")
	SelectorUniswapV3FlashCallback   = CalculateSelector("uniswapV3FlashCallback(uint256,uint256,bytes)")
	SelectorBalancerReceiveFlashLoan = CalculateSelector("receiveFlashLoan(address[],uint256[],uint256[],bytes)")
	SelectorERC3156OnFlashLoan       = CalculateSelector("onFlashLoan(address,address,uint256,uint256,bytes)")
)

// EncodeFlashLoanInit encodes FlashLoanFallback onInstall data: abi.encode(bool requireWhitelist, bool logFlashLoans).
//
// FlashLoanFallback must be installed as both a fallback (for the lender callback) and an executor
// (it repays and runs strategy calls through executeFromExecutor). The second install may pass empty
// data; the module keeps the first install's config. Without data the module defaults to
// requireWhitelist = true and logFlashLoans = true.
func EncodeFlashLoanInit(config types.FlashLoanConfig) (types.Hex, error) {
	boolType := mustNewType("bool")

	arguments := abi.Arguments{
		{Type: boolType, Name: "requireWhitelist"},
		{Type: boolType, Name: "logFlashLoans"},
	}

	encoded, err := arguments.Pack(config.RequireWhitelistedProtocol, config.LogFlashLoans)
	if err != nil {
		return nil, fmt.Errorf("failed to encode flash loan init: %w", err)
	}

	return types.Hex(encoded), nil
}

// EncodeBeginFlashLoan encodes FlashLoanFallback.beginFlashLoan(lender).
//
// The account must call this on the module in the same transaction as the loan request, right
// before it (for example as the first call of an executeBatch). The module rejects a lender
// callback that was not announced this way.
func EncodeBeginFlashLoan(lender types.Address) (types.Hex, error) {
	encoded, err := abi.Arguments{{Type: mustNewType("address")}}.Pack(common.Address(lender))
	if err != nil {
		return nil, fmt.Errorf("failed to encode beginFlashLoan: %w", err)
	}
	return types.Hex(append(CalculateSelector("beginFlashLoan(address)").Bytes(), encoded...)), nil
}

// EncodeFlashLoanAddToWhitelist encodes FlashLoanFallback.addToWhitelist(protocol). Lenders must be
// whitelisted while requireWhitelist is enabled.
func EncodeFlashLoanAddToWhitelist(protocol types.Address) (types.Hex, error) {
	encoded, err := abi.Arguments{{Type: mustNewType("address")}}.Pack(common.Address(protocol))
	if err != nil {
		return nil, fmt.Errorf("failed to encode addToWhitelist: %w", err)
	}
	return types.Hex(append(CalculateSelector("addToWhitelist(address)").Bytes(), encoded...)), nil
}

// ============================================================================
// Generic Fallback Utils
// ============================================================================

// FallbackHandlerRegistration describes a fallback handler registration.
type FallbackHandlerRegistration struct {
	Selector types.Hex
	Handler  types.Address
	Mode     uint8 // 0 = call, 1 = delegatecall
}

// EncodeFallbackHandlerRegistration encodes a fallback handler registration.
func EncodeFallbackHandlerRegistration(reg FallbackHandlerRegistration) (types.Hex, error) {
	bytes4Type := mustNewType("bytes4")
	addressType := mustNewType("address")
	uint8Type := mustNewType("uint8")

	arguments := abi.Arguments{
		{Type: bytes4Type, Name: "selector"},
		{Type: addressType, Name: "handler"},
		{Type: uint8Type, Name: "mode"},
	}

	var selector [4]byte
	copy(selector[:], reg.Selector.Bytes())

	encoded, err := arguments.Pack(selector, common.Address(reg.Handler), reg.Mode)
	if err != nil {
		return nil, fmt.Errorf("failed to encode fallback handler registration: %w", err)
	}

	return types.Hex(encoded), nil
}

// EncodeBatchFallbackRegistration encodes multiple fallback handler registrations.
func EncodeBatchFallbackRegistration(registrations []FallbackHandlerRegistration) (types.Hex, error) {
	tupleComponents := []abi.ArgumentMarshaling{
		{Name: "selector", Type: "bytes4"},
		{Name: "handler", Type: "address"},
		{Name: "mode", Type: "uint8"},
	}
	tupleArrayType, err := abi.NewType("tuple[]", "", tupleComponents)
	if err != nil {
		return nil, fmt.Errorf("failed to create tuple[] ABI type: %w", err)
	}

	arguments := abi.Arguments{{Type: tupleArrayType}}

	regs := make([]struct {
		Selector [4]byte
		Handler  common.Address
		Mode     uint8
	}, len(registrations))

	for i, reg := range registrations {
		var selector [4]byte
		copy(selector[:], reg.Selector.Bytes())
		regs[i] = struct {
			Selector [4]byte
			Handler  common.Address
			Mode     uint8
		}{
			Selector: selector,
			Handler:  reg.Handler,
			Mode:     reg.Mode,
		}
	}

	encoded, err := arguments.Pack(regs)
	if err != nil {
		return nil, fmt.Errorf("failed to encode batch fallback registration: %w", err)
	}

	return types.Hex(encoded), nil
}

// EncodeSupportsInterfaceCall encodes a supportsInterface call.
func EncodeSupportsInterfaceCall(interfaceId types.Hex) (types.Hex, error) {
	bytes4Type := mustNewType("bytes4")

	// Function selector for supportsInterface(bytes4)
	selector := CalculateSelector("supportsInterface(bytes4)")

	arguments := abi.Arguments{
		{Type: bytes4Type, Name: "interfaceId"},
	}

	var id [4]byte
	copy(id[:], interfaceId.Bytes())

	params, err := arguments.Pack(id)
	if err != nil {
		return nil, fmt.Errorf("failed to encode supportsInterface call: %w", err)
	}

	// Combine selector and params
	result := make([]byte, 0, len(selector)+len(params))
	result = append(result, selector.Bytes()...)
	result = append(result, params...)

	return types.Hex(result), nil
}

// GetSupportedInterfaceIds returns a list of commonly supported interface IDs.
func GetSupportedInterfaceIds() map[string]types.Hex {
	return map[string]types.Hex{
		"ERC165":               InterfaceERC165,
		"ERC721":               InterfaceERC721,
		"ERC721Receiver":       SelectorERC721Received,
		"ERC1155":              InterfaceERC1155,
		"ERC1155Receiver":      SelectorERC1155Received,
		"ERC1155BatchReceiver": SelectorERC1155BatchReceived,
		"ERC777":               InterfaceERC777,
		"ERC777Receiver":       SelectorERC777TokensReceived,
	}
}
