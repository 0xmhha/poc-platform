'use client'
import { MODULE_TYPE } from '@stablenet/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type Address, encodeFunctionData } from 'viem'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { assertConfirmed, optionalDeployment } from '@/lib/contracts/deployment'
import { encodeRecoveryInit, GUARDIAN_SENTINEL, recoveryParameters } from '@/lib/contracts/recovery'
import { WEIGHTED_VALIDATOR_ABI } from '@/lib/contracts/runtimeAbis'
import { useModule } from './useModule'
import { useSmartAccount } from './useSmartAccount'

export interface Guardian {
  address: Address
  weight: number
  label?: string
}

export interface RecoveryConfig {
  guardians: Guardian[]
  threshold: number
  isInstalled: boolean
}

export interface UseRecoveryModuleReturn {
  config: RecoveryConfig
  isLoading: boolean
  isInstalling: boolean
  error: string | null

  /** Install social recovery module with initial guardians */
  setupRecovery: (guardians: Guardian[], threshold: number) => Promise<boolean>
  /** Add a guardian to existing setup */
  addGuardian: (guardian: Guardian) => Promise<boolean>
  /** Remove a guardian */
  removeGuardian: (address: Address) => Promise<boolean>
  /** Update threshold */
  updateThreshold: (threshold: number) => Promise<boolean>
  /** Check if module is installed */
  checkInstalled: () => Promise<boolean>
  /** Refresh guardian list from chain */
  refresh: () => Promise<void>
  /** Update local guardian label */
  setGuardianLabel: (address: Address, label: string) => void
}

const emptyConfig: RecoveryConfig = { guardians: [], threshold: 0, isInstalled: false }
export function useRecoveryModule(): UseRecoveryModuleReturn {
  const { address } = useAccount()
  const chainId = useChainId()
  const moduleAddress = optionalDeployment(chainId, 'weightedEcdsaValidator')
  const { status } = useSmartAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { buildInstallModuleCall, isModuleInstalled } = useModule()
  const [config, setConfig] = useState<RecoveryConfig>(emptyConfig)
  const [isLoading, setIsLoading] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const delayRef = useRef(0)
  const generation = useRef(0)
  const storageKey = `stablenet:recovery:${chainId}:${address?.toLowerCase()}`
  const loadLabels = useCallback((): Record<string, string> => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}')
    } catch {
      return {}
    }
  }, [storageKey])
  const saveLabels = useCallback(
    (guardians: Guardian[]) => {
      const labels = loadLabels()
      for (const g of guardians)
        if (g.label !== undefined) labels[g.address.toLowerCase()] = g.label
      try {
        localStorage.setItem(storageKey, JSON.stringify(labels))
      } catch {
        /* Labels are optional. */
      }
    },
    [storageKey, loadLabels]
  )
  const checkInstalled = useCallback(async () => {
    if (!address || !status.isSmartAccount || !moduleAddress) return false
    return isModuleInstalled(address, MODULE_TYPE.VALIDATOR, moduleAddress)
  }, [address, status.isSmartAccount, moduleAddress, isModuleInstalled])
  const refresh = useCallback(async () => {
    const id = ++generation.current
    setConfig(emptyConfig)
    setError(null)
    setIsLoading(true)
    try {
      if (!address || !publicClient || !status.isSmartAccount) return
      if (!moduleAddress) throw Error(`Recovery validator is not deployed on chain ${chainId}`)
      if (!(await checkInstalled())) return
      const [, threshold, delay, first] = await publicClient.readContract({
        address: moduleAddress,
        abi: WEIGHTED_VALIDATOR_ABI,
        functionName: 'weightedStorage',
        args: [address],
      })
      let current = first
      const guardians: Guardian[] = []
      const seen = new Set<string>()
      const labels = loadLabels()
      while (current.toLowerCase() !== GUARDIAN_SENTINEL) {
        if (seen.has(current.toLowerCase()) || guardians.length >= 256)
          throw Error('Invalid guardian list')
        seen.add(current.toLowerCase())
        const [weight, next] = await publicClient.readContract({
          address: moduleAddress,
          abi: WEIGHTED_VALIDATOR_ABI,
          functionName: 'guardian',
          args: [current, address],
        })
        if (weight === 0) throw Error('Invalid guardian weight returned by validator')
        guardians.push({ address: current, weight, label: labels[current.toLowerCase()] })
        current = next
      }
      if (id !== generation.current) return
      delayRef.current = delay
      setConfig({ guardians, threshold, isInstalled: true })
    } catch (err) {
      if (id === generation.current)
        setError(err instanceof Error ? err.message : 'Recovery query failed')
    } finally {
      if (id === generation.current) setIsLoading(false)
    }
  }, [
    address,
    publicClient,
    status.isSmartAccount,
    moduleAddress,
    chainId,
    checkInstalled,
    loadLabels,
  ])
  const write = useCallback(
    async (guardians: Guardian[], threshold: number, install: boolean): Promise<boolean> => {
      if (!address || !walletClient || !publicClient || !moduleAddress || !status.isSmartAccount) {
        setError('Connect a smart account on a chain with a deployed recovery validator')
        return false
      }
      setIsInstalling(true)
      setError(null)
      try {
        const params = recoveryParameters(
          guardians,
          threshold,
          install ? 0 : delayRef.current,
          address
        )
        const call = install
          ? buildInstallModuleCall(address, {
              moduleType: MODULE_TYPE.VALIDATOR,
              module: moduleAddress,
              initData: encodeRecoveryInit(guardians, threshold, 0, address),
            })
          : {
              to: moduleAddress,
              value: 0n,
              data: encodeFunctionData({
                abi: WEIGHTED_VALIDATOR_ABI,
                functionName: 'renew',
                args: params,
              }),
            }
        const hash = await walletClient.sendTransaction({ ...call, account: address })
        assertConfirmed(await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 }))
        saveLabels(guardians)
        await refresh()
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message.split('\n')[0] : 'Recovery update failed')
        return false
      } finally {
        setIsInstalling(false)
      }
    },
    [
      address,
      walletClient,
      publicClient,
      moduleAddress,
      status.isSmartAccount,
      buildInstallModuleCall,
      saveLabels,
      refresh,
    ]
  )
  useEffect(() => {
    void refresh()
    return () => {
      generation.current++
    }
  }, [refresh])
  return {
    config,
    isLoading,
    isInstalling,
    error,
    checkInstalled,
    refresh,
    setupRecovery: (guardians, threshold) => write(guardians, threshold, true),
    addGuardian: (guardian) => write([...config.guardians, guardian], config.threshold, false),
    removeGuardian: (guardianAddress) =>
      write(
        config.guardians.filter((g) => g.address.toLowerCase() !== guardianAddress.toLowerCase()),
        config.threshold,
        false
      ),
    updateThreshold: (threshold) => write(config.guardians, threshold, false),
    setGuardianLabel: (guardianAddress, label) => {
      saveLabels([{ address: guardianAddress, weight: 0, label }])
      setConfig((prev) => ({
        ...prev,
        guardians: prev.guardians.map((g) =>
          g.address.toLowerCase() === guardianAddress.toLowerCase() ? { ...g, label } : g
        ),
      }))
    },
  }
}
