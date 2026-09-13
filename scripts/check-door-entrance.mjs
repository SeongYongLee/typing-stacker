import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const base = process.argv[2] ?? 'http://127.0.0.1:5177'
const browser = await chromium.launch()
try {
  for (const touch of [false, true]) {
    const page = await browser.newPage({ viewport: touch ? {width:390,height:780} : {width:1440,height:900}, hasTouch:touch })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort())
    await page.goto(base)
    await page.getByRole('button', {name:'혼자 하기',exact:true}).click()
    await page.locator('.door-entrance').waitFor()
    assert.equal(await page.locator('[data-game-screen]').count(),0)
    await page.waitForTimeout(650)
    await page.screenshot({path:`/tmp/door-entrance-${touch?'mobile':'pc'}.png`})
    const skip = page.getByRole('button',{name:'바로 들어가기'})
    assert(await skip.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}))
    if(touch) await skip.click()
    await page.locator('.door-entrance').waitFor({state:'detached'})
    await page.waitForSelector('[data-game-screen]',{timeout:15000})
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.reload()
    await page.getByRole('button',{name:'혼자 하기',exact:true}).click()
    await page.locator('.door-entrance').waitFor({state:'detached',timeout:1000})
    await page.waitForSelector('[data-game-screen]',{timeout:15000})
    assert.deepEqual(errors,[])
    console.log(`PASS ${touch?'mobile':'PC'} entrance, ${touch?'skip':'automatic finish'}, game mount, reduced motion`)
    await page.close()
  }
} finally { await browser.close() }
