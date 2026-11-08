import json
from pathlib import Path
S={'type':'string'}; N={'type':'number'}; I={'type':'integer'}; B={'type':'boolean'}
def obj(props,req=None):
    required = list(props) if req is None else req
    return {'type':'object','properties':props, **({'required':required} if required else {})}
def arr(item): return {'type':'array','items':item}
def ref(name): return {'$ref':'#/components/schemas/'+name}
def nullable(schema): return {**schema,'nullable':True}
status={'type':'string','enum':['DRAFT','PENDING_REVIEW','ASSIGNED','PROCESSING','REJECTED','PENDING_CONFIRM','CONFIRMED','ARCHIVED']}
schemas={}
schemas['User']=obj(dict(userId=S,name=S,role={'type':'string','enum':['COUNSELOR']},college=S,scope=S))
schemas['Department']=obj(dict(deptId=S,name=S,short=S,slaHours=N,handlers=arr(obj(dict(handlerId=S,name=S)))))
schemas['Dictionaries']=obj(dict(departments=arr(ref('Department')),categories=arr(obj(dict(value=S,label=S)))))
schemas['TicketLog']=obj(dict(logId=S,ticketId=S,action=S,fromStatus=status,toStatus=status,operatorId=S,operatorRole=S,remark=S,createdAt={'type':'string','format':'date-time'}))
schemas['Note']=obj(dict(noteId=S,text=S,actor=S,createdAt=S))
schemas['Permissions']=obj({k:B for k in ['canReview','canAssign','canSplit','canUrge','canNote','canRemind','canArchive']})
ticket={k:S for k in ['ticketId','title','content','category','studentId','studentName','college','createdAt','updatedAt']}
ticket.update({k:nullable(S) for k in ['location','counselorId','deptId','handlerId','parentTicketId','aiSummary','aiRiskReason','slaDeadline','solution','rejectReason']})
ticket.update(dict(urgency={'type':'string','enum':['NORMAL','URGENT','CRITICAL']},riskLevel={'type':'string','enum':['LOW','MEDIUM','HIGH']},status=status,attachments=arr(S),isOverdue=B,overdueLevel={'type':'string','enum':['NORMAL','WARNING','SERIOUS']},reviewed=B,suggestedDeptIds=arr(S),logs=arr(ref('TicketLog')),notes=arr(ref('Note')),children=arr(S),permissions=ref('Permissions')))
schemas['Ticket']=obj(ticket)
schemas['TicketPage']=obj(dict(list=arr(ref('Ticket')),total=I,page=I,pageSize=I))
schemas['Dashboard']=obj(dict(stats=obj({k:I for k in ['pending','active','overdue','highRisk','completed','total']}),trend=arr(obj(dict(date={'type':'string','format':'date'},submitted=I,completed=I))),priority=arr(ref('Ticket')),departments=arr(obj(dict(deptId=S,name=S,active=I,completed=I,total=I,onTime=nullable(N),avgHours=nullable(N)))),categories=arr(obj(dict(name=S,value=I))),risks=arr(obj(dict(name=S,value=I)))))
schemas['Error']=obj(dict(code=I,msg=S,data={'nullable':True,'description':'错误时固定 null'}))
paths={}
def endpoint(path,method,summary,data,request=None,parameters=None,public=False,proposed=False):
 responses={'200':{'description':'成功','content':{'application/json':{'schema':obj(dict(code={'type':'integer','enum':[0]},msg=S,data=data))}}}}
 for code in [400,401,403,404,409,422,500]:responses[str(code)]={'description':str(code)+' 错误，中文 msg 可展示','content':{'application/json':{'schema':ref('Error')}}}
 operation={'summary':summary,'description':('PDF 未定义完整结构，本实现候选补充；待后端会签。' if proposed else 'PDF 已定义路径；详细响应为待会签补全。'),'responses':responses}
 if public:operation['security']=[]
 if request:operation['requestBody']={'required':True,'content':{'application/json':{'schema':request}}}
 if parameters:operation['parameters']=parameters
 paths.setdefault(path,{})[method]=operation
endpoint('/auth/login','post','登录',obj(dict(token=S,user=ref('User'))),obj(dict(account=S,password=S)),public=True)
endpoint('/auth/me','get','当前用户',ref('User'))
endpoint('/dicts/responsibility','get','权责字典',ref('Dictionaries'))
endpoint('/counselor/dashboard','get','中枢聚合统计',ref('Dashboard'))
params=[{'name':k,'in':'query','schema':({'type':'integer','minimum':1,'default':1 if k=='page' else 10,**({'maximum':50} if k=='pageSize' else {})} if k in ['page','pageSize'] else S)} for k in ['q','status','riskLevel','isOverdue','page','pageSize']]
endpoint('/counselor/tickets','get','授权范围工单列表',ref('TicketPage'),parameters=params,proposed=True)
endpoint('/counselor/tickets/pending','get','待审核工单',ref('TicketPage'),parameters=params)
p=[{'name':'ticketId','in':'path','required':True,'schema':S}]
endpoint('/counselor/tickets/{ticketId}','get','工单详情',ref('Ticket'),parameters=p,proposed=True)
actions={
'review':obj(dict(approved=B,remark=S)),
'assign':obj(dict(deptId=S,handlerId=S,remark=S,slaHours={'type':'number','minimum':1,'maximum':168})),
'split':obj(dict(children={'type':'array','minItems':2,'maxItems':5,'items':obj(dict(title={'type':'string','minLength':1,'maxLength':40},content={'type':'string','minLength':1},deptId=S))})),
'urge':obj(dict(remark={'type':'string','minLength':1,'maxLength':1000})),
'notes':obj(dict(text={'type':'string','minLength':1,'maxLength':1000})),
'remind-confirm':obj({}),
'archive':obj({})}
for action,body in actions.items():endpoint('/counselor/tickets/{ticketId}/'+action,'post',action,ref('Ticket'),body,p,proposed=action in ['notes','remind-confirm','archive'])
spec={'openapi':'3.0.3','info':{'title':'智汇中枢 教师端候选契约','version':'0.1.0-proposed','description':'以 PDF 优先的本地教师端实现补充。并非团队冻结版本，待 A/B/D 会签，见接口补充与交接.md。'},'servers':[{'url':'/api'}],'security':[{'bearerAuth':[]}],'paths':paths,'components':{'securitySchemes':{'bearerAuth':{'type':'http','scheme':'bearer'}},'schemas':schemas}}
Path('docs/openapi.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding='utf-8')
