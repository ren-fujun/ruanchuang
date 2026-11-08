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

## e2e/ · 端到端校验

| 脚本 | 前置服务 | 作用 |
| --- | --- | --- |
| `api.mjs` | `npm start`（API `8787`） | 接口全链路：登录 → 提交诉求 → 审核分派 → 部门接单 → 处置 → 确认评价 → 归档 |
| `ui.mjs` | 需在 `8788` 起服务 | 390×844 移动视口走查，收集控制台报错，截图落在 `screenshots/e2e/` |
| `contract-mock.mjs` | `npm run dev`（`5180`） | 校验前后端契约：MSW 模拟数据与真实接口返回结构是否一致 |

> `ui.mjs` 里的基址是历史遗留的 `8788`，若本机服务不在该端口，请先改脚本首行的 `base`。

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
