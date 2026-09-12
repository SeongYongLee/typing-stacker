import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import {writeFile} from 'node:fs/promises'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const errors=[],results=[]
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.goto('http://127.0.0.1:5183/?three-prototype=1');await page.waitForSelector('[data-ready="true"]')
 await page.getByLabel('물건 분류').selectOption('all')
 for(const [id,shape] of [['turtle','puff'],['fire-extinguisher','puff'],['clover','petal'],['rice-plant','chip'],['cactus','puff'],['dessert-tower','chip'],['fart-cloud','steam'],['candle','puff'],['snowflake','snow'],['heart','heart'],['milk-carton','puff']]){
  await page.getByRole('button',{name:'상자 비우기',exact:true}).click()
  const resume=page.getByRole('button',{name:'낙하 계속',exact:true});if(await resume.count())await resume.click()
  await page.getByLabel('물건 검색').fill(id);await page.locator(`[data-item-id="${id}"]`).click()
  if(['fire-extinguisher','milk-carton','turtle'].includes(id)){
   await page.waitForTimeout(180)
   assert.equal(await page.locator('[data-renderer]').getAttribute('data-particles'),'0',`${id}: must not discharge in free fall`)
  }
  await page.waitForFunction(()=>Number(document.querySelector('[data-renderer]').dataset.jelly)>0.0001,null,{timeout:10000})
  await page.waitForTimeout(50);await page.getByRole('button',{name:'낙하 멈춤',exact:true}).click()
  const data=await page.locator('[data-renderer]').evaluate(e=>({...e.dataset}))
  assert.equal(data.particleKinds,shape,id)
  await page.screenshot({path:`artifacts/three-prototype/meaning-${id}.png`})
  results.push({id,shape,particles:data.particles})
 }
 assert.deepEqual(errors,[])
 await writeFile('artifacts/three-prototype/meaning-browser-checks.json',JSON.stringify({results,errors},null,2))
 console.log(JSON.stringify({results,errors},null,2))
}finally{await browser.close()}
