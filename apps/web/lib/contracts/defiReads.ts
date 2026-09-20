import { type Address, erc20Abi, type PublicClient } from 'viem'
import type { Token } from '@/types'
import type { LendingMarket, LendingPosition, StakingPool, StakingPosition } from '@/types/defi'
import { LENDING_POOL_ABI, STAKING_VAULT_ABI } from './runtimeAbis'

export async function readToken(client: PublicClient, address: Address): Promise<Token> {
  const [name, symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
  ])
  return { address, name, symbol, decimals }
}
export async function readStakingPool(
  client: PublicClient,
  address: Address,
  user: Address
): Promise<{ pool: StakingPool; position: StakingPosition }> {
  const [staking, reward, config, state, stake, rewards] = await Promise.all([
    client.readContract({ address, abi: STAKING_VAULT_ABI, functionName: 'stakingToken' }),
    client.readContract({ address, abi: STAKING_VAULT_ABI, functionName: 'rewardToken' }),
    client.readContract({ address, abi: STAKING_VAULT_ABI, functionName: 'getVaultConfig' }),
    client.readContract({ address, abi: STAKING_VAULT_ABI, functionName: 'getVaultState' }),
    client.readContract({
      address,
      abi: STAKING_VAULT_ABI,
      functionName: 'getStakeInfo',
      args: [user],
    }),
    client.readContract({
      address,
      abi: STAKING_VAULT_ABI,
      functionName: 'pendingRewards',
      args: [user],
    }),
  ])
  const [stakingToken, rewardToken] = await Promise.all([
    readToken(client, staking),
    readToken(client, reward),
  ])
  // Cross-token APR requires an oracle. Do not invent a conversion rate.
  const apr =
    staking.toLowerCase() === reward.toLowerCase() && state.totalStaked > 0n
      ? Number(
          ((state.rewardsRemaining > 0n ? config.rewardRate : 0n) * 31536000n * 10000n) /
            state.totalStaked
        ) / 100
      : null
  return {
    pool: {
      address,
      stakingToken,
      rewardToken,
      minStake: config.minStake,
      maxStake: config.maxStake,
      apr,
      tvl: state.totalStaked,
      isRegistered: config.isActive,
      lockPeriod: config.lockPeriod,
      earlyWithdrawPenalty: config.earlyWithdrawPenalty,
    },
    position: {
      pool: address,
      stakedAmount: stake.amount,
      rewardsEarned: rewards,
      stakingToken,
      rewardToken,
      stakedAt: Number(stake.stakedAt),
      lockUntil: Number(stake.lockUntil),
      penaltyBps: stake.penaltyAtStake,
    },
  }
}
export async function readLendingMarket(
  client: PublicClient,
  pool: Address,
  asset: Address,
  user: Address
): Promise<{ market: LendingMarket; position: LendingPosition }> {
  const [token, reserve, liquidity, supplied, borrowed] = await Promise.all([
    readToken(client, asset),
    client.readContract({
      address: pool,
      abi: LENDING_POOL_ABI,
      functionName: 'getReserveData',
      args: [asset],
    }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [pool] }),
    client.readContract({
      address: pool,
      abi: LENDING_POOL_ABI,
      functionName: 'getDepositBalance',
      args: [asset, user],
    }),
    client.readContract({
      address: pool,
      abi: LENDING_POOL_ABI,
      functionName: 'getBorrowBalance',
      args: [asset, user],
    }),
  ])
  // Pool rates are annualized RAY values. Display APR (no compounding assumption).
  const supplyAPY = Number((reserve.currentLiquidityRate * 10000n) / 10n ** 27n) / 100
  const borrowAPY = Number((reserve.currentBorrowRate * 10000n) / 10n ** 27n) / 100
  return {
    market: {
      asset: token,
      supplyAPY,
      borrowAPY,
      totalSupply: reserve.totalDeposits,
      totalBorrow: reserve.totalBorrows,
      availableLiquidity: liquidity,
      utilizationRate:
        reserve.totalDeposits > 0n
          ? Number((reserve.totalBorrows * 10000n) / reserve.totalDeposits) / 100
          : 0,
    },
    position: {
      asset: token,
      suppliedAmount: supplied,
      borrowedAmount: borrowed,
      supplyAPY,
      borrowAPY,
    },
  }
}
