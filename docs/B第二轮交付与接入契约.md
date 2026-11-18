# B第二轮交付与接入契约

日期：2026-11-18。分支：feat/b-trial-collaboration；基于main 541603f，未擅自合入A/C/D业务分支。对应第二轮B1—B4。仅描述本分支已实现内容，不代表五端公网试用已经上线。

## 1. 本次完成

- 学业协商：关联导师、辅导员均可提出行动安排，被指定人接受或暂不接受，修改保留历史；未协商/待确认明确可见。接受后双方均可记录联系、面谈、提醒、协同支持，不固定角色和先后顺序。结束任务不能再协商或记录；正式结果仍限教务。
- 工作记录正文默认仅作者可见，可主动选择共享给本事项关联双方；单独填写协同摘要；教务看必要状态，不返回私密正文、协商计划或协同摘要。旧记录按作者归属保留，不自动扩大可见范围。
- 请假：本科生选所属辅导员，研究生选所属班导师；服务端按可信学历和关系筛选。班导师使用mentor角色并要求classAdvisor=true，普通学业导师不能批假。支持提交、待批、同意/驳回、双方查结果和站内通知。
- 业务写入带version和requestId；同一请求重试返回原结果，不重复写通知/审计；旧版本返回409。请假拒绝时间错误、过去开始时间和与已有待批/批准单重叠；决定只能执行一次。
- 导师工作台新增协商区、行动可见范围、班导师请假审批；提供共享组件给C。主干旧学生端加入“我的请假”，辅导员侧栏加入“请假审批”，便于在C集成前独立验证。
- AI新增明确标注的流程提示，与已审核知识答案区分。请假按服务端身份提示；报修不再要求辅导员前置审核；学业职责由双方协商。AI不能批假、判责或结案；高风险人工优先逻辑仍先执行。
- 旧认知链提示词、首响文本和报修图谱路径同步调整。宿舍设施维修主责改为后勤，宿管可协同；同部门不同事项的安全会签不会因合并主责而丢失。校园网故障仍保留信息中心知识指引，避免“报修”关键词误路由。

## 2. 本地演示

```powershell
npm run demo:b-trial
```

使用独立`.tmp/b-trial/store.json`；第一次创建虚构种子，之后保留操作结果。API 18814，学生5291，辅导员5292，导师5295，不与原519x演示端口混用。可通过ZHIHUI_DATA_FILE指定另一份不存在的测试文件重新开始，避免覆盖已有数据。

| 入口 | 账号 | 演示密码 | 用途 |
|---|---|---|---|
| http://127.0.0.1:5291 | 20230118 | 123456 | 本科生，选陈予安审批 |
| 同上 | graduate | 123456 | 研究生，选班导师示例审批 |
| 同上 | unconfigured | 123456 | 无学历配置，提示管理员处理 |
| http://127.0.0.1:5292 | chenyuan | 123456 | 本科请假审批 |
| http://127.0.0.1:5295 | mentor | 123456 | 班导师批假、学业协商与记录 |
| 同上 | chenyuan | 123456 | 辅导员参与同一学业协商和跟进 |
| 同上 | mentor-other | 123456 | 普通学业导师，无班导师审批权限 |
| 同上 | academic | 123456 | 正式学业结果回写 |

以上是本地虚构演示账号，不能当成对外试用账号。A负责的哈希口令、账号有效期、会话安全、独立账号发放、关闭演示直登不由本分支替代。新演示脚本B_DEMO=false，使用专属fixture，不修改原seedData。

## 3. A维护的可信用户字段

```json
{"id":"stu-under","role":"student","educationLevel":"undergraduate","counselorIds":["cou-chen"]}
{"id":"stu-grad","role":"student","educationLevel":"postgraduate","classAdvisorIds":["mentor-demo"]}
{"id":"mentor-demo","role":"mentor","classAdvisor":true}
```

这些字段只能由可信管理端维护；不能开放学生修改。姓名不是请假授权依据。学生请求中的educationLevel会被忽略，使用服务器账号字段；缺配置就不开放申请。停用人员不出现在候选人中，B业务拒绝停用账号。关系撤销后，旧审批人不能继续读取或审批该生请假；历史数据仍保留，后续管理员查询/转交由A另行设计。

新建学业任务优先使用counselorIds验证关系，旧数据没有该字段时保留原姓名映射兼容；正式试用应完成ID映射。已有未完成学业任务缺collaboration时投影为unassigned；不会自动指定导师负责，也不删除原记录。

## 4. 真实API契约

均复用Bearer会话，路径前缀`/api/b`，返回普通JSON（items/item），不是C提案的额外嵌套信封。通过现有request助手可直接使用。没有另开一个后端，也不要求修改server/index.js白名单。

