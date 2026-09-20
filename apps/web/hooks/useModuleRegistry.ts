'use client'

import { createModuleRegistry, MODULE_TYPE, type ModuleRegistryEntry } from '@stablenet/core'
import { useCallback, useEffect, useState } from 'react'
import { useChainId } from 'wagmi'
import type { ModuleCardData } from '@/components/marketplace/ModuleCard'
import { getModuleEntry } from '@/lib/moduleAddresses'

function mapModuleType(type: bigint): ModuleCardData['moduleType'] {
  switch (type) {
    case MODULE_TYPE.VALIDATOR:
      return 'validator'
    case MODULE_TYPE.EXECUTOR:
      return 'executor'
    case MODULE_TYPE.HOOK:
      return 'hook'
    case MODULE_TYPE.FALLBACK:
      return 'fallback'
    default:
      return 'unknown'
  }
}

function inferCategory(tags: string[]): string {
  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()))
  if (tagSet.has('security') || tagSet.has('ecdsa') || tagSet.has('signature')) return 'security'
  if (tagSet.has('defi') || tagSet.has('swap') || tagSet.has('lending')) return 'defi'
  if (tagSet.has('recovery') || tagSet.has('guardian') || tagSet.has('social'))
    return 'social-recovery'
  if (tagSet.has('governance') || tagSet.has('multisig') || tagSet.has('threshold'))
    return 'governance'
  if (tagSet.has('privacy') || tagSet.has('stealth') || tagSet.has('anonymous')) return 'privacy'
  if (tagSet.has('automation') || tagSet.has('subscription') || tagSet.has('recurring'))
    return 'automation'
  return 'utility'
}

function nameToId(name: string): string {
  const stableIds: Record<string, string> = {
    'ECDSA Validator': 'ecdsa-validator',
    'WebAuthn Validator': 'webauthn-validator',
    'MultiSig Validator': 'multisig-validator',
    'Session Key': 'session-key-executor',
    'Recurring Payment': 'subscription-executor',
    'Spending Limit': 'spending-limit-hook',
    'Token Receiver (ERC-777)': 'token-receiver-fallback',
  }
  if (stableIds[name]) return stableIds[name]
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const INSTALL_SUPPORT: Record<string, { installable: boolean; reason?: string }> = {
  'ecdsa-validator': { installable: true },
  'spending-limit-hook': { installable: true },
  'webauthn-validator': {
    installable: false,
    reason: 'Passkey enrollment and wallet signature routing are not connected yet.',
  },
  'multisig-validator': {
    installable: false,
    reason: 'Multi-signature collection is not connected to the wallet yet.',
  },
  'session-key-executor': {
    installable: false,
    reason: 'Use the Session Keys flow until marketplace permission setup is connected.',
  },
  'subscription-executor': {
    installable: false,
    reason: 'Use the Subscription flow until marketplace schedule setup is connected.',
  },
}

export function registryEntryToCardData(entry: ModuleRegistryEntry): ModuleCardData {
  const metadata = entry.metadata
  const id = nameToId(metadata.name)
  const support = INSTALL_SUPPORT[id] ?? {
    installable: false,
    reason: 'Marketplace installation is not implemented for this module.',
  }
  return {
    id,
    name: metadata.name,
    description: metadata.description,
    version: metadata.version,
    moduleType: mapModuleType(metadata.type),
    category: inferCategory(metadata.tags),
    author: metadata.author ?? 'Unknown',
    auditStatus: metadata.auditUrl ? 'audited' : metadata.isVerified ? 'official' : 'unverified',
    auditUrl: metadata.auditUrl,
    featured: metadata.isVerified,
    tags: metadata.tags,
    installable: support.installable,
    unavailableReason: support.reason,
  }
}

export interface UseModuleRegistryReturn {
  modules: ModuleCardData[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useModuleRegistry(): UseModuleRegistryReturn {
  const chainId = useChainId()
  const [modules, setModules] = useState<ModuleCardData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadModules = useCallback(() => {
    setIsLoading(true)
    setError(null)
    try {
      const entries = createModuleRegistry({ chainId }).getAll()
      setModules(
        entries
          .map(registryEntryToCardData)
          .filter((module) => getModuleEntry(module.id, chainId) !== undefined)
      )
    } catch (cause) {
      setModules([])
      setError(cause instanceof Error ? cause.message : 'Unable to load the module registry')
    } finally {
      setIsLoading(false)
    }
  }, [chainId])

  useEffect(() => loadModules(), [loadModules])

  return { modules, isLoading, error, refetch: loadModules }
}
