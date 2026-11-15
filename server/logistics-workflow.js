import crypto from 'node:crypto'

export function dispatchBundle({bundle, counselor, recipient, tickets}) {
 if (counselor?.role !== 'counselor' || bundle?.createdBy !== counselor.id || !Array.isArray(counselor.studentIds)) throw new Error('无权转交问题包')
 if (bundle.status !== 'draft') throw new Error('只能转交草稿')
 if (recipient?.role !== 'logistics' || !recipient.id || recipient.disabled) throw new Error('后勤接收人无效')
 const selected = bundle.ticketIds.map(id => tickets.find(ticket => ticket.id === id))
 if (selected.some(ticket => !ticket || !counselor.studentIds.includes(ticket.studentId))) throw new Error('工单不在负责范围')
 if (selected.some(ticket => ticket.status !== 'pending_review')) throw new Error('工单状态已变更，请重新核对')
 const at = new Date().toISOString()
 return { ...bundle, status:'dispatched', recipientId:recipient.id, dispatchedAt:at, updatedAt:at,
   items:selected.map(ticket=>({ ticketId:ticket.id, status:'sent', history:[{id:crypto.randomUUID(), action:'sent', actorId:counselor.id, at}] })) }
}
export function applyLogisticsAction({ bundle, recipient, ticketId, action, result }) {
 if (recipient?.role !== 'logistics' || recipient.id !== bundle?.recipientId || recipient.disabled) throw new Error('无权操作问题包')
 if (bundle.status !== 'dispatched' || !Array.isArray(bundle.items)) throw new Error('问题包状态无效')
 const index=bundle.items.findIndex(item=>item.ticketId===ticketId)
 if(index<0) throw new Error('工单不存在')
 const item=bundle.items[index]
 if(action==='accept' && item.status!=='sent') throw new Error('当前状态不能接收')
 if(action==='resolve' && item.status!=='accepted') throw new Error('请先接收工单')
 if(!['accept','resolve'].includes(action)) throw new Error('未知操作')
 if(action==='resolve' && (typeof result!=='string' || !result.trim() || result.trim().length>1000)) throw new Error('请填写处理结果，最多1000字')
 const at=new Date().toISOString()
 const next={...item, status:action==='accept'?'accepted':'resolved', history:[...item.history,{id:crypto.randomUUID(), action, actorId:recipient.id, at, ...(action==='resolve'?{result:result.trim()}:{})}]}
 return {...bundle, updatedAt:at, items:bundle.items.map((old,i)=>i===index?next:old)}
}
