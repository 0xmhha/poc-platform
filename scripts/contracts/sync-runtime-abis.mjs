import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const contracts = {
  RecurringPaymentExecutor: 'RECURRING_EXECUTOR_ABI',
  SessionKeyExecutor: 'SESSION_EXECUTOR_ABI',
  WeightedECDSAValidator: 'WEIGHTED_VALIDATOR_ABI',
  StakingExecutor: 'STAKING_MODULE_ABI',
  LendingExecutor: 'LENDING_MODULE_ABI',
  StakingVault: 'STAKING_VAULT_ABI',
  LendingPool: 'LENDING_POOL_ABI',
  HealthFactorHook: 'HEALTH_HOOK_ABI',
}
const text =
  '// Generated from poc-contract compiler artifacts. Run scripts/contracts/sync-runtime-abis.mjs after forge build.\n' +
  Object.entries(contracts)
    .map(([name, constant]) => {
      const artifact = JSON.parse(
        readFileSync(resolve(root, `../poc-contract/out/${name}.sol/${name}.json`), 'utf8')
      )
      const abi = artifact.abi.filter((x) => ['function', 'event', 'error'].includes(x.type))
      return `export const ${constant} = ${JSON.stringify(abi, null, 2)} as const\n`
    })
    .join('\n')
const target = resolve(root, 'apps/web/lib/contracts/runtimeAbis.ts')
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== text)
    throw Error('Runtime ABI drift: regenerate after compiling contracts')
} else writeFileSync(target, text)
