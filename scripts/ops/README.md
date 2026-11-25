# 试用环境运维脚本

这些脚本只操作显式配置的本地数据文件，不包含服务器凭据，也不代替公网部署。

## 环境变量

```text
ZHIHUI_DATA_FILE      数据文件，默认 server/data/store.json
ZHIHUI_BACKUP_DIR     备份目录，默认 server/backups
ZHIHUI_PUBLIC_BASE_URL 试用服务网址，健康检查使用
```

## 健康检查

```powershell
$env:ZHIHUI_PUBLIC_BASE_URL='https://实际域名'
node scripts/ops/healthcheck.mjs
```

未提供真实 HTTPS 域名时，只能检查本机 `http://127.0.0.1:8787`，不能把结果写成“外网已验收”。

## 生成试用演示数据

```powershell
node scripts/ops/create-trial-demo.mjs .tmp/trial-demo/store.json
```

脚本生成 10 条固定虚构工单，覆盖 6 个部门、5 种状态、2 条高风险和至少 1 条逾期事项。目标文件必须不存在，避免覆盖现有试用数据。

生成后执行质量检查：

```powershell
node scripts/ops/verify-trial-demo.mjs .tmp/trial-demo/store.json
```

进行真实浏览器演示彩排：

```powershell
node scripts/ops/rehearse-trial.mjs
```

脚本使用隔离 API 和学生、辅导员、后勤三个页面，验证学生提交报修、辅导员高风险看板、协同洞察及后勤收到事项，并将截图保存到 `.tmp/trial-rehearsal`。

## 一键启动本地试用演示

```powershell
.\scripts\ops\start-trial-demo.ps1
```

首次运行会生成 10 条演示数据，并在一个窗口启动 API、学生端、辅导员端和后勤端。需要重新生成演示数据时使用：

```powershell
.\scripts\ops\start-trial-demo.ps1 -Reset
```

## 备份

```powershell
node scripts/ops/backup.mjs
```

脚本会校验 JSON 结构，再生成带时间戳的备份，不覆盖旧备份。

## 恢复

```powershell
node scripts/ops/restore.mjs server/backups/store-时间戳.json --yes
```

恢复前会自动保留当前数据；必须先停止 API，恢复后重启。不要在用户试用期间覆盖数据。
