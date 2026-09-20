import { type Address, decodeFunctionData, type Hex, isAddress, parseAbi, zeroAddress } from 'viem'
import type { SwapQuote } from '@/types'
export const SWAP_ROUTER_ABI = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[])',
  'function swapExactETHForTokens(uint256 amountOutMin,address[] path,address to,uint256 deadline) payable returns (uint256[])',
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)',
  'function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum) params) payable returns (uint256)',
])
export function validateSwapCall(
  data: Hex,
  value: bigint,
  quote: SwapQuote,
  recipient: Address,
  minAmountOut: bigint
) {
  const decoded = decodeFunctionData({ abi: SWAP_ROUTER_ABI, data })
  let input: bigint, minimum: bigint, to: Address, deadline: bigint, first: Address, last: Address
  if (decoded.functionName === 'swapExactTokensForTokens') {
    const [amountIn, amountOutMin, path, target, end] = decoded.args
    input = amountIn
    minimum = amountOutMin
    to = target
    deadline = end
    first = path[0]
    last = path[path.length - 1]
  } else if (decoded.functionName === 'swapExactETHForTokens') {
    const [amountOutMin, path, target, end] = decoded.args
    input = value
    minimum = amountOutMin
    to = target
    deadline = end
    first = zeroAddress
    last = path[path.length - 1]
  } else {
    const [p] = decoded.args
    input = p.amountIn
    minimum = p.amountOutMinimum
    to = p.recipient
    deadline = p.deadline
    if ('path' in p) {
      if ((p.path.length - 2) / 2 < 43 || ((p.path.length - 2) / 2 - 20) % 23 !== 0)
        throw Error('Invalid V3 path')
      first = p.path.slice(0, 42) as Address
      last = `0x${p.path.slice(-40)}`
    } else {
      first = p.tokenIn
      last = p.tokenOut
    }
  }
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (
    !isAddress(first) ||
    !isAddress(last) ||
    first.toLowerCase() !== quote.tokenIn.address.toLowerCase() ||
    last.toLowerCase() !== quote.tokenOut.address.toLowerCase() ||
    to.toLowerCase() !== recipient.toLowerCase() ||
    input !== quote.amountIn ||
    minimum < minAmountOut ||
    deadline <= now ||
    deadline > now + 1800n
  )
    throw Error('Router calldata does not match the accepted swap')
  const expectedValue = quote.tokenIn.address === zeroAddress ? quote.amountIn : 0n
  if (value !== expectedValue) throw Error('Unexpected swap value')
}
