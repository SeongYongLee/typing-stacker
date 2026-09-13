import assert from 'node:assert/strict'
import {chromium} from 'playwright-core'
const base=process.argv[2]??'http://127.0.0.1:5175'
const browser=await chromium.launch()
try {
  for(const mobile of [false,true]) {
    const page=await browser.newPage({viewport:mobile?{width:390,height:780}:{width:1440,height:900},hasTouch:mobile})
    const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort())
    await page.goto(base)
    const signature=async button=>button.evaluate(e=>{const s=getComputedStyle(e);return [s.minHeight,s.fontSize,s.fontWeight,s.borderRadius,s.paddingTop,s.paddingRight,s.borderTopWidth]})
    const options=page.getByRole('button',{name:'옵션',exact:true})
    const standard=await signature(options)
    assert.equal(standard[0],'48px')
    const ranking=page.getByRole('button',{name:'순위표',exact:true})
    assert.deepEqual(await signature(ranking),standard)
    assert.equal(await page.locator('.title-splash__mobile-ranking').count(),0)
    await ranking.click()
    const dialog=page.getByRole('dialog',{name:'보관소 순위표'})
    await dialog.waitFor()
    assert(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)))
    const bounds=await dialog.boundingBox()
    assert(bounds.y>=0 && bounds.y+bounds.height<=page.viewportSize().height)
    assert.deepEqual(await signature(dialog.getByRole('button',{name:'돌아가기',exact:true})),standard)
    await page.keyboard.press('Escape')
    await dialog.waitFor({state:'detached'})
    assert(await ranking.evaluate(e=>document.activeElement===e))
    await options.click()
    assert.deepEqual(await signature(page.getByRole('button',{name:/화면 흔들림/})),standard)
    await page.getByRole('button',{name:/돌아가기/}).click()
    await page.getByRole('button',{name:'프로필 바꾸기',exact:true}).click()
    assert.deepEqual(await signature(page.locator('.menu-button').filter({hasText:/돌아가기/}).first()),standard)
    await page.getByRole('button',{name:/돌아가기/}).click()
    await page.getByRole('button',{name:'도감',exact:true}).click()
    assert.deepEqual(await signature(page.getByRole('button',{name:/돌아가기/})),standard)
    await page.getByRole('button',{name:/돌아가기/}).click()
    if(mobile){await page.waitForTimeout(1800);await page.screenshot({path:'/tmp/typing-menu-unified.png'})}
    assert.deepEqual(errors,[])
    console.log(`PASS ${mobile?'mobile':'PC'} menu styles, ranking dialog, focus return, options/profile/collection navigation`)
    await page.close()
  }
}finally{await browser.close()}
