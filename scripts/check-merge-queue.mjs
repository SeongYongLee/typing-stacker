import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5183/?three-prototype=1');await page.waitForSelector('[data-ready="true"]');await page.getByRole('button',{name:'싱글 새로 시작',exact:true}).click();await page.waitForTimeout(300)
await page.evaluate(async()=>{const {VARIANT_BY_ID:v}=await import('/src/game/data/words.ts');const e=window.__stacker3d.engine;e.pause();e.mergeReveals.reset();for(const id of ['fried-egg','magic-book','fried-egg'])e.mergeReveals.enqueue(v.get(id),[v.get('egg'),v.get('frying-pan')],3);e.emit();e.render();window.first=e.hiddenReveal.seq})
await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.__stacker3d.engine.hiddenReveal.elapsed),0)
const seen=await page.evaluate(()=>{const e=window.__stacker3d.engine;const seen=[];for(let i=0;i<3;i++){seen.push(e.snapshot?.mergeReveal ?? {label:e.hiddenReveal.variant.id,seq:e.hiddenReveal.seq});e.mergeReveals.advance(3);e.emit();e.render()}return seen})
assert.deepEqual(seen.map(s=>s.label),['fried-egg','magic-book','fried-egg']);assert.equal(new Set(seen.map(s=>s.seq)).size,3)
await page.evaluate(()=>{const e=window.__stacker3d.engine;e.startRun(false)});assert.equal(await page.evaluate(()=>window.__stacker3d.engine.hiddenReveal),null);assert.deepEqual(errors,[]);console.log('queue order, repeated recipes, pause and new run passed')
}finally{await browser.close()}
