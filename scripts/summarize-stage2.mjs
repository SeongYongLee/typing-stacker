import assert from 'node:assert/strict'
import {readFileSync, writeFileSync} from 'node:fs'
const [controlPath,candidatePath,outputPath]=process.argv.slice(2)
if(!controlPath||!candidatePath||!outputPath)throw new Error('Usage: node scripts/summarize-stage2.mjs control.json candidate.json output.json')
const control=JSON.parse(readFileSync(controlPath,'utf8'))
const candidate=JSON.parse(readFileSync(candidatePath,'utf8'))
assert.equal(control.secondsLimit,candidate.secondsLimit)
assert.equal(control.rows.length,candidate.rows.length)
const summarize=rows=>{
  const sum=key=>rows.reduce((n,r)=>n+r[key],0)
  const entered=rows.filter(r=>r.firstClear!==null)
  const complete=rows.filter(r=>r.secondClear!==null)
  const stageSum=key=>rows.reduce((n,r)=>n+(r.stages[2]?.[key]??0),0)
  return {runs:rows.length,entered:entered.length,completed:complete.length,
    meanObservedSeconds:sum('seconds')/rows.length,censored:rows.filter(r=>r.censored).length,
    mergesPerMinute:sum('merges')/sum('active')*60,
    recallsPerMinute:sum('returns')/sum('active')*60,
    stage2MergesPerMinute:stageSum('seconds')?stageSum('merges')/stageSum('seconds')*60:null,
    stage2RecallsPerMinute:stageSum('seconds')?stageSum('returns')/stageSum('seconds')*60:null,
    completedStage2MeanSeconds:complete.length?complete.reduce((n,r)=>n+r.secondClear-r.firstClear,0)/complete.length:null}
}
const result=[]
for(const profile of new Set(control.rows.map(r=>r.profile))){
  const a=control.rows.filter(r=>r.profile===profile),b=candidate.rows.filter(r=>r.profile===profile)
  for(const row of a){
    const pair=b.find(r=>r.seed===row.seed)
    assert(pair,'missing paired seed')
    assert.equal(pair.firstClear,row.firstClear,'candidate changed first-stage behavior')
    assert.deepEqual(pair.stages[1],row.stages[1],'candidate changed first-stage metrics')
  }
  const baseline=summarize(a),variant=summarize(b)
  const completedGain=variant.completed-baseline.completed
  const survivalRatio=variant.meanObservedSeconds/baseline.meanObservedSeconds
  const mergeRatio=variant.mergesPerMinute/baseline.mergesPerMinute
  result.push({profile,baseline,variant,completedGain,survivalRatio,mergeRatio,pass:completedGain>=3&&survivalRatio>=.9&&mergeRatio>=.8})
}
writeFileSync(outputPath,JSON.stringify({control:controlPath,candidate:candidatePath,profiles:result,pass:result.every(r=>r.pass)},null,2)+'\n')
console.log(JSON.stringify(result,null,2))
