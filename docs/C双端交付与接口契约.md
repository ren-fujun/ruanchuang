# C 双端交付与接口契约

基于 main 541603f，开发分支 feat/c-five-portals。学生端 apps/student（5191）、辅导员端 apps/counselor（5192）。使用压缩包对应的四张墨绿双端设计，其他页面沿用相同主题。

## 运行与验收

安装 npm ci，后端 npm run dev:api，分别运行 npm run dev:student、npm run dev:counselor。可通过 PORTAL_API_URL 指向 A 的后端。学生与辅导员的登录、前端路由按入口限定。服务端鉴权沿用既有实现。

npm run typecheck、npm run build、npm run build:portals。C 浏览器契约验证运行 node scripts/c/verify.mjs，使用临时独立数据，关闭云模型。测试中的接口样例由浏览器拦截提供，仅验证前端行为。原 API 回归使用仓库已有脚本。

## 已对接

原学生预检、提交、进度、确认、消息，辅导员审核、分派、催办、备注、查寝、洞察继续使用原 API。学业跟进读取 B 的 GET /api/b/cases，只展示服务端投影后的协同状态。学生 AI 问答复用 B 的 /api/b/assistant，保留来源、有效期和转人工。

## 等待 A/D 实现的接口

下列接口为 C 提案，需由 A 确认并实现。所有请求使用 Bearer，返回 {code,msg,data}。缺失或失败不会提示已提交，表单内容保留在当前页面。刷新或离开页面不持久保存未提交的敏感内容。

| 方法和路径（/api 前缀） | 请求/响应 |
| --- | --- |
| GET /issue-bundles | data.items 为 Bundle[]，按授权范围返回 |
| POST /issue-bundles | title、departmentId、ticketIds、note、reviewed:true、requestId；返回 data.item |
| GET /issue-bundles/:id | 返回 data.item |
| POST /issue-bundles/:id/send | version、reviewed:true、reason、requestId；核对后人工转交 |
| POST /issue-bundles/:id/urge | version、reason、requestId |
| POST /issue-bundles/:id/follow-ups | version、text、requestId |
| POST /tickets/:id/supplements | text、expectedUpdatedAt、requestId；追加说明并保留旧记录 |
| POST /tickets/:id/reopen | text、expectedUpdatedAt、requestId；仅针对当前学生该工单的未满意结果 |
| GET /appointments/slots | data.items 为 Slot[]，学生仅可见可授权预约时段，辅导员仅自己的排班 |
| POST /appointments/slots | startsAt、endsAt（ISO）、requestId；辅导员发布时段 |
| GET /appointments | data.items 为 Appointment[]，服务端限制本人/本人负责预约 |
| POST /appointments | slotId、topic、requestId；服务端检查时段可用、所有者和冲突 |
| POST /appointments/:id/cancel | version、reason、requestId |
| GET /academic/cases/mine | data.items 为学生可读 AcademicCase[]，仅必要状态 |

字段类型在 src/features/c/api.ts，完整 JSON 样例在 src/features/c/contract.examples.json。问题包 items 保存每条原诉求编号、结果、studentConfirmed、reopened。部分回执不代表全包完成。子项重开保留原处理历史，只回流该项，由 A/D 决定包聚合状态。

状态提案 Bundle 为 draft/sent/accepted/returned/processing/completed。Appointment 为 scheduled/cancelled/completed。未知状态页面保留原值，避免映射成错误成功状态。辅导员看到 returned 时显示退回原因，可再次人工核对转交。

requestId 用于服务端幂等。同一内容重试保持相同编号，用户修改内容或成功后生成新编号。version/expectedUpdatedAt 由服务端检查，409 刷新最新数据并保留填写内容。401 由共享认证处理，403 展示拒绝访问，404/405/501 显示待接入，5xx 和网络异常显示失败。

## A/B/D 衔接

A 维护共享权限、范围、问题包及预约事务、重开历史。D 接收已转交问题包，以单项回执关联原工单。C 页面跳转回原工单详情，不用前端聚合数替代后端状态机。B 学业任务沿用 /api/b/cases，学生结果视图等待授权投影接口。

基础补充支持文本说明。现有附件服务尚未实现真实存储和授权下载，C 没有新增伪上传操作。预约并发抢占、重复写入防重和角色数据范围必须在 A 后端验收。C 的冲突、拒绝、失败状态可用契约样例验证。

原需求中的后勤独立接单、教务名单导入、更正及导师业务由对应成员完成。此分支没有修改 server 业务代码。

## C 验证补充

知识纠错页面已接入 B 的 /api/b/knowledge，支持新增、修订、授权独立审核和撤回。审核权限最终由 B 服务端检查。默认辅导员可以提交自己的待审核版本，授权审核员才显示审核按钮。

前端自动化覆盖两个独立登录入口及跨端路由回退、原工单真实提交、缺失服务保留表单、问题包人工核对及部分回执、学业正式结果显示、真实知识草稿提交、预约时间校验、冲突重试与取消。原 API 生命周期与隐私、统计、跨学生访问回归也在隔离数据上执行。
