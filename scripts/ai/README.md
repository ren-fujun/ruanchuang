# scripts/ai/ · B 部分（AI 与认知层）自检与演示脚本

这些脚本是**开发期自检 / 答辩演示工具**，不参与生产构建，删掉不影响系统运行。
默认仅运行本地规则。显式开启在线评测的命令需要模型服务配置。

## 运行约定

- **必须在仓库根目录执行**（脚本内部按相对路径读写 `scripts/ai/out/`）。
- 不需要手动启动服务。咨询对照脚本会启动独立测试 API，使用临时合成数据。
- 退出码 `0` = 全部通过，非 `0` = 有检查项未通过，可直接用于 CI 或验收把关。

```powershell
cd D:\DSH
node scripts\ai\smoke-b.mjs
node scripts\ai\eval-b.mjs
node scripts\ai\demo-graphrag.mjs
node scripts\ai\demo-risk.mjs
node scripts\ai\drill-degrade.mjs
```

## 脚本清单

| 脚本 | 作用 | 关键参数 | 产出 |
| --- | --- | --- | --- |
| `smoke-b.mjs` | 冒烟自检：跑通一条认知链路，打印图谱 / 知识库 / 风险词典规模与关键结论 | — | 控制台 |
| `eval-b.mjs` | **评测集**：15 条认知链路用例（B-01…B-15）+ 3 条护栏用例，覆盖分类修正、风险标签、行为时序融合、GraphRAG 会签、复合工单、知识库阈值、部门白名单 | `--llm` 连真实模型一起跑 | 控制台 + 退出码 |
| `eval-assistant.mjs` | 学生咨询历史回归与同题对照，另记录预约建议与咨询 Token 用量 | `--compare`、`--live`、可选 JSON 路径 | 逐轮结果、质量指标和费用口径 |
| `demo-graphrag.mjs` | **GraphRAG 检索匹配演示**：图谱总览、8 条检索样例（权责命中 / 会签 / 复合判定 / 派单路径 / 证据链）、权责子图、事件图谱卡点归因 | `--quiet` 只导出 | `out/graphrag-demo.json` |
| `demo-risk.mjs` | **风险预警 Demo**：9 条样例稳定触发高 / 中 / 低标签，展示情绪维度、行为时序特征、干预建议与话术；附标签稳定性复跑与情绪维度抽查 | `--repeat N` 复跑次数（默认 3）、`--quiet` | `out/risk-demo.json` |
| `drill-degrade.mjs` | **容灾降级演练**：无 Key 兜底、4 种故障注入（timeout / offline / bad-json / http-500）、熔断打开与复位、10 项幻觉护栏、6 项知识库阈值 | `--quiet` 只导出 | `out/degrade-drill.json` |

> `--llm` 仅在配置了 `DEEPSEEK_API_KEY` 时有意义；其余脚本默认完全不碰网络。

### 学生咨询同题对照

```powershell
node scripts/ai/eval-assistant.mjs --compare .tmp/assistant-comparison-local.json
node scripts/ai/eval-assistant.mjs --compare --live .tmp/assistant-comparison-live.json
```

同题对照保留原始合成问题与判据，测当前分支的 `/api/b/assistant` 和 `/api/appointments/advice`。报告保留与历史预期的差异。对照模式用于记录结果。开启 `--live` 时还会检查直接回答和带已审核资料的回答是否实际调用了模型。

直接执行 `node scripts/ai/eval-assistant.mjs .tmp/assistant-regression.json` 会逐条核对历史判据，出现差异时返回非零退出码。历史材料中的通过数对应当时的版本。

费用估算使用 `B_EVAL_CACHED_INPUT_PER_MILLION`、`B_EVAL_UNCACHED_INPUT_PER_MILLION`、`B_EVAL_OUTPUT_PER_MILLION`。如单价或用量缺失则仅记录可用数据。咨询用量在开始预约建议评测前采样。

## 产物说明（`out/`）

`out/` 里的 JSON 是演示与验收的留证材料，可直接贴进答辩 PPT 或交给 C 做大屏数据源：

- `graphrag-demo.json`：图谱总览 `overview`、逐条检索结果 `cases[].result`、权责子图 `dutySubgraph`、卡点归因 `eventGraph`。
- `risk-demo.json`：阈值与词典规模、逐条样例的完整 `scanRisk` 输出（含 `signals` / `dimensions` / `intervention`）、稳定性复跑结果。
- `degrade-drill.json`：基线业务结论、四种故障的降级记录、熔断状态序列、护栏与知识库逐项检查结果、`summary` 汇总。

`out/` 不进仓库（见 `.gitignore`），每次运行都会覆盖。

## 演练专用开关（不要在生产环境使用）

故障注入是进程级开关，脚本内直接设置 `process.env.DEEPSEEK_API_KEY` 与 `setFaultMode()`；
服务端等价入口为：

- `POST /api/ai/llm/fault`（`{ "mode": "timeout" | "offline" | "bad-json" | "http-500" }`）
- `POST /api/ai/llm/reset`（复位熔断、缓存与指标）

两者均为**演练接口**，仅用于答辩演示与自测。

## 常见问题

- **脚本报 `Cannot find package` / 找不到模块**：多半是没在仓库根目录执行。
- **没配 Key 时 `eval-b.mjs --llm` 会失败吗**：不会。未启用模型时链路自动降级，断言仍以规则结论为准。
- **改了知识库后检索结果没变**：`knowledge.js` 的索引在模块加载时构建；进程内热更新需调用 `rebuildIndex()`，重跑脚本即可。
