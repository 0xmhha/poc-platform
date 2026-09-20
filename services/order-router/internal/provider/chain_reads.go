package provider

import (
	"context"
	"fmt"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"math/big"
	"strings"
)

const poolReadABI = `[
 {"type":"function","name":"getPool","inputs":[{"type":"address"},{"type":"address"},{"type":"uint24"}],"outputs":[{"type":"address"}]},
 {"type":"function","name":"factory","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"getPair","inputs":[{"type":"address"},{"type":"address"}],"outputs":[{"type":"address"}]},
 {"type":"function","name":"token0","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"token1","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"getReserves","inputs":[],"outputs":[{"type":"uint112"},{"type":"uint112"},{"type":"uint32"}]},
 {"type":"function","name":"totalSupply","inputs":[],"outputs":[{"type":"uint256"}]}
]`

func readPool(ctx context.Context, client *ethclient.Client, address common.Address, method string, args ...interface{}) ([]interface{}, error) {
	parsed, err := abi.JSON(strings.NewReader(poolReadABI))
	if err != nil {
		return nil, err
	}
	data, err := parsed.Pack(method, args...)
	if err != nil {
		return nil, err
	}
	result, err := client.CallContract(ctx, ethereum.CallMsg{To: &address, Data: data}, nil)
	if err != nil {
		return nil, err
	}
	return parsed.Unpack(method, result)
}
func (p *UniswapV2Provider) chainClient(ctx context.Context) (*ethclient.Client, error) {
	client, err := ethclient.DialContext(ctx, p.rpcURL)
	if err != nil {
		return nil, err
	}
	chain, err := client.ChainID(ctx)
	if err != nil {
		client.Close()
		return nil, err
	}
	if chain.Cmp(big.NewInt(int64(p.chainID))) != 0 {
		client.Close()
		return nil, fmt.Errorf("RPC chain does not match configured chain")
	}
	return client, nil
}

func (p *UniswapV3Provider) deployedPool(ctx context.Context, tokenIn, tokenOut string, fee int) (common.Address, error) {
	client, err := p.getClient()
	if err != nil {
		return common.Address{}, err
	}
	chain, err := client.ChainID(ctx)
	if err != nil {
		return common.Address{}, err
	}
	if chain.Cmp(big.NewInt(int64(p.chainID))) != 0 {
		return common.Address{}, fmt.Errorf("RPC chain does not match configured chain")
	}
	factory, err := readPool(ctx, client, common.HexToAddress(p.routerAddr), "factory")
	if err != nil {
		return common.Address{}, err
	}
	result, err := readPool(ctx, client, factory[0].(common.Address), "getPool", common.HexToAddress(tokenIn), common.HexToAddress(tokenOut), big.NewInt(int64(fee)))
	if err != nil {
		return common.Address{}, err
	}
	address := result[0].(common.Address)
	if address == (common.Address{}) {
		return address, fmt.Errorf("pool is not deployed")
	}
	return address, nil
}
