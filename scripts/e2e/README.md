# E2E 执行说明

## 前置条件

- API 运行在 `http://127.0.0.1:8787`
- 前端运行在 `http://127.0.0.1:5180`
- 使用真实后端，不能启用 MSW Mock
- 本机安装 Microsoft Edge（默认），或通过 `--browser chrome` 指定 Chrome

```powershell
$env:VITE_USE_MOCK = 'false'
npm run seed
npm run dev
```

另开一个终端：

```powershell
npm run e2e
npm run e2e:critical
```

执行完成后，报告与截图写入 `artifacts/e2e-*` 和 `artifacts/critical-*`，不会覆盖正式联调记录。

## 覆盖范围

`npm run e2e`：学生提交 → 辅导员审核分派 → 部门接单 → 录入处置结果 → 学生确认并评价 → 390px 无横向溢出。

`npm run e2e:critical`：无 Token 401、未登录跳转、学生越权 403、无模型 Key 本地兜底、高风险强制转工单、重复提交、360px 无横向溢出、浏览器未捕获异常。

> 当前 `main` 尚未合入 A 的 v1 envelope 分支时，根目录应用会因接口格式不符而失败；先完成 A 的合并，再以 `main` 为基线复跑。
