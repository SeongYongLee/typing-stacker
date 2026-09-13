import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.BROWSER_BASE_URL ?? 'http://127.0.0.1:5176'
const server = process.env.BROWSER_BASE_URL ? null : spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', '5176', '--strictPort'], { stdio: 'inherit' })
const available = ['input-mode', 'menu-ui', 'mobile-start', 'result-layout', 'tutorial-flow']
const checks = process.argv.length > 2 ? process.argv.slice(2) : available
try {
  if (checks.some(name => !available.includes(name))) throw new Error('Unknown browser check')
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server && server.exitCode !== null) throw new Error('Vite exited before becoming ready')
    try { ready = (await fetch(base)).ok } catch { /* server is starting */ }
    if (ready) break
    await delay(100)
  }
  if (!ready) throw new Error(`Vite did not become ready: ${base}`)
  for (const name of checks) {
    await new Promise((resolve, reject) => {
      const check = spawn(process.execPath, [`scripts/check-${name}.mjs`, base], { stdio: 'inherit' })
      check.once('error', reject)
      check.once('exit', code => code === 0 ? resolve() : reject(new Error(`${name}: exit ${code}`)))
    })
  }
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
}
