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

describe('built bundler CLI', () => {
  it.each([
    { args: ['--help'], text: 'bundler <command>' },
    { args: ['run', '--help'], text: '--chain-id' },
  ])(
    'loads ESM dependencies for $args',
    async ({ args, text }) => {
      const { stdout } = await exec(process.execPath, [cli, ...args], options)
      expect(stdout).toContain(text)
    },
    20000
  )

  it('rejects missing credentials before contacting the chain', async () => {
    await expect(
      exec(
        process.execPath,
        [
          cli,
          'run',
          '--chain-id',
          '31337',
          '--rpc-url',
          'http://127.0.0.1:1',
          '--entry-point',
          '0x0000000000000000000000000000000000000001',
          '--beneficiary',
          '0x0000000000000000000000000000000000000002',
        ],
        options
      )
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/private key/i) })
  }, 20000)
})
