import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
try {
const page=await browser.newPage({viewport:{width:390,height:780}});await page.goto('http://127.0.0.1:5183/');
const results=await page.evaluate(async()=>{
const [{Arena3DRenderer},{VARIANT_BY_ID:v},{preloadSprites},{arenaProjection},{compactCamera},three]=await Promise.all([import('/src/game/renderer/three/Arena3DRenderer.ts'),import('/src/game/data/words.ts'),import('/src/game/renderer/spriteCache.ts'),import('/src/game/renderer/three/projection.ts'),import('/src/game/renderer/compactCamera.ts'),import('/node_modules/.vite/deps/three.js')]);
await preloadSprites(['egg','frying-pan','fried-egg'].map(id=>v.get(id).sprite));const results=[];
for(const height of [180,420]){
const host=document.createElement('div');host.style.cssText=`position:fixed;inset:0;width:390px;height:${height}px`;document.body.append(host);const canvas=document.createElement('canvas'),overlay=document.createElement('canvas');for(const c of [canvas,overlay]){c.style.cssText='position:absolute;inset:0;width:100%;height:100%';host.append(c)}
const r=new Arena3DRenderer(canvas,overlay,{style:'flat',yaw:0,colliders:false,night:null,compact:true});const plane=new three.Mesh(new three.PlaneGeometry(100,100),new three.MeshBasicMaterial({color:'#ff00ff'}));plane.position.z=10;r.scene.add(plane);r.world.visible=false;r.windowLight.group.visible=false;
for(const seconds of [.2,1.8]){
const result=v.get('fried-egg');const state={time:seconds,bodies:[],impacts:[],aimX:0,showAim:false,landing:null,ownerColors:null,cameraY:0,stackTop:4,hiddenReveal:{label:result.label,sprite:result.sprite,from:['egg','frying-pan'].map(id=>v.get(id).sprite),duration:3,progress:seconds/3}};
const pixels=()=>{r.draw(state);const gl=r.renderer.getContext();const p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p};plane.visible=false;const before=pixels();plane.visible=true;const after=pixels();const scale=compactCamera(390,height,4).scale,p=arenaProjection(390,height,0,0,scale),y=p.toScreenY(r.effects.mergeGroup.position.y);let count=0,same=0;const dpr=canvas.width/390;
for(let py=Math.floor((y-.38*scale)*dpr);py<(y+.38*scale)*dpr;py++)for(let px=Math.floor((195-1.1*scale)*dpr);px<(195+1.1*scale)*dpr;px++){const i=((canvas.height-1-py)*canvas.width+px)*4;if([i,i-4,i+4,i-canvas.width*4,i+canvas.width*4].some(k=>before[k+3]!==255))continue;count++;if(before[i]===after[i]&&before[i+1]===after[i+1]&&before[i+2]===after[i+2])same++}
results.push({height,seconds,count,ratio:same/count})
}plane.geometry.dispose();plane.material.dispose();r.dispose();host.remove()
}return results
});for(const result of results){assert.ok(result.count>50,JSON.stringify(result));assert.ok(result.ratio>.98,JSON.stringify(result))}console.log(results)
}finally{await browser.close()}
