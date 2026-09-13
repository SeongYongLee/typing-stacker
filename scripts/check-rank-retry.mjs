import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const base = process.argv[2] ?? 'http://127.0.0.1:5183/'
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 780 } : { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    // Never submit fixture scores to the real ranking server.
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort())
    await page.goto(base)
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { ResultScreen } = await import('/src/screens/ResultScreen.tsx')
      const originalFetch = window.fetch
      window.requests = []
      window.fetch = (url, init) => {
        if (!String(url).endsWith('/rank/run')) return originalFetch(url, init)
        return new Promise((resolve, reject) => {
          const request = { resolve, reject, signal: init.signal, done: false }
          window.requests.push(request)
          init.signal.addEventListener('abort', () => { request.done = true; reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
        })
      }
      window.reply = kind => {
        const request = window.requests.find(request => !request.done)
        if (!request) throw new Error('No pending request')
        request.done = true
        if (kind === 'offline') request.reject(new TypeError('Offline'))
        else request.resolve(new Response(JSON.stringify(kind === 'rejected' ? { error: 'invalid', reason: 'shape' } : { best: null, rank: null, top: [] }), { status: 200 }))
      }
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      let revision = 0
      const stats = { score: 123, rawScore: 123, accuracy: 1, stackCount: 3, maxHeight: 1, missedWords: 0, lives: 0, combo: 1, maxCombo: 1, kpm: 100, durationSec: 30, hiddenFound: [] }
      window.mountResult = strict => root.render(React.createElement(strict ? React.StrictMode : React.Fragment, {}, React.createElement(ResultScreen, {
        key: ++revision, stats, freshlyCollected: [], totalReturns: 0, onRestart() {}, onHome() {},
      })))
      window.clearResult = () => root.render(null)
      window.mountResult(false)
    })
    const sending = page.getByRole('button', { name: '기록 보내는 중…', exact: true })
    const waiting = page.getByRole('button', { name: '자동 재시도 대기 중…', exact: true })
    const retry = page.getByRole('button', { name: '기록 다시 보내기', exact: true })
    await sending.waitFor()
    assert(await sending.isDisabled())
    await page.evaluate(() => window.reply('offline'))
    await waiting.waitFor()
    assert(await waiting.isDisabled())
    await sending.waitFor()
    assert.equal(await page.evaluate(() => window.requests.length), 2)
    await page.evaluate(() => window.reply('success'))
    await sending.waitFor({ state: 'detached' })
    assert.equal(await retry.count(), 0)
    console.log(`${mobile ? 'mobile' : 'desktop'}: automatic retry succeeds, busy buttons disabled`)

    await page.evaluate(() => { window.requests = []; window.mountResult(false) })
    for (let attempt = 1; attempt <= 4; attempt++) {
      await sending.waitFor()
      assert.equal(await page.evaluate(() => window.requests.length), attempt)
      await page.evaluate(() => window.reply('rejected'))
      if (attempt < 4) await waiting.waitFor()
    }
    await retry.waitFor()
    assert(await retry.isEnabled())
    await page.waitForTimeout(3200)
    assert.equal(await page.evaluate(() => window.requests.length), 4)
    await retry.click()
    await sending.waitFor()
    assert(await sending.isDisabled())
    assert.equal(await page.evaluate(() => window.requests.length), 5)
    await page.screenshot({ path: `/tmp/rank-retry-${mobile ? 'mobile' : 'desktop'}.png` })
    await page.evaluate(() => window.clearResult())
    await sending.waitFor({ state: 'detached' })
    assert(await page.evaluate(() => window.requests.at(-1).signal.aborted))
    console.log(`${mobile ? 'mobile' : 'desktop'}: stops after four attempts, manual retry and in-flight cancellation pass`)

    await page.evaluate(() => { window.requests = []; window.mountResult(true) })
    await sending.waitFor()
    assert.equal(await page.evaluate(() => window.requests.filter(request => !request.done).length), 1)
    await page.evaluate(() => window.reply('offline'))
    await waiting.waitFor()
    const count = await page.evaluate(() => window.requests.length)
    await page.evaluate(() => window.clearResult())
    await page.waitForTimeout(3200)
    assert.equal(await page.evaluate(() => window.requests.length), count)
    assert.deepEqual(errors, [])
    console.log(`${mobile ? 'mobile' : 'desktop'}: StrictMode cancellation and pending timer cleanup pass`)
    await page.close()
  }
} finally {
  await browser.close()
}
