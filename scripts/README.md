# scripts/ · 验收与工具脚本

这些脚本是**开发期辅助工具**，不参与生产构建（`npm run build` / `npm start` 都不依赖它们），
删掉任何一个都不影响系统运行。

## 运行约定（重要）

- **必须在仓库根目录执行**。所有脚本内部用的是相对路径（如 `screenshots/e2e/...`），
  在 `scripts/` 目录里执行会把截图写到错误位置。
- 需要 Playwright 的脚本依赖已安装的 `playwright` 与**本机 Edge 浏览器**（`channel: 'msedge'`）。
- 截图脚本要求对应服务已启动，各脚本内置的地址不同，见下表。

```powershell
cd D:\DSH
node scripts\e2e\api.mjs
node scripts\screenshots\core-pages.mjs
```

## ai/ · B 部分（AI 与认知层）自检与演示

| 脚本 | 作用 | 产出 |
| --- | --- | --- |
| `smoke-b.mjs` | 冒烟自检：跑通一条认知链路并打印图谱 / 知识库 / 风险词典规模 | 控制台 |
| `eval-b.mjs` | 认知链路评测：15 条链路用例 + 3 条护栏用例（`--llm` 可连模型一起跑） | 控制台 + 退出码 |
| `demo-graphrag.mjs` | GraphRAG 检索匹配演示样例（含会签、复合工单、派单路径、卡点归因） | `scripts/ai/out/graphrag-demo.json` |
| `demo-risk.mjs` | 风险预警 Demo：情绪维度 + 行为时序融合，稳定触发高/中/低标签 | `scripts/ai/out/risk-demo.json` |
| `drill-degrade.mjs` | 容灾降级与幻觉护栏演练：无 Key 兜底、4 种故障注入、熔断、护栏、知识库阈值 | `scripts/ai/out/degrade-drill.json` |

**全部可离线运行**（不需要 API Key，也不需要先起服务），退出码即结论。详见 [ai/README.md](ai/README.md)
与 [../docs/B部分演示与验收.md](../docs/B部分演示与验收.md)。

## e2e/ · 端到端校验

| 脚本 | 前置服务 | 作用 |
| --- | --- | --- |
| `api.mjs` | `npm start`（API `8787`） | 接口全链路：登录 → 提交诉求 → 审核分派 → 部门接单 → 处置 → 确认评价 → 归档 |
| `ui.mjs` | `npm start`（默认 `8787`，支持 `E2E_BASE_URL`） | 390×844 移动视口走查，收集控制台报错，截图落在 `screenshots/e2e/` |
| `contract-mock.mjs` | `npm run dev`（`5180`） | 校验前后端契约：MSW 模拟数据与真实接口返回结构是否一致 |

> `api.mjs` 和 `ui.mjs` 默认访问 `8787`，可通过 `E2E_BASE_URL` 指定独立测试服务。测试会创建工单，请勿对正式数据运行。

## screenshots/ · 截图产出

| 脚本 | 目标服务 | 产出目录 |
| --- | --- | --- |
| `core-pages.mjs` | `npm start`（`8787`） | `screenshots/`（编号 01–15 的主线截图） |
| `viewport-360.mjs` | 需在 `8788` 起服务 | `screenshots/360/`（360px 窄屏适配复核） |
| `dorm-check.mjs` | 需在 `8788` 起服务 | `screenshots/dorm-check*.png` |
| `theme-purple.mjs` | 需在 `8788` 起服务 | `screenshots/purple/` |
| `theme-purple-extra.mjs` | 需在 `8788` 起服务 | `screenshots/purple/`（AI 预检与评价弹层补充） |

`screenshots/` 已被 `.gitignore` 忽略，仅作本地验收留证，不进仓库。

## tools/ · 一次性辅助工具

| 脚本 | 作用 | 注意 |
| --- | --- | --- |
| `extract-spec.py` | 从需求 `.docx` 中导出段落与表格，供需求整理 | 需 `python-docx`，且源文件路径写死在脚本里，用前改成自己的路径 |
| `recover-encoding.py` | 从 GBK/UTF-8 二次编码事故中恢复 `Messages.tsx` / `Profile.tsx` | 历史一次性工具；其输出路径仍指向旧的 `scripts/recovered-*.tsx`，现在对应 `scripts/archive/` |

## archive/ · 留档产物

| 文件 | 说明 |
| --- | --- |
| `recovered-Messages.tsx` | 编码事故恢复出的历史副本，**不是**在用的源码 |
| `recovered-Profile.tsx` | 同上 |

在用的源码在 `src/pages/Messages.tsx` 与 `src/pages/Profile.tsx`。
这里仅作留档保留，**请勿直接引用或改这里的文件**——改了不会生效。
