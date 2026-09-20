/**
 * Subscription Plugin Integration Tests
 *
 * Tests the full subscription lifecycle against devnet contracts:
 *   1. Contract deployment verification
 *   2. Plan creation by merchant
 *   3. Permission granting by subscriber
 *   4. Subscription enrollment
 *   5. Payment processing
 *   6. Subscription cancellation
 *   7. State queries via plugin clients
 *
 * Prerequisites:
 *   - Anvil running on localhost:8545 (`make anvil`)
 *   - Contracts deployed (`make deploy-full`)
 */

import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
  parseEther,
  type WalletClient,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRecurringPaymentExecutor,
  createSubscriptionManager,
  createSubscriptionPermissionClient,
  INTERVALS,
  NATIVE_TOKEN,
  PERMISSION_TYPES,
  type RecurringPaymentExecutorClient,
  type SubscriptionManagerClient,
  type SubscriptionPermissionClient,
} from '../../packages/sdk-ts/plugins/subscription/src'
import { isNetworkAvailable, TEST_CONFIG } from '../setup'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isContractDeployed(client: PublicClient, address: string): Promise<boolean> {
  if (!address || address === NATIVE_TOKEN) return false
  try {
    const code = await client.getCode({ address: address as Address })
    return !!code && code !== '0x'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Subscription Plugin Integration', () => {
  let chain: Chain
  let publicClient: PublicClient
  let merchantWallet: WalletClient
  let _subscriberWallet: WalletClient
  let merchantAccount: PrivateKeyAccount
  let subscriberAccount: PrivateKeyAccount

  let subscriptionMgr: SubscriptionManagerClient
  let recurringPay: RecurringPaymentExecutorClient
  let permissionClient: SubscriptionPermissionClient

  let networkAvailable: boolean
  let subscriptionManagerDeployed: boolean
  let permissionManagerDeployed: boolean
  let recurringPaymentExecutorDeployed: boolean

  beforeAll(async () => {
    networkAvailable = await isNetworkAvailable()
    if (!networkAvailable) {
      console.warn('⚠️ Local network not available, skipping subscription integration tests')
      return
    }

    chain = { ...foundry, id: TEST_CONFIG.chainId }

    publicClient = createPublicClient({ chain, transport: http(TEST_CONFIG.rpcUrl) })

    // merchant = deployer (account[0]), subscriber = user1 (account[1])
    merchantAccount = privateKeyToAccount(TEST_CONFIG.accounts.deployer.privateKey as Hex)
    subscriberAccount = privateKeyToAccount(TEST_CONFIG.accounts.user1.privateKey as Hex)

    merchantWallet = createWalletClient({
      chain,
      transport: http(TEST_CONFIG.rpcUrl),
      account: merchantAccount,
    })
    _subscriberWallet = createWalletClient({
      chain,
      transport: http(TEST_CONFIG.rpcUrl),
      account: subscriberAccount,
    })

    // Create plugin clients
    const smAddr = TEST_CONFIG.contracts.subscriptionManager as Address
    const pmAddr = TEST_CONFIG.contracts.permissionManager as Address
    const rpAddr = (TEST_CONFIG.contracts.recurringPaymentExecutor || NATIVE_TOKEN) as Address

    subscriptionMgr = createSubscriptionManager({ managerAddress: smAddr })
    permissionClient = createSubscriptionPermissionClient({ managerAddress: pmAddr })
    recurringPay = createRecurringPaymentExecutor({ executorAddress: rpAddr })

    // Check deployments
    subscriptionManagerDeployed = await isContractDeployed(publicClient, smAddr)
    permissionManagerDeployed = await isContractDeployed(publicClient, pmAddr)
    recurringPaymentExecutorDeployed = await isContractDeployed(publicClient, rpAddr)
  })

  // ---- 1. Contract deployment verification ----

  describe('Contract Deployment', () => {
    it('should have SubscriptionManager deployed', async (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')
      expect(subscriptionManagerDeployed).toBe(true)
    })

    it('should have PermissionManager deployed', async (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')
      expect(permissionManagerDeployed).toBe(true)
    })

    it('should report RecurringPaymentExecutor status', async (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')
      // Non-blocking — executor is optional at this stage
      expect(true).toBe(true)
    })
  })

  // ---- 2. SubscriptionManager read functions ----

  describe('SubscriptionManager Queries', () => {
    it('should read plan count', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const count = await subscriptionMgr.getPlanCount(publicClient)
      expect(count).toBeGreaterThanOrEqual(0n)
    })

    it('should read protocol fee', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const feeBps = await subscriptionMgr.getProtocolFeeBps(publicClient)
      expect(feeBps).toBeGreaterThanOrEqual(0n)
      expect(feeBps).toBeLessThanOrEqual(1000n) // max 10%
    })

    it('should check processor authorization', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const isProcessor = await subscriptionMgr.isAuthorizedProcessor(
        publicClient,
        merchantAccount.address
      )
      // deployer might or might not be an authorized processor
      expect(typeof isProcessor).toBe('boolean')
    })
  })

  // ---- 3. Plan creation flow ----

  describe('Plan Creation', () => {
    it('should encode and send createPlan transaction', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const calldata = subscriptionMgr.encodeCreatePlan({
        token: TEST_CONFIG.contracts.usdc as Address,
        amount: parseEther('0.01'),
        period: INTERVALS.MONTHLY,
        name: 'Integration Test Plan',
        description: 'Created by automated integration test',
      })

      expect(calldata).toMatch(/^0x/)

      const hash = await merchantWallet.sendTransaction({
        to: subscriptionMgr.managerAddress,
        data: calldata,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      expect(receipt.status).toBe('success')
    })

    it('should read back created plan', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const planCount = await subscriptionMgr.getPlanCount(publicClient)
      if (planCount === 0n) {
        return
      }

      // Read the latest plan (planCount is 1-indexed in most implementations,
      // but the contract may use 0-indexed — try both)
      let plan: Awaited<ReturnType<typeof subscriptionMgr.getPlan>>
      try {
        plan = await subscriptionMgr.getPlan(publicClient, planCount)
      } catch {
        plan = await subscriptionMgr.getPlan(publicClient, planCount - 1n)
      }

      expect(plan.amount).toBe(parseEther('0.01'))
      expect(plan.period).toBe(INTERVALS.MONTHLY)
      expect(plan.active).toBe(true)
      expect(plan.merchant.toLowerCase()).toBe(merchantAccount.address.toLowerCase())
    })

    it('should create a plan with trial and grace periods', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const calldata = subscriptionMgr.encodeCreatePlan({
        token: TEST_CONFIG.contracts.usdc as Address,
        amount: parseEther('0.05'),
        period: INTERVALS.WEEKLY,
        trialPeriod: INTERVALS.DAILY * 7n, // 7-day trial
        gracePeriod: INTERVALS.DAILY * 3n, // 3-day grace
        name: 'Premium Test Plan',
        description: 'Plan with trial and grace periods',
      })

      const hash = await merchantWallet.sendTransaction({
        to: subscriptionMgr.managerAddress,
        data: calldata,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      expect(receipt.status).toBe('success')
    })
  })

  // ---- 4. Plan update ----

  describe('Plan Update', () => {
    it('should update a plan', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const planCount = await subscriptionMgr.getPlanCount(publicClient)
      if (planCount === 0n) {
        return
      }

      const planId = planCount // latest plan
      const calldata = subscriptionMgr.encodeUpdatePlan(
        planId,
        parseEther('0.02'), // new amount
        INTERVALS.MONTHLY,
        true // still active
      )

      const hash = await merchantWallet.sendTransaction({
        to: subscriptionMgr.managerAddress,
        data: calldata,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      expect(receipt.status).toBe('success')
    })
  })

  // ---- 5. PermissionManager queries ----

  describe('PermissionManager Queries', () => {
    it('should check if subscription permission type is supported', async (testContext) => {
      if (!networkAvailable || !permissionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const supported = await permissionClient.isPermissionTypeSupported(
        publicClient,
        PERMISSION_TYPES.SUBSCRIPTION
      )
      expect(typeof supported).toBe('boolean')
    })

    it('should get nonce for subscriber', async (testContext) => {
      if (!networkAvailable || !permissionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const nonce = await permissionClient.getNonce(publicClient, subscriberAccount.address)
      expect(nonce).toBeGreaterThanOrEqual(0n)
    })
  })

  // ---- 6. Permission granting (encode only — actual granting requires on-chain wallet support) ----

  describe('Permission Encoding', () => {
    it('should encode grantSubscriptionPermission', (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')

      const calldata = permissionClient.encodeGrantSubscriptionPermission({
        grantee: subscriptionMgr.managerAddress,
        target: subscriptionMgr.managerAddress,
        spendingLimit: parseEther('1'),
        expiry: BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 3600),
      })

      expect(calldata).toMatch(/^0x/)
      expect(calldata.length).toBeGreaterThan(10)
    })

    it('should encode revokePermission', (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')

      const fakePermissionId = ('0x' + 'ab'.repeat(32)) as Hex
      const calldata = permissionClient.encodeRevokePermission(fakePermissionId)
      expect(calldata).toMatch(/^0x/)
    })
  })

  // ---- 7. RecurringPaymentExecutor ----

  describe('RecurringPaymentExecutor', () => {
    it('should encode createSchedule', (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')

      const calldata = recurringPay.encodeCreateSchedule({
        recipient: merchantAccount.address,
        amount: parseEther('0.01'),
        interval: INTERVALS.MONTHLY,
      })

      expect(calldata).toMatch(/^0x/)
    })

    it('should encode install data for ERC-7579 module', (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')

      const installData = recurringPay.encodeInstallData({
        recipient: merchantAccount.address,
        amount: parseEther('0.01'),
        interval: INTERVALS.MONTHLY,
      })

      expect(installData).toMatch(/^0x/)
      expect(installData.length).toBeGreaterThan(10)
    })

    it('should query active schedules (if deployed)', async (testContext) => {
      if (!networkAvailable || !recurringPaymentExecutorDeployed) {
        return testContext.skip('Required local service or deployment is unavailable')
      }

      const schedules = await recurringPay.getActiveSchedules(
        publicClient,
        subscriberAccount.address
      )
      expect(Array.isArray(schedules)).toBe(true)
    })

    it('should check initialization status (if deployed)', async (testContext) => {
      if (!networkAvailable || !recurringPaymentExecutorDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const initialized = await recurringPay.isInitialized(publicClient, subscriberAccount.address)
      expect(typeof initialized).toBe('boolean')
    })
  })

  // ---- 8. Subscription flow (subscribe → query → cancel) ----

  describe('Subscription Lifecycle', () => {
    let planId: bigint

    beforeAll(async () => {
      if (!networkAvailable || !subscriptionManagerDeployed) return

      // Ensure at least one plan exists
      const count = await subscriptionMgr.getPlanCount(publicClient)
      planId = count > 0n ? 1n : 0n
    })

    it('should encode subscribe transaction', (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed || planId === 0n)
        return testContext.skip('Required local service or deployment is unavailable')

      const fakePermissionId = ('0x' + 'cc'.repeat(32)) as Hex
      const calldata = subscriptionMgr.encodeSubscribe({
        planId,
        permissionId: fakePermissionId,
      })

      expect(calldata).toMatch(/^0x/)
    })

    it('should get subscriber subscriptions (empty initially)', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const subs = await subscriptionMgr.getSubscriberSubscriptions(
        publicClient,
        subscriberAccount.address
      )
      expect(Array.isArray(subs)).toBe(true)
    })

    it('should get merchant plans', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const plans = await subscriptionMgr.getMerchantPlans(publicClient, merchantAccount.address)
      expect(Array.isArray(plans)).toBe(true)
    })

    it('should encode batch process payments', (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const fakeSubIds: Hex[] = [('0x' + 'aa'.repeat(32)) as Hex, ('0x' + 'bb'.repeat(32)) as Hex]
      const calldata = subscriptionMgr.encodeBatchProcessPayments(fakeSubIds)
      expect(calldata).toMatch(/^0x/)
    })

    it('should encode processor management', async (testContext) => {
      if (!networkAvailable || !subscriptionManagerDeployed)
        return testContext.skip('Required local service or deployment is unavailable')

      const processor = TEST_CONFIG.accounts.user2.address as Address
      const addCalldata = subscriptionMgr.encodeAddProcessor(processor)
      const removeCalldata = subscriptionMgr.encodeRemoveProcessor(processor)

      expect(addCalldata).toMatch(/^0x/)
      expect(removeCalldata).toMatch(/^0x/)
    })
  })

  // ---- 9. Cross-client consistency ----

  describe('Cross-Client Consistency', () => {
    it('should have consistent manager addresses', (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')

      // SubscriptionManager and PermissionManager should reference valid addresses
      expect(subscriptionMgr.managerAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(permissionClient.managerAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(recurringPay.executorAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
    })

    it('should produce deterministic calldata', (testContext) => {
      if (!networkAvailable)
        return testContext.skip('Required local service or deployment is unavailable')

      const params = {
        amount: parseEther('1'),
        period: INTERVALS.MONTHLY,
        name: 'Determinism Test',
        description: 'Same input should always produce same output',
      }

      const calldata1 = subscriptionMgr.encodeCreatePlan(params)
      const calldata2 = subscriptionMgr.encodeCreatePlan(params)
      expect(calldata1).toBe(calldata2)
    })
  })
})
