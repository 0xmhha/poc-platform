import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Logger } from '../utils/logger'
import type { InMemoryStore } from './memory-store'
import type { AddressSet, ContractEntry } from './types'

interface PersistedData<T> {
  readonly version: 1
  readonly updatedAt: string
  readonly entries: readonly T[]
}

export class FilePersistence {
  private readonly snapshotPath: string
  private saveQueue: Promise<void> = Promise.resolve()
  private readonly contractsPath: string
  private readonly setsPath: string
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly debounceMs: number
  private readonly logger: Logger

  constructor(dataDir: string, logger: Logger, debounceMs = 100) {
    this.snapshotPath = join(dataDir, 'registry.json')
    this.contractsPath = join(dataDir, 'contracts.json')
    this.setsPath = join(dataDir, 'sets.json')
    this.debounceMs = debounceMs
    this.logger = logger.child({ module: 'persistence' })
  }

  async load(store: InMemoryStore): Promise<void> {
    if (existsSync(this.snapshotPath)) {
      const snapshot = JSON.parse(await readFile(this.snapshotPath, 'utf8'))
      if (
        snapshot.version !== 1 ||
        !Array.isArray(snapshot.contracts) ||
        !Array.isArray(snapshot.sets)
      )
        throw Error('Invalid registry snapshot')
      store.loadFromData(snapshot.contracts, snapshot.sets)
      return
    }
    const contracts = await this.loadFile<ContractEntry>(this.contractsPath)
    const sets = await this.loadFile<AddressSet>(this.setsPath)

    store.loadFromData(contracts, sets)

    this.logger.info({ contracts: contracts.length, sets: sets.length }, 'Loaded persisted data')
  }

  scheduleSave(store: InMemoryStore): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      this.save(store).catch((err) => {
        this.logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'Failed to persist data'
        )
      })
    }, this.debounceMs)
  }

  async save(store: InMemoryStore): Promise<void> {
    const content = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      contracts: store.getAllContracts(),
      sets: store.getAllSets(),
    })
    const operation = this.saveQueue
      .catch(() => {})
      .then(async () => {
        await this.ensureDir(this.snapshotPath)
        const temporary = `${this.snapshotPath}.${randomUUID()}.tmp`
        try {
          const file = await open(temporary, 'wx', 0o600)
          try {
            await file.writeFile(content, 'utf8')
            await file.sync()
          } finally {
            await file.close()
          }
          await rename(temporary, this.snapshotPath)
        } finally {
          await rm(temporary, { force: true })
        }
      })
    this.saveQueue = operation
    await operation
  }

  async flush(store: InMemoryStore): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    await this.save(store)
  }

  private async loadFile<T>(path: string): Promise<T[]> {
    if (!existsSync(path)) return []

    try {
      const content = await readFile(path, 'utf-8')
      const data = JSON.parse(content) as PersistedData<T>

      if (data.version !== 1) {
        throw new Error('Unsupported registry data version')
      }

      return [...data.entries]
    } catch (err) {
      this.logger.warn(
        { path, error: err instanceof Error ? err.message : String(err) },
        'Failed to load persisted file'
      )
      throw err
    }
  }

  private async ensureDir(filePath: string): Promise<void> {
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
  }
}
