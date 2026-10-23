import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url))
const options = {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { PATH: process.env.PATH, NODE_ENV: 'test' },
  timeout: 15000,
}

describe('built paymaster CLI', () => {
  it.each([
    { args: ['--help'], text: 'run' },
    { args: ['run', '--help'], text: '--chain-ids' },
  ])(
    'loads ESM dependencies for $args',
    async ({ args, text }) => {
      const { stdout } = await exec(process.execPath, [cli, ...args], options)
      expect(stdout).toContain(text)
    },
    20000
  )

  it('requires a command', async () => {
    await expect(exec(process.execPath, [cli], options)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Please specify a command'),
    })
  }, 20000)

  it('rejects missing configuration without starting the server', async () => {
    await expect(exec(process.execPath, [cli, 'run'], options)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('Missing configuration'),
    })
  }, 20000)
})
