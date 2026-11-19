import React from 'react'
export type Row={studentId:string;course:string;mentorId:string;counselorId:string}
export type Batch={id:string;seriesId?:string;ownerId:string;previousId?:string|null;version:number;createdAt:string;dispatchedAt?:string;cancelledAt?:string;cancelledBy?:string;cancellationReason?:string;correctionReason?:string;correctedBy?:string;items:Row[]}
const same=(a:Row,b:Row)=>a.studentId===b.studentId&&a.course===b.course
const label=(r:Row)=>`${r.studentId} · ${r.course} · 导师 ${r.mentorId} · 辅导员 ${r.counselorId}`
export function BatchHistory({batch,batches}:{batch:Batch;batches:Batch[]}){
 const previous=batch.previousId?batches.find(item=>item.id===batch.previousId):undefined
 const removed=previous&&!batch.cancelledAt?previous.items.filter(old=>!batch.items.some(row=>same(old,row))):[]
 const added=previous&&!batch.cancelledAt?batch.items.filter(row=>!previous.items.some(old=>same(old,row))):[]
 const changed=previous&&!batch.cancelledAt?batch.items.flatMap(row=>{const old=previous.items.find(item=>same(item,row));return old&&(old.mentorId!==row.mentorId||old.counselorId!==row.counselorId)?[{old,row}]:[]}):[]
 return <details><summary>查看版本详情与变更</summary><p>批次编号：{batch.id}；操作人：{batch.cancelledBy||batch.correctedBy||batch.ownerId}；时间：{new Date(batch.createdAt).toLocaleString()}</p>{batch.previousId&&<p>上一版本：{previous?`版本 ${previous.version}`:'当前无权查看或历史版本不可用'}；原因：{batch.cancellationReason||batch.correctionReason||'旧记录未填写'}</p>}{batch.cancelledAt&&<p>整批已撤销，原名单和记录保留。</p>}{previous&&!batch.cancelledAt&&<><p>新增 {added.length} 条，移除 {removed.length} 条，调整负责人 {changed.length} 条。</p><ul>{added.map((row,i)=><li key={'a'+i}>新增：{label(row)}</li>)}{removed.map((row,i)=><li key={'r'+i}>移除：{label(row)}</li>)}{changed.map(({old,row},i)=><li key={'c'+i}>调整：{label(old)} → {label(row)}</li>)}</ul></>}<p>本版本名单：</p><ul>{batch.items.map((row,i)=><li key={i}>{label(row)}</li>)}</ul></details>
}
