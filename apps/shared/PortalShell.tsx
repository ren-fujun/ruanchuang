import {useState} from 'react'
import './portal.css'
export function PortalShell({title,modules}:{title:string;modules:{title:string;description:string}[]}){
 const [active,setActive]=useState(0)
 return <div className="portal"><aside><strong>智汇中枢</strong><p>{title}</p><nav aria-label="业务模块">{modules.map((m,i)=><button key={m.title} aria-current={i===active?'page':undefined} onClick={()=>setActive(i)}>{m.title}</button>)}</nav></aside><main><header><span>学生事务协同</span><h1>{title}</h1><p>按职责受理，按授权协作。</p></header><section role="status" className="notice">开发骨架预览 · 尚未接入身份认证与业务数据</section><section><h2>{modules[active].title}</h2><p>{modules[active].description}</p><div className="empty"><strong>暂无业务数据</strong><p>该模块将在接口和权限验收后开放办理。</p></div></section><footer>成绩、面谈、联系方式仅向有权人员提供；敏感事项保留必要状态，不展示专业咨询详情。</footer></main></div>
}
