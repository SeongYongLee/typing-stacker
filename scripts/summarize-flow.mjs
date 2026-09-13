import {readFileSync,writeFileSync,existsSync} from 'node:fs'
const directory=process.argv[2]??'docs/measurements'
const names=['baseline','request-supply','targets-only','supply-only','goal-10','pressure-baseline','alarm-5','holdout-baseline','holdout-goal-10']
const summaries=[]
for(const name of names){
  const file=`${directory}/flow-${name}.json`
  if(!existsSync(file))throw new Error(`Missing measurement: ${file}`)
  const data=JSON.parse(readFileSync(file,'utf8'))
  for(const profile of [...new Set(data.rows.map(r=>r.profile))]){
    const rows=data.rows.filter(r=>r.profile===profile)
    const sum=key=>rows.reduce((s,r)=>s+r[key],0)
    const median=values=>{const sorted=values.toSorted((a,b)=>a-b);return sorted.length? (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:null}
    summaries.push({variant:name,profile,n:rows.length,seconds:sum('seconds')/rows.length,blockedFraction:sum('blockedFraction')/rows.length,returns:sum('returns')/rows.length,returnsPerMinute:sum('returns')*60/sum('active'),mergesPerMinute:sum('merges')*60/sum('active'),uniquePerDrop:sum('uniqueWords')/sum('drops'),firstRecallMedianObserved:median(rows.map(r=>r.firstRecall).filter(t=>t!==null)),noRecall:rows.filter(r=>r.firstRecall===null).length,firstStageClears:rows.filter(r=>r.firstClear!==null).length,clearMedianObserved:median(rows.map(r=>r.firstClear).filter(t=>t!==null)),alarms:sum('alarms'),censored:rows.filter(r=>r.censored).length})
  }
}
writeFileSync(`${directory}/flow-summary.json`,JSON.stringify(summaries,null,2)+'\n')
const lines=['|실험|입력 정책|평균 생존/관찰 초|회수 불가 %|회수/분|합성/분|고유 단어/드롭|첫 단계 완료|경보 횟수|','|---|---|---:|---:|---:|---:|---:|---:|---:|']
for(const r of summaries)lines.push(`|${r.variant}|${r.profile}|${r.seconds.toFixed(1)}|${(r.blockedFraction*100).toFixed(1)}|${r.returnsPerMinute.toFixed(2)}|${r.mergesPerMinute.toFixed(2)}|${r.uniquePerDrop.toFixed(3)}|${r.firstStageClears}/${r.n}|${r.alarms}|`)
writeFileSync(`${directory}/flow-summary.md`,lines.join('\n')+'\n')
console.log(lines.join('\n'))