| 方法/路径 | 身份 | 输入/输出 |
|---|---|---|
| GET /leaves/approvers | 学生 | 返回educationLevel、configured、items:[{id,name}] |
| GET /leaves | 学生/辅导员/导师 | 学生看本人，教师看分配给本人且当前仍有范围的申请；items |
| POST /leaves | 学生 | approverId、startsAt、endsAt（ISO）、reason、requestId；201 {item} |
| POST /leaves/:id/decision | 该单合法审批人 | action=approved/rejected、note、version、requestId；{item} |
| POST /cases/:id/collaboration | 关联导师/辅导员 | action=propose、assigneeId、plan、可选nextAt、version、requestId；接受/拒绝用action=accept/decline和version/requestId |
| POST /cases/:id/events | 关联导师/辅导员 | type=contact/interview/remind/referral、text、visibility=private/shared、可选summary和scheduledAt、version、requestId；需协商agreed |
| GET /cases | 原有三种人员 | 原结构增加collaboration；记录按查看者投影 |
| PATCH /cases/:id/result | 教务 | 保留result=passed/failed、source、version；不改变正式结果权限 |

协商状态：unassigned → proposed → agreed；decline回unassigned；重新propose暂停旧安排，确认后再记录行动。case.status仍保留原办理状态，UI用collaboration显示“待协商”，避免破坏A的正式结果接口。

请假状态：pending → approved/rejected。Leave包含id、studentId/studentName、educationLevel、approverId/approverName、startsAt/endsAt、reason、status、version、createdAt、decision。审批意见和原因仅申请者及当前合法审批人可见，通知不包含原因全文。

requestId为8—100字符；建议UUID。相同actor/接口目标/requestId且相同请求体重放返回原结果，不重复推进；相同requestId不同内容409。失败校验不缓存为成功。请求体修改后使用新ID；版本冲突先刷新。当前幂等操作在单Node进程同步校验后落盘，不宣称多实例分布式事务。

错误：400字段错误，401未登录，403角色/范围不符，409版本/已处理/重叠。前端保留当前填写内容并显示原因；不把失败变为成功提示。

## 5. C的组件接入

- `src/features/b/Leaves.tsx`导出LeavePanel，参数role、call。call(path, body?, method?)返回已解包JSON；路径不含/api，例如/b/leaves。可直接嵌入C独立学生端/辅导员端。
- `src/features/b/LeavePage.tsx`是主干旧登录上下文的适配壳；C使用自己的路由时优先复用LeavePanel，不复制状态机。
- `src/features/b/Collaboration.tsx`导出AcademicCollaboration，传item（含mentorId/counselorId/version/collaboration）、userId、call、refresh。组件只负责协商；行动表单按新events契约接入，或复用导师端实现。
- 导师端现成支持mentor和counselor登录协商；C可在自己的学业页面嵌入同一组件，无须将辅导员强制跳转到另一个端。
- 辅导员进入本科审批；只有classAdvisor的导师显示请假入口，后端仍独立校验。不要只靠前端隐藏按钮。
- Assistant的guidance响应不创建普通工单，显示对应业务入口。D完成直达报修后复用/student/new入口，B不伪造“后勤已接单”。

## 6. 验收与样本

```powershell
npm run test:b-trial
npm run test:b
npm run typecheck
npm run build:portals
node scripts/ai/eval-b.mjs
node scripts/ai/drill-degrade.mjs --quiet
npm run test:five-portals
```

test:b-trial自动分配空闲端口、建立新数据并启动/关闭本次API和三个Vite服务；使用本机Edge。覆盖双路径请假、越权、学历伪造、普通导师不能批假、日期/重叠、并发幂等、重复审批、协商/拒绝/变更、双方行动、私密/摘要、旧版本、教务结果、AI口径与高风险优先、落盘审计。

浏览器真实操作：研究生申请→班导师批准→学生查看；本科生申请→辅导员批准→学生查看；导师提出安排→接受→保存行动。报告和截图保存在`.tmp/b-trial-tests/run-*`。

2026-11-18实测：新流程82项检查通过，原B回归64项通过，AI评测26/26、降级护栏47/47通过；类型检查和五端构建通过。更新后的五端基础联调12组通过，但仍为PARTIAL_READY，不包含尚未合入的A/C/D新业务。新流程报告目录为`.tmp/b-trial-tests/run-0LDe49`，五端基础报告目录为`.tmp/five-portals/run-FERAPa`（运行产物不提交Git）。

`scripts/fixtures/b-trial-scenarios.json`提供本科/研究生/未配置、待协商和报修满意/异议/超时样本。后面三项标注D/C负责，供集成验收，不能声称B分支已实现它们。旧five-portals报告已更新分支口径，明确A/D/C已有实现但尚需合并，保留PARTIAL_READY而非假报五端全通。

## 7. 未包含的其他成员工作

本分支没有合入A教务导入页面、C新双端或D新后勤流程。A集成时需保留B路由挂载，解决src/App和导航的合并冲突；C旧请求/events必须加requestId并先完成协商。D改报修实际状态机，B只更新认知规则与测试样本。统一部署前还要跑新报修异议终止及多角色范围验收。

请假撤销、销假、学校长假分级、专业心理记录、短信、云模型在线可用性、正式身份平台和HTTPS上线不在本次B交付内。未来要新增规则时先确认制度，不从演示字段推导学校政策。
