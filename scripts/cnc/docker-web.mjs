import { spawn } from 'node:child_process'
import { createServer, request } from 'node:http'
import { createConnection } from 'node:net'

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
  stdio: ['inherit', 'pipe', 'pipe'],
})

let launchToken = ''
let stdoutBuffer = ''

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  stdoutBuffer = `${stdoutBuffer}${String(chunk)}`.slice(-8192)
  const match = /dsh web:\s+http:\/\/[^\s?]+\/\?token=([A-Za-z0-9_-]+)/u.exec(stdoutBuffer)
  if (match) launchToken = match[1]
})
child.stderr.pipe(process.stderr)

function isBareRootRequest(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const target = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  return target.pathname === '/'
    && !target.searchParams.has('token')
}

function shouldBootstrap(req) {
  return isBareRootRequest(req) && !req.headers.cookie
}

const proxy = createServer((clientRequest, clientResponse) => {
  if (shouldBootstrap(clientRequest)) {
    if (!launchToken) {
      clientResponse.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '1' })
      clientResponse.end('Harness is starting; refresh in a moment.\n')
      return
    }
    clientResponse.writeHead(303, {
      location: `/?token=${encodeURIComponent(launchToken)}`,
      'cache-control': 'no-store',
    })
    clientResponse.end()
    return
  }

  const upstreamRequest = request({
    host: '127.0.0.1',
    port: internalPort,
    method: clientRequest.method,
    path: clientRequest.url,
    headers: clientRequest.headers,
  }, (upstreamResponse) => {
    if (upstreamResponse.statusCode === 401 && isBareRootRequest(clientRequest) && launchToken) {
      upstreamResponse.resume()
      clientResponse.writeHead(303, {
        location: `/?token=${encodeURIComponent(launchToken)}`,
        'cache-control': 'no-store',
      })
      clientResponse.end()
      return
    }
    clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(clientResponse)
  })
  clientRequest.on('error', () => upstreamRequest.destroy())
  upstreamRequest.on('error', () => {
    if (!clientResponse.headersSent) clientResponse.writeHead(502)
    clientResponse.end('Harness upstream is unavailable.\n')
  })
  clientRequest.pipe(upstreamRequest)
})

proxy.on('upgrade', (req, socket, head) => {
  const upstream = createConnection({ host: '127.0.0.1', port: internalPort }, () => {
    const headers = Object.entries(req.headers)
      .flatMap(([name, value]) => Array.isArray(value)
        ? value.map((item) => `${name}: ${item}`)
        : value === undefined ? [] : [`${name}: ${value}`])
    upstream.write(`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/${req.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`)
    if (head.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  })
  socket.on('error', () => upstream.destroy())
  upstream.on('error', () => socket.destroy())
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
