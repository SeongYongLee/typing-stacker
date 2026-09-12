import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const base=process.argv[2] ?? 'http://127.0.0.1:5175'
const browser=await chromium.launch()
try {
  for (const mobile of [false,true]) {
    const page=await browser.newPage({viewport:mobile?{width:390,height:780}:{width:1440,height:900},hasTouch:mobile})
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort())
    await page.route('**/src/hooks/useGameEngine.ts*',async route=>{
      const response=await route.fetch()
      await route.fulfill({response,body:(await response.text()).replace('instance.onStateChange(store.update);','instance.onStateChange(store.update); window.__tutorial = {engine:instance,store};')})
    })
    await page.goto(base)
    await page.getByRole('button',{name:'혼자 하기',exact:true}).click()
    const input=page.getByRole('textbox',{name:'단어 입력'})
    if (mobile) {
      await page.getByPlaceholder('눌러서 시작').click()
      await page.setViewportSize({width:390,height:450})
    }
    await page.waitForFunction(()=>window.__tutorial?.store.getSnapshot()?.phase==='playing')
    const advance=async label=>{
      // Allow the IME duplicate-Enter guard to arm after a lesson transition.
      await page.waitForTimeout(500)
      if (mobile) await page.getByRole('button',{name:label,exact:true}).tap()
      else await input.press('Enter')
    }
    await advance('시작하기')
    for (const word of ['책','계란','계란','계란']) {await input.fill(word);await input.press('Enter');await page.waitForTimeout(500)}
    // Exercise actual drops, including the assisted merge fallback if needed.
    for(let i=0;i<8;i++) {
      const step=await page.evaluate(()=>window.__tutorial.store.getSnapshot().stage.tutorialStep)
      if (step!==3) break
      await input.fill('프라이팬');await input.press('Enter');await page.waitForTimeout(900)
    }
    await page.waitForFunction(()=>[4,7].includes(window.__tutorial.store.getSnapshot().stage.tutorialStep))
    if (await page.evaluate(()=>window.__tutorial.store.getSnapshot().stage.tutorialStep===4)) await advance('회수해보기')
    assert.equal(await page.evaluate(()=>window.__tutorial.store.getSnapshot().stage.tutorialStep),7)
    await input.fill('계란 프라이');await input.press('Enter')
    await page.waitForFunction(()=>window.__tutorial.store.getSnapshot().stage.congestionDemo==='ready')
    await advance('경보 보기')
    await page.waitForFunction(()=>window.__tutorial.store.getSnapshot().stage.congestionDemo==='wordRush')
    await page.waitForFunction(()=>window.__tutorial.store.getSnapshot().stage.congestionDemo==='full',null,{timeout:30000})
    await advance('계속')
    await page.waitForFunction(()=>window.__tutorial.store.getSnapshot().stage.congestionDemo==='gameOverPrompt',null,{timeout:30000})
    await advance('연습 마치기')
    await page.waitForFunction(()=>window.__tutorial.store.getSnapshot().phase==='over')
    assert.deepEqual(errors,[])
    console.log(`PASS ${mobile?'mobile':'PC'}: stack → merge → recall → alarm → complete`)
    await page.close()
  }
} finally {await browser.close()}
