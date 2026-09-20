import { MODULE_TYPE, type ModuleRegistryEntry } from '@stablenet/core'
import { describe, expect, it } from 'vitest'
import { registryEntryToCardData } from '../useModuleRegistry'

function entry(overrides: Partial<ModuleRegistryEntry['metadata']> = {}): ModuleRegistryEntry {
  return {
    metadata: {
      address: '0x1111111111111111111111111111111111111111',
      type: MODULE_TYPE.VALIDATOR,
      name: 'Test Validator',
      description: 'A test module',
      version: '1.0.0',
      isVerified: false,
      tags: ['security'],
      ...overrides,
    },
    configSchema: { version: '1', fields: [] },
    addresses: { 31337: '0x1111111111111111111111111111111111111111' },
    supportedChains: [31337],
  }
}

describe('registryEntryToCardData', () => {
  it('does not invent ratings, install counts, or an audit', () => {
    const module = registryEntryToCardData(entry())

    expect(module.id).toBe('test-validator')
    expect(module.installCount).toBeUndefined()
    expect(module.rating).toBeUndefined()
    expect(module.ratingCount).toBeUndefined()
    expect(module.auditStatus).toBe('unverified')
    expect(module.featured).toBe(false)
  })

  it('links an audit only when the registry supplies evidence', () => {
    const module = registryEntryToCardData(
      entry({ auditUrl: 'https://auditor.example/report', isVerified: true })
    )

    expect(module.auditStatus).toBe('audited')
    expect(module.auditUrl).toBe('https://auditor.example/report')
    expect(module.featured).toBe(true)
  })

  it('uses stable installation IDs instead of deriving incompatible names', () => {
    const module = registryEntryToCardData(entry({ name: 'WebAuthn Validator', isVerified: true }))
    expect(module.id).toBe('webauthn-validator')
    expect(module.auditStatus).toBe('official')
  })
})
