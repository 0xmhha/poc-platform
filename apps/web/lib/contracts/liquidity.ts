import { parseAbi } from 'viem'
export const PAIR_ABI = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function factory() view returns (address)',
  'function allPairsLength() view returns (uint256)',
  'function allPairs(uint256) view returns (address)',
])
export const V3_POOL_ABI = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)',
  'function getPool(address,address,uint24) view returns (address)',
])
export const POSITION_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
  'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)',
  'function positions(uint256) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)',
  'function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline) params) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)',
  'function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline) params) payable returns (uint256 amount0,uint256 amount1)',
  'function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max) params) payable returns (uint256 amount0,uint256 amount1)',
  'function multicall(bytes[] data) payable returns (bytes[])',
  'function factory() view returns (address)',
])
export const Q96 = 1n << 96n
export function amountsForLiquidity(sqrt: bigint, lower: bigint, upper: bigint, liquidity: bigint) {
  const price = sqrt < lower ? lower : sqrt > upper ? upper : sqrt
  return {
    amount0: (liquidity * (upper - price) * Q96) / price / upper,
    amount1: (liquidity * (price - lower)) / Q96,
  }
}
export function liquidityForAmounts(
  sqrt: bigint,
  lower: bigint,
  upper: bigint,
  amount0: bigint,
  amount1: bigint
) {
  const l0 = (a: bigint, b: bigint) => (amount0 * a * b) / Q96 / (b - a)
  const l1 = (a: bigint, b: bigint) => (amount1 * Q96) / (b - a)
  if (sqrt <= lower) return l0(lower, upper)
  if (sqrt >= upper) return l1(lower, upper)
  const a = l0(sqrt, upper),
    b = l1(lower, sqrt)
  return a < b ? a : b
}
