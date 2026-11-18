# 后勤端

独立入口：`npm run dev:logistics`（当前 PowerShell 使用 `npm.cmd run dev:logistics`），端口 `5194`。独立构建：`npm run build:logistics`，产物 `dist-portals/logistics`。

## 本轮业务口径

学生提交报修后由服务器直接创建后勤待接事项，不再经过辅导员审核。后勤人员只能看到自己责任范围内的未领取事项，以及本人已领取的事项。

状态链：

```text
待后勤分配
→ 处理中
→ 待学生反馈
  ├─ 满意 → 已修复并确认（终态）
  └─ 一次异议 → 异议待后勤回应
      → 后勤一次书面说明
      → 待辅导员协调
      → 协调结案（终态）
```

后勤在“异议待响应”状态未按时回应时，辅导员可在响应期限到期后直接协调结案，并保留“后勤未回应”的事实。协调结案不代表维修成功。

## 演示账号

```text
账号：logistics
密码：123456
责任校区：主校区
```

正常演示数据由 `npm.cmd run seed` 重置；测试脚本使用独立临时数据，不覆盖 `server/data/store.json`。

## 接口

服务由 `server/repair-routes.js` 独立挂载，状态机位于 `server/repair-workflow.js`。

| 方法和路径 | 角色 | 动作 |
| --- | --- | --- |
| `POST /api/repairs` | 学生 | 直接创建报修 |
| `GET /api/repairs` | 学生/辅导员/后勤 | 按角色和范围读取 |
| `POST /api/repairs/:id/claim` | 后勤 | 原子领取，只有一个账号成功 |
| `POST /api/repairs/:id/result` | 后勤领取人 | 提交一次处置结果 |
| `POST /api/repairs/:id/feedback` | 学生本人 | 满意或提交一次异议 |
| `POST /api/repairs/:id/respond` | 后勤领取人 | 提交一次异议说明 |
| `POST /api/repairs/:id/remind` | 关联辅导员 | 提醒并保留记录 |
| `POST /api/repairs/:id/coordinate` | 关联辅导员 | 协调结案 |

所有写操作必须携带 `requestId` 和当时读取到的 `version`。版本冲突返回 `409`，越权返回 `403`，字段错误返回 `400`。

## 本地运行

```powershell
npm.cmd run seed
npm.cmd run dev:api
npm.cmd run dev:logistics
```

打开 `http://127.0.0.1:5194`。

## 验收

```powershell
npm.cmd run typecheck
npm.cmd run build:logistics
node --test server/repair-workflow.test.js
node scripts/e2e/logistics-workflow.mjs
```

E2E 覆盖直达报修、责任范围、并发抢单、一次结果、一次异议、后勤回应、辅导员协调终态、满意路径、无回应超时、旧返工接口拒绝和 390px 手机布局。
