import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
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

describe('built registry CLI', () => {
  it.each([
    { args: ['--help'], text: 'registry <command>' },
    { args: ['run', '--help'], text: '--data-dir' },
  ])('loads ESM dependencies for $args', async ({ args, text }) => {
    const { stdout } = await exec(process.execPath, [cli, ...args], options)
    expect(stdout).toContain(text)
  })

  it('requires a command', async () => {
    await expect(exec(process.execPath, [cli], options)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Please specify a command'),
    })
  })

  it('rejects an import without a file', async () => {
    await expect(exec(process.execPath, [cli, 'import'], options)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Not enough non-option arguments'),
    })
  })

  it.each([
    'list',
    'export',
  ])('awaits the %s handler and preserves option parsing', async (command) => {
    const requests: string[] = []
    const contracts = [
      {
        chainId: 31337,
        name: 'CliFixture',
        address: '0x0000000000000000000000000000000000000001',
        version: '1.0.0',
        tags: ['demo'],
      },
    ]
    const server = createServer((req, res) => {
      requests.push(req.url ?? '')
      res.setHeader('Content-Type', 'application/json')
      setTimeout(() => res.end(JSON.stringify(contracts)), 50)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const { port } = server.address() as { port: number }
      const args = [command, '--chain', '31337', '--url', `http://127.0.0.1:${port}`]
      if (command === 'list') args.push('--tag', 'demo')
      const { stdout } = await exec(process.execPath, [cli, ...args], options)
      expect(requests).toEqual([
        `/api/v1/contracts?chainId=31337${command === 'list' ? '&tag=demo' : ''}`,
      ])
      if (command === 'list') expect(stdout).toContain('CliFixture (chain: 31337)')
      else expect(JSON.parse(stdout)).toEqual(contracts)
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
