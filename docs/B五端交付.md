# B 成员五端交付：导师、知识版本与追问

日期：2026-11-14。分支：feat/b-mentor-ai，基于五端方案分支。此文区分本次可运行能力和需要 A/C/D 继续集成的内容。

## 一、完成内容

- 导师端从静态骨架变为登录后可操作的工作台：授权任务、联系记录、面谈、重修提醒、下次联系时间、转介请求、过程时间线、正式结果展示。支持手机布局、加载期间禁用提交、错误提示、退出与恢复登录。
- 导师只能查看和写入分配给自己的任务；学生不能读导师任务，导师不能调用旧辅导员/工单接口。辅导员仅见自己负责任务的必要状态，教务仅见学院范围；两者不返回导师面谈文本。
- 乐观版本控制：写入带 version，冲突返回409；必须先联系再面谈/重修提醒。正式结果仅教务可回写，通过结束，未通过重新进入联系阶段。已结束任务禁止导师继续变更。
- 转介由导师人工发起，记录必要状态并向对应辅导员发送站内通知。详细备注不出现在通知或辅导员摘要中；不自动诊断，不宣称心理中心已受理。
- 知识管理：来源、责任部门、关键词、有效期、作者、版本、审核意见；作者提交草稿，另一位 knowledgeReviewer 授权人员审核发布或驳回。修订建立新版本，不覆盖旧内容；发布后替代同族旧版本；支持撤回。
- 新学生问答入口：只使用已发布且未过期的管理知识；匹配不足/候选冲突时最多两轮追问后建议人工，最多六次学生输入；展示来源、版本、部门、有效期。风险筛查优先于知识答复，高风险提示人工优先介入。学生确认后把完整对话摘要提交到原工单流程，不静默代为提交。
- 新业务持久化在 db.b 下，保留关键变更审计。原 GraphRAG、风险筛查、知识检索、幻觉护栏与容灾链路保持兼容。

## 二、启动与演示

```powershell
npm ci
npm run demo:b
```

启动 B 专用 API 18804、导师工作台5195、学生端5191；使用独立 `.tmp/b-demo/store.json`，不改原演示数据。端口被占用时先关闭之前对应服务，不要同时运行两套同端口入口。

| 入口 | 账号 | 密码 | 用途 |
|---|---|---|---|
| http://127.0.0.1:5195 | mentor | 123456 | 示例导师，初始分配林知夏的高等数学任务 |
| 同上 | academic | 123456 | 示例教务，正式结果回写 |
| 同上 | chenyuan | 123456 | 辅导员：必要任务状态、知识草稿 |
| 同上 | reviewer | 123456 | 独立知识审核员 |
| http://127.0.0.1:5191 | 学生视角或20230118 | 123456 | 首页“AI咨询与追问” |

新增演示身份只在 B_DEMO=true 时初始化；关闭演示开关不会删除已经持久化的演示账号，正式环境必须使用独立数据和真实身份配置。演示口令、JSON数据与本地登录不构成生产认证方案。

建议展示：
1. mentor登录，点任务，依次保存联系、面谈、重修提醒；可选下次联系时间或发起协同支持。
2. chenyuan登录，查看同一任务只有办理状态，没有面谈正文。
3. academic登录，填结果来源，回写“未通过”查看续跟；再回写“通过”查看结束。
4. chenyuan进入“知识审核与版本”，填写例如实验室预约标准答案、关键词“实验室、预约”、来源、部门和未来有效期，保存草稿。
5. reviewer登录同一工作台，填写审核意见并发布。审核员不能自审本人草稿。
6. 学生进入AI咨询，问“实验室如何预约”，查看来源和版本；问未覆盖问题体验追问；选择“确认将摘要提交辅导员”进入真实工单详情。

新库没有自动发布的学校答案，首次使用请先由作者和审核员完成上面流程。示例内容仅作演示，不能冒充学校已确认制度。

## 三、接口与 A 的接入约定

