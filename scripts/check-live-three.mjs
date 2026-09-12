import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:780}:{width:1440,height:900},hasTouch:mobile});const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:5183'?r.continue():r.abort())
 await page.route('**/src/hooks/useGameEngine.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('instance.onStateChange(store.update);','instance.onStateChange(store.update); window.__live = {engine:instance,store};')})})
 await page.goto('http://127.0.0.1:5183/');assert.equal(await page.locator('.game-arena').count(),0)
 await page.getByRole('button',{name:'혼자 하기',exact:true}).click();await page.waitForSelector('[data-renderer-mode="3d"]');
 if(mobile) await page.getByPlaceholder('눌러서 시작').click()
 await page.waitForTimeout(900);assert.equal(await page.locator('.game-arena > canvas').count(),3)
 await page.evaluate(()=>{window.initial=window.__live.engine;window.__live.engine.pause()})
 await page.screenshot({path:`/tmp/live-${mobile?'mobile':'desktop'}.png`})
 if(mobile){await page.setViewportSize({width:390,height:460});await page.waitForTimeout(400)}
 const count=await page.evaluate(()=>window.__live.store.getSnapshot().stats.stackCount)
 await page.locator('.game-arena > canvas').nth(1).evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})))
 await page.waitForSelector('[data-renderer-mode="2d"]');assert.equal(await page.locator('.game-arena > canvas').count(),1)
 assert.equal(await page.evaluate(()=>window.initial===window.__live.engine),true);assert.equal(await page.evaluate(()=>window.__live.store.getSnapshot().stats.stackCount),count)
 assert.deepEqual(errors,[]);console.log(mobile?'mobile live/fallback passed':'desktop live/fallback passed');await page.close()
}}finally{await browser.close()}
