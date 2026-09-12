import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
for (const mobile of [false,true]) {
 const page=await browser.newPage({viewport:mobile?{width:390,height:780}:{width:1440,height:1000},hasTouch:mobile});const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5183/?three-prototype=1');await page.waitForSelector('[data-ready="true"]');await page.getByRole('button',{name:'싱글 새로 시작',exact:true}).click();await page.waitForTimeout(700)
 const label=page.locator('[data-congestion-tone]');await label.waitFor()
 await page.evaluate(()=>{const e=window.__stacker3d.engine;e.pause();e.congestion=0;e.emit();window.originalEngine=e})
 await page.waitForTimeout(1700)
 assert.equal(await label.getAttribute('data-congestion-tone'),'normal')
 const normal=await label.evaluate(e=>getComputedStyle(e).color)
 await page.evaluate(()=>{const e=window.__stacker3d.engine;e.congestion=95;e.emit();e.render()})
 await page.waitForTimeout(100)
 const between=await label.evaluate(e=>getComputedStyle(e).color)
 await page.waitForTimeout(600)
 const warning=await label.evaluate(e=>getComputedStyle(e).color)
 assert.notEqual(between,normal);assert.notEqual(between,warning);assert.equal(await label.getAttribute('data-congestion-tone'),'warning')
 assert.notEqual(await label.evaluate(e=>getComputedStyle(e).textShadow),'none')
 await page.screenshot({path:`/tmp/tone-${mobile?'mobile':'desktop'}-warning.png`})
 await page.evaluate(()=>{const e=window.__stacker3d.engine;e.congestion=40;e.emit();e.render()})
 await page.waitForTimeout(650);assert.equal(await label.getAttribute('data-congestion-tone'),'recovery');const recovery=await label.evaluate(e=>getComputedStyle(e).color);assert.notEqual(recovery,warning)
 await page.waitForTimeout(1100);assert.equal(await label.getAttribute('data-congestion-tone'),'normal');assert.equal(await label.evaluate(e=>getComputedStyle(e).color),normal)
 if(mobile){assert.equal(await page.locator('.mp-game').count(),1);assert.equal(await page.locator('.three-hands').count(),1);const box=await page.locator('[data-renderer]').boundingBox();assert.ok(box.width<=390 && box.height<780);await page.setViewportSize({width:390,height:460});await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.originalEngine===window.__stacker3d.engine),true);await page.screenshot({path:'/tmp/tone-mobile-keyboard.png'})}
 assert.deepEqual(errors,[]);console.log(mobile?'mobile passed':'desktop passed');await page.close()
}
}finally{await browser.close()}
