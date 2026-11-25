# 第三阶段 D 测试与源码交付

日期：2026-11-24。基线：`feat/a-five-portals-backend` 最新提交 `df91492`。本文用于报名材料、计划书和评审展示，不把本地验证写成公网试用已经完成。

## 工程证据

| 项目 | 结果 | 命令/位置 |
| --- | --- | --- |
| 类型检查 | 通过 | `npm.cmd run typecheck` |
| 五端构建 | 通过 | `npm.cmd run build:portals` |
| 服务端与运维单测 | 42 项通过 | `node --test server/*.test.js scripts/ops/*.test.mjs` |
| 五端总回归 | 12 项通过 | `npm.cmd run test:five-portals` |
| B 请假与学业协商 | 87 项通过 | `npm.cmd run test:b-trial` |
| C 跨端报修、异议、协调、本科请假 | 通过 | `node scripts/c/trial-e2e.mjs` |
| C 五端试用反馈 | 通过 | `node scripts/c/feedback-e2e.mjs` |
| D 直达报修 | 7 项通过 | `node scripts/e2e/logistics-workflow.mjs` |
| 预约浏览器验证 | 通过 | `node scripts/c/verify.mjs` |
| 10 条演示数据彩排 | 通过 | `node scripts/ops/rehearse-trial.mjs` |
| AI 认知链与护栏评测 | 26/26 通过 | `node scripts/ai/eval-b.mjs` |
| 模拟故障降级与护栏演练 | 47/47 通过 | `node scripts/ai/drill-degrade.mjs --quiet` |
| 校园反馈汇总入口 | 3/3 子套件通过 | `node scripts/e2e/campus-feedback.mjs` |
| AI 汇总入口 | 2/2 子套件通过 | `node scripts/e2e/assistant-llm.mjs` |
| 备份恢复与首个管理员初始化 | 通过 | `scripts/ops/*.test.mjs` |

预约验证覆盖辅导员发布时段的时间校验、学生预约冲突保留表单、重试成功和取消预约；该验证使用浏览器契约样例，不等同于真实预约后端已经投入学校正式排班。

演示数据彩排覆盖学生 H5 提交报修、辅导员查看高风险工单和协同洞察、后勤即时收到学生直达报修，以及学生手机端无横向溢出。截图：

- `docs/e2e-evidence/demo-student-home.png`
- `docs/e2e-evidence/demo-student-repair.png`
- `docs/e2e-evidence/demo-counselor-risk.png`
- `docs/e2e-evidence/demo-insights.png`
- `docs/e2e-evidence/demo-logistics.png`

## 三周方案脚本核对

方案文档引用的两个入口已补为可执行汇总脚本，内部调用当前真实存在的测试，不伪造请求数或模型结果。

当前使用的证据为：

- 校园反馈与权限：`node scripts/e2e/campus-feedback.mjs`
- AI 与降级：`node scripts/e2e/assistant-llm.mjs`
- 当前未配置真实 DeepSeek Key，因此只有本地规则与模拟故障证据，没有真实模型质量、真实响应时间或失败样本。

本次汇总脚本实际执行结果为：

- 校园反馈：C/D 跨端报修、C 五端反馈、五端总回归三个子套件全部通过。
- AI：本地认知链 26/26、降级与护栏演练 47/47 全部通过。
- 真实模型字段明确记录为 `false`，未把本地规则结果冒充真实模型效果。

## 可运行源码包

从当前提交重新生成：

```powershell
.\scripts\ops\package-release.ps1 -Tag d-final-20261124
```

包内包含：

- 五端独立静态产物
- Node.js/Express 服务端源码
- 数据备份、恢复和健康检查脚本
- Nginx HTTPS 与五端 SPA 配置模板
- D 测试与部署文档
- 锁文件、发布清单和 SHA-256 校验

运行数据、密码、令牌和证书不进入源码包。

## 本轮暂不能提供的数据

以下数据必须在首次邀请试用后补：

- 实际参与人数与角色分布
- 各任务开始、完成和放弃数量
- 平均完成耗时、主要卡点
- 试用反馈原话和问题关闭情况
- 外网扫码、手机流量、服务重启持久化及真实服务器回滚结果

当前没有真实试用数据，不能用虚构统计代替。
