import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FilePersistence } from '../../src/store/file-persistence'
import { InMemoryStore } from '../../src/store/memory-store'
import { createLogger } from '../../src/utils/logger'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.map((dir) => rm(dir, { force: true, recursive: true })))
  directories.length = 0
})
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'contract-registry-'))
  directories.push(path)
  return path
}
describe('atomic contract registry persistence', () => {
  it('serializes writes and restores the latest complete snapshot', async () => {
    const path = await directory()
    const persistence = new FilePersistence(path, createLogger('error', false))
    const store = new InMemoryStore()
    store.setContract({
      chainId: 1,
      name: 'token',
      tags: [],
      version: '1',
      metadata: {},
      address: '0x1111111111111111111111111111111111111111',
    })
    const first = persistence.save(store)
    store.setContract({
      chainId: 1,
      name: 'token',
      tags: [],
      version: '1',
      metadata: {},
      address: '0x2222222222222222222222222222222222222222',
    })
    await Promise.all([first, persistence.save(store)])
    const restored = new InMemoryStore()
    await persistence.load(restored)
    expect(restored.getContract(1, 'token')?.address).toBe(
      '0x2222222222222222222222222222222222222222'
    )
    expect(JSON.parse(await readFile(join(path, 'registry.json'), 'utf8')).sets).toEqual([])
  })
  it('refuses corrupted snapshots instead of overwriting with an empty registry', async () => {
    const path = await directory()
    await writeFile(join(path, 'registry.json'), '{bad')
    const persistence = new FilePersistence(path, createLogger('error', false))
    await expect(persistence.load(new InMemoryStore())).rejects.toThrow()
  })
})
