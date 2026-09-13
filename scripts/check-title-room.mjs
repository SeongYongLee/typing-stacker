import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const url = process.argv[2] ?? 'http://127.0.0.1:5183/'
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 780 } : { width: 1440, height: 900 },
      hasTouch: mobile, timezoneId: 'Asia/Seoul',
    })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    for (const night of [false, true]) {
      await page.clock.setFixedTime(new Date(night ? '2026-09-13T23:00:00+09:00' : '2026-09-13T12:00:00+09:00'))
      await page.goto(url)
      await page.getByRole('button', { name: '혼자 하기', exact: true }).waitFor()
      assert.ok((await page.locator('.title-splash__background').getAttribute('src'))
        .endsWith(`splash/background-${night ? 'night' : 'day'}.webp`))
      assert.equal(await page.locator('[data-room-light]').count(), 0)
    }
    await page.screenshot({ path: `/tmp/menu-no-light-${mobile ? 'mobile' : 'desktop'}.png` })
    await page.evaluate(() => {
      window.startLighting = {}
      const capture = () => {
        const stage = document.querySelector('[data-solo-start]')?.dataset.soloStart
        const light = document.querySelector('[data-room-light]')
        if (stage && light?.dataset.ready === 'true') window.startLighting[stage] = true
      }
      new MutationObserver(capture).observe(document.body, { subtree: true, childList: true, attributes: true })
    })
    await page.getByRole('button', { name: '혼자 하기', exact: true }).click()
    await page.waitForSelector('[data-solo-start="ready"]')
    await page.waitForSelector('[data-arena-room] [data-room-light][data-ready="true"]')
    await page.screenshot({ path: `/tmp/ready-room-${mobile ? 'mobile' : 'desktop'}.png` })
    await page.waitForSelector('[data-renderer-mode="3d"]')
    assert.deepEqual(await page.evaluate(() => window.startLighting), { ready: true, start: true })
    assert.equal(await page.locator('[data-room-light]').count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`${mobile ? 'mobile' : 'desktop'}: unlit menu, 3D READY/START and game transition passed`)
  }
} finally {
  await browser.close()
}
