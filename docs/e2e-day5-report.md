# Day 5 第一次集成 E2E 报告

> 执行人：D
>
> 首次执行：2026-11-10 21:18（Asia/Shanghai）
>
> 最近复测：2026-11-12 01:15（Asia/Shanghai；A 的 `feat/a-v2-collaboration`，本地独立工作树）
>
> 测试分支：A 分支本地预演；未手工修改业务数据

## 结论

**A 的最新代码可以跑通学生→辅导员完整主链路；团队正式集成仍未完成。**

- 主链路：8/8 通过，全程通过页面操作，没有手工改数据。
- 接口冒烟：5/5 通过，确认 `health`、学生/辅导员登录、工单列表与分页字段。
- 关键风险检查：P0 全部通过；P1 发现 1 个重复提交缺陷。
- A 最新分支复测：A 自带后端测试 14/14 通过，D 的完整 E2E 8/8 通过。
- 项目级 P0 仍在：A 没有 PR、没有合入 `main`；B/C 与 A 存在冲突；C 的独立教师端仍未真正并入主应用。

## 主链路结果

| 步骤 | 结果 | 证据 |
| --- | --- | --- |
| 学生登录 | 已通 | `stu-lin`，角色 `student` |
| 学生提交工单 | 已通 | 新工单 `pending_review`，归属当前学生 |
| 辅导员登录并打开工单 | 已通 | 工单详情正常加载 |
| 审核并分派 | 已通 | 状态变为 `assigned`，分派至宿管中心、后勤保障 |
| 记录部门接单 | 已通 | 状态变为 `processing` |
| 录入处置结果 | 已通 | 状态变为 `awaiting_confirm` |
| 学生确认并评价 | 已通 | 状态变为 `completed`，5 星与评价内容已保存 |
| 390px 移动端 | 已通 | `scrollWidth=390`，无横向溢出 |

关键截图：

![学生提交成功](e2e-evidence/day5-student-submitted.png)

![辅导员审核分派](e2e-evidence/day5-counselor-assigned.png)

![学生确认并评价](e2e-evidence/day5-student-rated.png)

## 关键风险检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 无 Token 访问接口 | 已通 | HTTP 401，`code=40101`，`data=null` |
| 未登录访问受保护页面 | 已通 | 自动跳转 `/login` |
| 学生调用辅导员接口 | 已通 | HTTP 403，`code=40301` |
| 学生访问他人工单 | 已通 | 使用学生 Token 访问许清和的 `ZX20261107015`，HTTP 403，未返回工单数据 |
| 无模型 Key 的 AI 兜底 | 已通 | `engine=local-rules` |
| 高风险强制转人工工单 | 已通 | 显示高风险、不可自助关闭、可提交工单 |
| 360px 学生端 | 已通 | 首页、提交页、列表页均无横向溢出 |
| 重复提交拦截 | **未通过（P1）** | 相同内容第二次提交仍返回 HTTP 201，生成新工单 |

![高风险强制转工单](e2e-evidence/day5-high-risk-gate.png)

## P0 阻塞

### P0-1：A 的修复没有创建 PR，也没有合入 `main`

- A 最新推送为 `feat/a-v2-collaboration`，提交 `4764adc`，比 `main` 多 9 个提交。
- GitHub 上没有 A 的 PR；D 无法替 A 评审或合并。
- 该分支 14/14 后端测试、D 的 8/8 主链路 E2E 均通过；这是“代码可集成”的证据，不等于“已经合并”。
- 处理人：A。要求：发起 PR、评审、合并到 `main`，然后通知 D 复跑。

### P0-2：C 的教师端没有接入主应用

- C 的交付位于独立目录 `teacher-ui-v1/`，README 明确写明尚未接入仓库根目录后端，也没有替换原辅导员页面。
- 默认启用 MSW Mock（`VITE_USE_MOCK=true`），演示数据不等于真实联调。
- 契约不兼容：教师端请求 `/api/auth/me`、`/api/counselor/tickets`、`POST /api/counselor/tickets/:id/review|assign`；当前后端对应实际为 `/api/me`、`/api/tickets`、`PATCH /api/tickets/:id/review`，不存在 `/assign`。
- 对真实后端实测上述三个路径均返回 HTTP 404。
- C 的 `feat/c-teacher-v1-adapter` 仍与 A 冲突：`server/index.js`、`src/pages/counselor/TicketDetail.tsx`。
- 处理人：A/B/C。要求先冻结接口契约，再把教师页面并入主应用；不能用 Mock 结果作为第一次集成通过证据。

### P0-3：B 与 A 的合并冲突

- `feat/b-graphrag-risk-agent` 与 A 的最新分支冲突文件：`server/ai.js`、`server/ai/knowledge.js`、`server/index.js`、`server/llm.js`。
- 处理人：B。要求基于 A 的最新分支 rebase，解决冲突后再提 PR。

## P1 缺陷

### P1-1：重复提交未拦截

- 同一学生、同一描述、同一地点连续提交两次，均返回 HTTP 201 并创建两条工单。
- 建议由后端增加幂等或短时间重复检测：同一 `studentId` + 规范化描述 + 未办结工单，建议返回 `409` 并提示“请勿重复提交”。
- 负责人：A。

### 已补充的越权覆盖

- `scripts/e2e/critical-checks.mjs` 已增加 P0-06：学生 Token 访问其他学生的真实工单。
- 实测使用 `ZX20261107015`（归属许清和）返回 HTTP 403，`data=null`。

## 复现方式

```powershell
$env:VITE_USE_MOCK = 'false'
npm run seed
npm run dev
```

另开终端：

```powershell
npm run e2e
npm run e2e:critical
```

> 注意：必须在含 A 的 envelope 修复的代码上运行；直接在当前 `main` 上运行会因接口格式不符失败。
