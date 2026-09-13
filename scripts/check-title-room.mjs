import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const base=process.argv[2]??'http://127.0.0.1:5177/'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{for(const mobile of [false,true]){
const page=await browser.newPage({viewport:mobile?{width:390,height:780}:{width:1440,height:900},hasTouch:mobile,timezoneId:'Asia/Seoul'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const night of [false,true]){
await page.clock.setFixedTime(new Date(night?'2026-09-13T23:00:00+09:00':'2026-09-13T12:00:00+09:00'));
await page.goto(base);await page.waitForSelector('[data-room-light="3d"][data-ready="true"]');assert.ok((await page.locator('.title-splash__background').getAttribute('src')).endsWith(`splash/background-${night?'night':'day'}.webp`));await page.waitForTimeout(900);await page.screenshot({path:`/tmp/title-room-${mobile?'mobile':'desktop'}-${night?'night':'day'}.png`});assert.equal(await page.locator('[data-room-light]').evaluate(c=>getComputedStyle(c).pointerEvents),'none');
await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize(mobile?{width:390,height:680}:{width:1280,height:800});await page.waitForTimeout(100);assert.equal(await page.locator('[data-room-light]').getAttribute('data-ready'),'true');await page.emulateMedia({reducedMotion:'no-preference'});
}
await page.getByRole('button',{name:'혼자 하기',exact:true}).click();await page.waitForSelector('[data-renderer-mode="3d"]');assert.equal(await page.locator('[data-room-light]').count(),0);assert.deepEqual(errors,[]);await page.close();console.log(mobile?'mobile title lighting and game transition passed':'desktop title lighting and game transition passed')
}}finally{await browser.close()}