代码集中于 server/b/routes.js，由 server/index.js mountB 注入现有 db/save/requireAuth；不是另起一套后端或登录系统。所有接口位于 /api/b，复用 Bearer会话。响应成功是原项目风格 JSON，错误为 HTTP状态加 message。

| 接口 | 身份 | 输入/说明 |
|---|---|---|
| GET /cases | mentor/counselor/academic | 自动按分配关系或学院过滤 |
| POST /cases | academic | studentId、mentorId、counselorId、course；校验学院与学生对应辅导员，重复活动任务409 |
| POST /cases/:id/events | mentor | type=contact/interview/remind/referral，text，version，可选scheduledAt（ISO时间） |
| PATCH /cases/:id/result | academic | result=passed/failed、source、version |
| GET /knowledge | counselor | 作者看本人；knowledgeReviewer看审核列表 |
| POST /knowledge | counselor | title、answer、keywords数组、source、department、validUntil；可选parentId创建修订 |
| POST /knowledge/:id/review | 授权审核员 | action=publish/reject、note；禁止自审 |
| POST /knowledge/:id/withdraw | 作者或审核员 | 撤回该版本 |
| POST /assistant | student | text、可选conversationId；返回action、answer、summary、risk、source及conversationId |

数据：db.b.cases / knowledge / conversations / audit。任务记录每次递增version，未通过保留旧联系和面谈记录；knowledge.family关联版本；audit记录操作者、动作、对象与时间。向外返回的导师任务必须经过 projected()，不能直接返回数据库对象。

A接入正式名单时调用 POST /cases，或以相同模型通过教务批次事务创建；本次没有替A实现成绩批量导入、更正批次与正式账号管理。所有正式用户应具有可靠college及分配关系，辅导员关联的临时姓名校验应在A的用户关系模型完成后替换为不可变ID映射。

## 四、C/D 接入与边界

- C：学生入口已加入首页和 /student/assistant；UI在 src/features/b。新问答与旧 /ai/precheck 分开：原预检仍使用原示例知识库，本次没有把所有旧知识自动视为已审核。正式上线统一知识源需明确迁移与审核策略，不能省略审核。
- C：知识管理暂放在导师工作台的辅导员登录态下，可复用接口移到辅导员正式菜单；跨端不共用前端 token 存储键。
- D：导师、教务、辅导员、学生身份应分别跑权限与数据泄露测试。正式部署需A统一身份、会话安全、数据删除期限和数据库迁移。
- 新问答是保守的本地关键词证据匹配，确定匹配才返回审核原文；不宣称已经完成大模型多轮语义推理。已有云模型增强和GraphRAG继续用于原认知链及转人工后工单分析。
- 下次联系时间是持久化计划，尚未接入自动定时推送；重修提醒记录表示导师已执行提醒，不等同于已发送短信。
- 转介仅实现发起与站内通知；专业中心接单、评估和反馈依学校流程/A侧跨部门接口继续接入，不伪造“转介完成”。
- 新建对话清空当前前端记录，不代表服务器删除会话；保留期限和删除策略需要学校批准。

## 五、验收

```powershell
npm run test:b
npm run typecheck
npm run build
npm run build:mentor
node scripts/ai/eval-b.mjs
node scripts/ai/drill-degrade.mjs --quiet
```

新增 API 自动化使用临时数据并自行启动/停止隔离后端：62项检查通过，覆盖无登录/错角色/非所属导师、先后顺序、版本冲突、过去时间、私密记录隔离、教务结果权限、未通过续跟/通过结束、知识审核/修订/撤回/过期、多轮转人工、高风险优先与持久化。

原AI评测26/26、容灾护栏47/47通过。类型检查、导师独立构建及原项目构建通过。

运行 `npm run demo:b` 后可执行 `node scripts/e2e/b-ui.mjs`：Edge实测导师联系与面谈、作者与审核员发布、学生带来源答复和真实工单提交。浏览器测试会写入演示数据，建议使用独立 ZHIHUI_DATA_FILE；截图在 .tmp/b-ui。不得对真实学校数据运行测试。
