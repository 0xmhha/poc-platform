import { describe, expect, it } from 'vitest'
import { getModuleEntry, getRegisteredModuleIds } from '../moduleAddresses'

describe('deployment module registry', () => {
  it('loads a partial deployment without crashing the web app', () => {
    expect(getRegisteredModuleIds()).toContain('ecdsa-validator')
    expect(getRegisteredModuleIds()).toContain('webauthn-validator')
    expect(getModuleEntry('session-key-validator')).toBeUndefined()
    expect(getModuleEntry('spending-limit-hook')).toBeDefined()
    expect(getModuleEntry('token-receiver-fallback')).toBeDefined()
    expect(getModuleEntry('ecdsa-validator', 999999)).toBeUndefined()
  })
  it('never installs a router or bank as an ERC-7579 module', () => {
    expect(getModuleEntry('dex-swap-executor')).toBeUndefined()
    expect(getModuleEntry('stealth-address-fallback')).toBeUndefined()
  })
})
