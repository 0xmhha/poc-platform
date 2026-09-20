import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ModuleStore } from '../src/store/memory-store'

const directories: string[] = []
afterEach(() => {
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
  directories.length = 0
})
function path() {
  const dir = mkdtempSync(join(tmpdir(), 'module-registry-'))
  directories.push(dir)
  return join(dir, 'state.json')
}
describe('durable module registry', () => {
  it('preserves edits across restart and reseeding', () => {
    const file = path()
    const store = new ModuleStore(file)
    store.seedDefaults()
    const first = store.listModules()[0]
    store.updateModule(first.id, { description: 'Operator-reviewed metadata' })
    const restarted = new ModuleStore(file)
    restarted.seedDefaults()
    expect(restarted.getModule(first.id)?.description).toBe('Operator-reviewed metadata')
    expect(restarted.getModuleCount()).toBe(8)
  })
  it('does not publish fabricated audits, statistics or deployments', () => {
    const store = new ModuleStore()
    store.seedDefaults()
    for (const module of store.listModules()) {
      expect(module.addresses).toEqual({})
      expect(module.auditStatus).toBe('unaudited')
      expect(module.installCount).toBe(0)
      expect(module.ratingCount).toBe(0)
    }
  })
  it('rejects a corrupted journal rather than serving an empty registry', () => {
    const file = path()
    writeFileSync(file, '{broken')
    expect(() => new ModuleStore(file)).toThrow()
  })
  it('rolls back an edit when persistence fails', () => {
    const file = path()
    const store = new ModuleStore(file)
    store.seedDefaults()
    const first = store.listModules()[0]
    rmSync(file)
    const parent = file.slice(0, file.lastIndexOf('/'))
    rmSync(parent, { recursive: true })
    writeFileSync(parent, 'blocked')
    expect(() => store.updateModule(first.id, { description: 'lost' })).toThrow()
    expect(store.getModule(first.id)?.description).toBe(first.description)
  })
})
