import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifactRoot = resolve(root, '../poc-contract/out')
const checkOnly = process.argv.includes('--check')

function loadAbi(artifact, source = artifact, names) {
  const value = JSON.parse(
    readFileSync(resolve(artifactRoot, `${source}.sol/${artifact}.json`), 'utf8')
  ).abi.filter((item) => ['function', 'event', 'error'].includes(item.type))
  return names ? value.filter((item) => names.includes(item.name)) : value
}

const targets = [
  {
    path: 'apps/web/lib/contracts/runtimeAbis.ts',
    values: {
      RECURRING_EXECUTOR_ABI: loadAbi('RecurringPaymentExecutor'),
      SESSION_EXECUTOR_ABI: loadAbi('SessionKeyExecutor'),
      WEIGHTED_VALIDATOR_ABI: loadAbi('WeightedECDSAValidator'),
      STAKING_MODULE_ABI: loadAbi('StakingExecutor'),
      LENDING_MODULE_ABI: loadAbi('LendingExecutor'),
      STAKING_VAULT_ABI: loadAbi('StakingVault'),
      LENDING_POOL_ABI: loadAbi('LendingPool'),
      HEALTH_HOOK_ABI: loadAbi('HealthFactorHook'),
    },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/accountConfig.ts',
    values: {
      ACCOUNT_CONFIG_ABI: loadAbi('Kernel', 'Kernel', [
        'accountId',
        'supportsExecutionMode',
        'supportsModule',
      ]),
    },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/defi.ts',
    values: { MERCHANT_REGISTRY_ABI: loadAbi('MerchantRegistry') },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/entryPoint.ts',
    values: { ENTRY_POINT_ABI: loadAbi('EntryPoint') },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/executors.ts',
    values: {
      SESSION_KEY_EXECUTOR_ABI: loadAbi('SessionKeyExecutor'),
      SWAP_EXECUTOR_ABI: loadAbi('SwapExecutor'),
      LENDING_EXECUTOR_ABI: loadAbi('LendingExecutor'),
      STAKING_EXECUTOR_ABI: loadAbi('StakingExecutor'),
    },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/factory.ts',
    values: { KERNEL_FACTORY_ABI: loadAbi('KernelFactory') },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/hooks.ts',
    values: {
      SPENDING_LIMIT_HOOK_ABI: loadAbi('SpendingLimitHook'),
      HEALTH_FACTOR_HOOK_ABI: loadAbi('HealthFactorHook'),
    },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/kernel.ts',
    values: { KERNEL_ABI: loadAbi('Kernel') },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/module.ts',
    values: { MODULE_INTERFACE_ABI: loadAbi('IModule', 'IERC7579Modules') },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/stealth.ts',
    values: {
      ERC5564_ANNOUNCER_ABI: loadAbi('ERC5564Announcer'),
      ERC6538_REGISTRY_ABI: loadAbi('ERC6538Registry'),
    },
  },
  {
    path: 'packages/sdk-ts/core/src/abis/validators.ts',
    values: {
      ECDSA_VALIDATOR_ABI: loadAbi('ECDSAValidator'),
      WEBAUTHN_VALIDATOR_ABI: loadAbi('WebAuthnValidator'),
      MULTISIG_VALIDATOR_ABI: loadAbi('MultiSigValidator'),
    },
  },
]

function unwrap(node) {
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    node = node.expression
  }
  return node
}

function literal(node) {
  node = unwrap(node)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) throw Error('Unsupported generated ABI property')
        const name = property.name
        const key =
          ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
            ? name.text
            : undefined
        if (key === undefined) throw Error('Unsupported generated ABI property name')
        return [key, literal(property.initializer)]
      })
    )
  }
  throw Error(`Unsupported generated ABI syntax: ${ts.SyntaxKind[node.kind]}`)
}

function readConstants(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const values = {}
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        values[declaration.name.text] = literal(declaration.initializer)
      }
    }
  }
  return values
}

function render(values) {
  return (
    '// Generated from poc-contract compiler artifacts. Run `pnpm contracts:sync` after `forge build`.\n' +
    Object.entries(values)
      .map(([name, abi]) => `export const ${name} = ${JSON.stringify(abi, null, 2)} as const\n`)
      .join('\n')
  )
}

const drift = []
for (const target of targets) {
  const path = resolve(root, target.path)
  if (checkOnly) {
    const current = readConstants(path)
    for (const [name, expected] of Object.entries(target.values)) {
      if (JSON.stringify(current[name]) !== JSON.stringify(expected))
        drift.push(`${target.path}:${name}`)
    }
  } else {
    writeFileSync(path, render(target.values))
  }
}

if (drift.length > 0) {
  throw Error(`Contract ABI drift detected:\n${drift.map((item) => `- ${item}`).join('\n')}`)
}
