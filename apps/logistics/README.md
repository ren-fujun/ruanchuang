# 后勤端

独立入口：`npm run dev:logistics`（当前 PowerShell 使用 `npm.cmd run dev:logistics`），端口 `5194`。独立构建：`npm run build:logistics`（当前 PowerShell 使用 `npm.cmd run build:logistics`），产物 `dist-portals/logistics`。

## 已接通能力

- 后勤身份登录，服务端拒绝学生、辅导员等其他角色访问后勤接口。
- 只读取转交给当前后勤接收人的问题包事项，不展示成绩、面谈详情或辅导员内部备注。
- 按问题包分组展示事项，支持逐项“接收”和“提交处理结果”。
- 单条事项处理完成后，同包其他事项保持独立状态，不会被连带关闭。
- 学生确认、未解决重开和辅导员重新转交后，后续状态继续进入后勤事项。

## 演示账号

```text
账号：logistics
密码：123456
```

正常演示数据由 `npm run seed` 重置；当前 PowerShell 使用 `npm.cmd run seed`。测试脚本使用独立临时数据，不覆盖 `server/data/store.json`。

## 本地运行

```powershell
npm.cmd run dev:api
npm.cmd run dev:logistics
```

打开 `http://127.0.0.1:5194`。

## 验收

```powershell
npm.cmd run typecheck
npm.cmd run build:logistics
node scripts/e2e/logistics-workflow.mjs
```

端到端脚本覆盖问题包转交、接收人范围隔离、页面逐项办理、角色权限、学生确认以及 390px 手机布局。服务端状态机仍由 A 维护，D 端只消费 `/api/logistics/work-orders` 契约。
