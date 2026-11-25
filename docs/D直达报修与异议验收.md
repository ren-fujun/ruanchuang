# D 直达报修与异议验收

日期：2026-11-18。基线已合入 A 最新试用集成分支 `3466632`，包含 B、C 和旧版 D 成果。本文只记录本轮 D 后勤直连、双向监督和验收边界；不是学校业务制度，也不代表公网试用环境已经部署。

## 产品与权限

- 学生选择报修类型、地点和描述后，服务器直接创建后勤待领取事项。
- 报修不经过辅导员前置审核和问题包派单。
- 后勤账号只能读取责任校区内的未领取事项，或本人已经领取的事项。
- 辅导员只能读取关联学生事项，可提醒、询问和协调结案。
- 后勤不能读取学业成绩、面谈记录或辅导员内部备注。
- 同一接单动作在服务端进行原子校验，两人并发领取只有一个请求成功。

## 状态与终态

| 状态 | 含义 | 可执行动作 |
| --- | --- | --- |
| `pending_assignment` | 待后勤分配 | 范围内后勤领取 |
| `processing` | 处理中 | 领取人提交一次结果 |
| `awaiting_feedback` | 待学生反馈 | 学生满意或提出一次异议 |
| `objection_pending_response` | 异议待后勤回应 | 领取人书面说明；到期后辅导员可协调 |
| `pending_coordination` | 待辅导员协调 | 关联辅导员协调结案 |
| `satisfied` | 已修复并确认 | 终态，不可变更 |
| `coordinated_closed` | 协调结案 | 终态，不可变更 |

协调结案保留事实、双方说明、后续动作、负责人和时间，不伪装成第二次维修成功。确需再次现场服务时，由人工新建关联任务，不自动 reopen 原报修。

## 请求样例

所有写操作都必须携带唯一 `requestId` 和当前 `version`；同一 `requestId` 重试返回当前结果，不新增第二条记录。

学生创建：

```json
{
  "repairType": "水电",
  "campus": "主校区",
  "buildingId": "dorm-3",
  "room": "412",
  "description": "洗手池持续漏水。",
  "requestId": "UUID"
}
```

服务端按地点字典校验校区、楼栋和房间，并生成统一的 `location`。创建结果同时包含 `claimDueAt` 和 `minutesUntilClaim`，用于展示预计接单时间。

后勤领取：

```json
{ "version": 1, "requestId": "UUID" }
```

后勤提交一次结果：

```json
{
  "version": 2,
  "result": "已更换阀门并复测。",
  "requestId": "UUID"
}
```

学生反馈：

```json
{
  "version": 3,
  "decision": "objection",
  "reason": "仍有渗水痕迹。",
  "requestId": "UUID"
}
```

`decision` 只允许 `satisfied` 或 `objection`。选择 `satisfied` 时 `reason` 可省略。

后勤回应：

```json
{
  "version": 4,
  "response": "漏水点已修复，剩余痕迹为相邻房间存量积水。",
  "requestId": "UUID"
}
```

辅导员协调：

```json
{
  "version": 5,
  "conclusion": "双方记录已核对。",
  "followUp": "安排一次回访。",
  "owner": "辅导员姓名",
  "dueAt": "2026-11-20T10:00:00.000Z",
  "requestId": "UUID"
}
```

成功查询返回 `{ "items": Repair[] }` 或 `{ "repair": Repair }`。错误使用 `400/401/403/404/409`，并返回可展示的中文 `message`。A 统一响应信封时只需在路由边界包装，状态机字段不再变更。

## 验证结果

2026-11-18 本地运行 `node scripts/e2e/logistics-workflow.mjs`，以下检查全部通过：

```text
PASS 学生报修直达后勤，不经过辅导员前置审核
PASS 后勤仅读取责任范围，抢单并发只成功一次
PASS 一次处置结果提交后锁定，等待学生反馈
PASS 学生只能异议一次，后勤回应后交辅导员协调
PASS 协调结案为终态，旧 reopen/redispatch 路径返回 404
PASS 满意路径与无回应超时协调路径分别可用
PASS 后勤不能进入辅导员看板，390px 无横向溢出
```

同一合并基线的其它本地验证：

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run build:portals` | 五端全部构建通过 |
| `node --test server/*.test.js` | 33 项通过 |
| `npm run test:five-portals` | 12 项通过，总体仍按脚本标为 `PARTIAL_READY` |
| `npm run test:b-trial` | 82 项通过，包含双路径请假和学业协商 |
| 备份与恢复脚本 | 临时数据文件实测通过 |
| 本机健康检查 | `/api/health` 通过 |

`test:five-portals` 通过不等于新版报修 UI 已全通，因为该脚本仍验证旧工单代录链；D 的新流程由本文件上述后勤 E2E 单独验证。C 学生/辅导员页面必须接入后，才能移除这一缺口。

## 交接依赖

- A 需要统一挂载 `mountRepairRoutes`，并将现有裸 JSON 响应迁移到最终统一响应契约。
- B 需要为学生端和教师端提供真实身份、校区和关联学生范围；本轮沿用 `campus`、`repairScopes`、`studentIds` 演示字段。
- C 需要接入学生直达报修、一次反馈、辅导员监督与协调页面，并移除旧报修审核、返工和重新派单 UI。当前五端脚本仍只验证旧代录链。
- 公网 HTTPS、域名、二维码和邀请账号需要团队提供服务器及身份配置，当前未完成，不能用 localhost 代替。
