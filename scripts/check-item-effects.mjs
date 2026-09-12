import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
const output='artifacts/three-prototype/item-effects'
await mkdir(output,{recursive:true})
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const errors=[], report=[]
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}})
page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await page.goto('http://127.0.0.1:5183/?three-prototype=1');await page.waitForSelector('[data-ready="true"]')
const samples=[['책','study-book','paper'],['계란','egg','puff'],['프라이팬','frying-pan','spark'],['축구공','soccer-ball','puff'],['우산','umbrella','droplet'],['계란 프라이','fried-egg','steam']]
for (const [name,id,shape] of samples) {
 await page.getByRole('button',{name:'상자 비우기',exact:true}).click()
 const resume=page.getByRole('button',{name:'낙하 계속',exact:true});if(await resume.count())await resume.click()
 await page.getByRole('button',{name:`${name} 떨어뜨리기`,exact:true}).click()
 await page.waitForFunction(()=>Number(document.querySelector('[data-renderer]').dataset.jelly)>0.002,null,{timeout:10000})
 await page.waitForTimeout(65)
 await page.getByRole('button',{name:'낙하 멈춤',exact:true}).click()
 const data=await page.locator('[data-renderer]').evaluate(e=>({...e.dataset}))
 assert.equal(data.particleKinds,shape)
 report.push({id,...data})
 await page.screenshot({path:`${output}/${id}.png`})
}
const memory = () => page.locator('[data-renderer]').evaluate(e => ({ geometries: e.dataset.geometries, textures: e.dataset.textures }))
const warm = await memory()
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', {name:'6종 모두 떨어뜨리기',exact:true}).click()
  await page.waitForTimeout(2200)
  assert.deepEqual(await memory(), warm)
}
await page.emulateMedia({reducedMotion:'reduce'})
await page.getByRole('button', {name:'6종 모두 떨어뜨리기',exact:true}).click()
await page.waitForTimeout(1100)
assert.equal(await page.locator('[data-renderer]').getAttribute('data-particles'), '0')
assert.deepEqual(errors,[])
await writeFile(`${output}/checks.json`,JSON.stringify({samples:report,errors},null,2))
console.log(JSON.stringify({samples:report,errors},null,2))
} finally {await browser.close()}
