import { spawn } from 'node:child_process'
import { createConnection, createServer } from 'node:net'

const internalPort = 3080
const publicPort = 3081
const cli = '/opt/deepseek-harness/apps/cli/lib/bin.js'
const patch = '/opt/deepseek-harness/scripts/cnc/qwen-cnc.docker.patch.yml'

const child = spawn(process.execPath, [
  cli,
  'web',
  '--patch', patch,
  '--no-open',
  '--host', '127.0.0.1',
  '--port', String(internalPort),
  '--trusted-host', `127.0.0.1:${publicPort}`,
], {
  env: process.env,
  stdio: 'inherit',
})

const proxy = createServer((client) => {
  const upstream = createConnection({ host: '127.0.0.1', port: internalPort })
  client.on('error', () => upstream.destroy())
  upstream.on('error', () => client.destroy())
  client.pipe(upstream).pipe(client)
})

proxy.listen(publicPort, '0.0.0.0')

function shutdown(signal) {
  proxy.close()
  if (!child.killed) child.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal))
}

child.once('exit', (code, signal) => {
  proxy.close(() => process.exit(code ?? (signal ? 1 : 0)))
})
