import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
const [controlPath,candidatePath,outputPath]=process.argv.slice(2)
if(!outputPath)throw new Error('Usage: node scripts/summarize-recall-candidate.mjs control candidate output')
const control=JSON.parse(readFileSync(controlPath,'utf8')),candidate=JSON.parse(readFileSync(candidatePath,'utf8'))
assert.equal(control.secondsLimit,candidate.secondsLimit)
const result=[]
for(const profile of ['steady','slow']){
  const a=control.rows.filter(r=>r.profile===profile),b=candidate.rows.filter(r=>r.profile===profile)
  assert.deepEqual(a.map(r=>r.seed),b.map(r=>r.seed))
  const measure=rows=>{
    const total=key=>rows.reduce((n,r)=>n+r[key],0),active=total('active')
    return {runs:rows.length,recallsPerMinute:total('returns')/active*60,mergesPerMinute:total('merges')/active*60,seconds:total('seconds')/rows.length,clears:rows.filter(r=>r.firstClear!==null).length,blockedFraction:rows.reduce((n,r)=>n+r.blockedFraction*r.active,0)/active}
  }
  const baseline=measure(a),variant=measure(b)
  const ratios=Object.fromEntries(['recallsPerMinute','mergesPerMinute','seconds'].map(key=>[key,variant[key]/baseline[key]]))
  result.push({profile,control:baseline,candidate:variant,ratios,passed:ratios.recallsPerMinute>=1.15&&ratios.mergesPerMinute>=.8&&ratios.seconds>=.9})
}
writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
