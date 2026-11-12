# 智汇中枢 · 校园诉求协同督办系统

## 明日演示入口（2026-11-12 更新）

当前可运行的集成版本在 **feat/counselor-neo-ui** 分支，包含学生端、已接后端的辅导员桌面/手机界面、AI 认知链路。进入仓库根目录执行 `npm run demo`，打开 http://127.0.0.1:18792 。首次运行先 `npm ci`。

详见 [教师演示指南与检查记录](docs/教师演示指南.md)，内含 5 分钟讲解步骤、已修复问题、验证结果和原型限制。

`teacher-ui-v1/` 为保留的历史独立 Mock 交付，本次演示无需启动。下方早期交付介绍中的“6 部门精简”等为历史记录；当前字典已扩充至 15 个部门，以实际运行数据为准。

> 给诉求赋权，给基层减负。以辅导员为流转中枢、AI 为调度引擎的学院级学生事务协同督办平台。
>
> 本版本聚焦 **学生手机端** 与 **辅导员手机端**，已完成协同部门精简，仅保留学工场景相关的 6 个协同部门。

## 1. 本轮交付范围

| 端 | 已实现能力 |
| --- | --- |
| 学生手机端 | AI 诉求预检、知识库自助解答、多模态附件选择、工单提交、进度追踪、部门联系、温和催办、办结确认、星级评价、消息中心、个人中心 |
| 辅导员手机端 | 中枢驾驶舱、高风险雷达、SLA 限时督办、待审核队列、AI 研判摘要、多部门分派、部门接单/处置结果代录、催办、内部备注、复合工单拆分、提醒学生确认、宿舍查寝打卡、协同洞察 |
| 后端 | 登录与会话、角色数据隔离、工单全生命周期、通知、AI 规则引擎 + 校园知识库检索、SLA 计算、风险识别、统计聚合 |
| 协同部门 | 学生公寓管理中心、后勤保障处、学院办公室、信息网络中心、保卫处、心理健康教育中心 |

**协同部门字典、数据模型、AI 分派规则、演示数据和界面均已同步完成精简。**

> 说明：当前附件上传为移动端演示版，保存文件名、类型与大小元数据；生产版可接入对象存储。AI 层采用“本地可解释规则 + 校园知识库检索”，并支持通过环境变量一键切换 DeepSeek 大模型增强，接口保持同一份返回结构。

### 可选：启用真实大模型

复制 `.env.example` 为 `.env`，填入 `DEEPSEEK_API_KEY` 后重启服务即可。未配置时系统自动使用本地规则引擎，不影响演示。

```env
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

大模型只负责语义归类、摘要与首响话术；本地规则仍会做风险兜底，**不允许模型下调**已经识别出的高风险等级。

## 2. 技术栈

- 前端：React 18 + TypeScript + Vite + React Router + Lucide
- 后端：Node.js + Express 4
- 数据：轻量 JSON 持久化（`server/data/store.json`），开箱即用，无需安装数据库
- 视觉：移动优先的“中枢控制台”设计语言；深绿 + 青柠 + 暖纸色；自绘 SVG 环形进度、雷达、柱状图与甜甜圈图，无图表库依赖

## 3. 本地运行

环境要求：Node.js 20.12+（使用内置 `.env` 文件加载能力）。

```bash
npm install
npm run dev
```

- 前端：http://127.0.0.1:5180
- API：http://127.0.0.1:8787
- 生产构建与启动：

```bash
npm run build
npm start
# 打开 http://127.0.0.1:8787
```

重置演示数据：

```bash
npm run seed
# 然后重启 npm run dev 或 npm start
```

## 4. 演示账号

| 身份 | 账号 | 密码 | 说明 |
| --- | --- | --- | --- |
| 学生 | `20230118` | `123456` | 林知夏 · 信息工程学院 |
| 辅导员 | `chenyuan` | `123456` | 陈予安 · 信息工程学院 |

登录页也提供 **学生视角 / 辅导员视角** 一键体验入口。

## 5. 核心流程

```text
学生描述诉求
  → AI 语义理解 / 风险识别 / 知识库检索
  → 可自助解决：展示办事指引，可选择不占用工单资源
  → 需要人工：生成标准化工单，辅导员端实时收到提醒
  → 辅导员审核、选择协同部门、写入督办备注
  → 记录部门接单 / 录入处置结果
  → 学生收到通知，确认办结并评价
  → 工单归档，进入部门效率与诉求热点统计
```

高风险关键词（如危机表达、消防通道占用、漏电等）会触发 60 分钟优先 SLA，并在辅导员中枢顶部展示雷达预警。

## AI 与认知层（B 部分）

AI 层由「规则引擎 + 知识图谱 + 风险筛查 + 大模型增强 + 幻觉护栏」组成，**不配置密钥也能完整运行**：模型不可用时自动回退本地规则，业务结论完全一致。

| 能力 | 说明 | 关键文件 |
| --- | --- | --- |
| GraphRAG 权责流程图谱 | 70 节点 / 104 条加权边：15 个部门、23 项权责事项、19 条会签规则、7 个历史卡点、6 个流程阶段；支持子图检索、复合工单识别、会签判定、派单路径与多跳证据链 | `server/ai/graphrag.js` |
| 诉求事件图谱 | 用工单历史给权责节点回填权重（小样本收缩超时率 ×0.5 + 单量占比 ×0.3 + 高风险占比 ×0.2，单量 <2 标记 `sampleAdequate:false`），输出卡点排序与改进建议 | `server/ai/graphrag.js` |
| 风险筛查 Agent | 情绪词典（危机/安全/痛苦/冲突/焦虑 5 维 110 词，含程度副词、否定衰减、标点强化）+ 行为时序特征（24h/72h/7d 提交、夜间占比、最短间隔、同类重复、历史超时、30 天内高风险）→ 高/中/低标签 + 干预建议 | `server/ai/riskAgent.js` |
| 知识库检索 | 泛化词剔除 + 同义词归一 + 字段加权 BM25 + 四级置信分层；仅「高置信 + 低风险 + 非紧急」开放自助答复 | `server/ai/knowledge.js` |
| 大模型加固 | 超时、指数退避重试、熔断、并发闸门、LRU+TTL 缓存、故障注入与指标（含 p95 与失败归因） | `server/ai/llmClient.js` |
| 幻觉护栏 | 字段白名单、风险不降级、硬事实（电话/金额/时限）可追溯、过度承诺与注入残留拦截 | `server/ai/guard.js` |
| Agent 编排 | `intent / route / risk / kb / attribution / guard` 六个 Agent，统一信封协议 `{ok, agent, version, degraded, latencyMs, output, warnings}` | `server/ai/agents.js` |

文档与自检：

- 接口与字段约定：[docs/B部分交付说明.md](docs/B部分交付说明.md)
- 演示命令、答辩台词与演练记录：[docs/B部分演示与验收.md](docs/B部分演示与验收.md)
- 自检脚本：[scripts/ai/README.md](scripts/ai/README.md)

```powershell
node scripts\ai\eval-b.mjs          # 认知链路评测：18 项用例
node scripts\ai\demo-graphrag.mjs   # GraphRAG 检索匹配演示样例
node scripts\ai\demo-risk.mjs       # 风险预警 Demo（可稳定触发风险标签）
node scripts\ai\drill-degrade.mjs   # 容灾降级 + 幻觉护栏演练：35 项检查
```

## 6. 目录结构

```text
.
├─ src/
│  ├─ main.tsx              应用入口（挂载 React、按序引入样式、按需启动 MSW）
│  ├─ App.tsx               路由与角色守卫
│  ├─ types.ts              共享类型
│  ├─ styles/               样式层（按导入顺序层叠）
│  │  ├─ base.css             设计令牌、登录页、桌面舞台
│  │  ├─ student.css          学生端页面样式
│  │  ├─ student-purple.css   学生端紫色主题覆盖层（须在 student.css 之后）
│  │  ├─ counselor.css        辅导员端页面样式
│  │  └─ dorm.css             宿舍查寝样式
│  ├─ components/           通用 UI、工单卡片、导航与手机壳
│  │  └─ layout/             AppShell、底部导航
│  ├─ context/              登录态、全局 Toast
│  ├─ lib/                  API 客户端、格式化、请求 Hook
│  ├─ features/
│  │  └─ contract-demo/     前后端契约演示（页面 + 客户端 + 样式，独立可删）
│  ├─ mocks/                MSW 模拟层（handlers / fixtures / browser / server）
│  └─ pages/
│     ├─ student/          学生首页、诉求列表、提交向导、详情
│     ├─ counselor/        中枢首页、工单台、工单详情、洞察、查寝
│     ├─ Messages.tsx      双端消息中心
│     ├─ Profile.tsx       双端个人中心
│     └─ Login.tsx         身份选择与一键体验
├─ server/
│  ├─ index.js             REST API、权限、工单流转、统计
│  ├─ ai.js                本地分类、风险、SLA、知识库检索入口
│  ├─ ai/                  认知层（B 部分）
│  │  ├─ agents.js           Agent 编排、规则修正、认知链路、工单 AI 快照
│  │  ├─ graphrag.js         权责流程图谱 + 事件图谱 + 子图检索 + 会签判定
│  │  ├─ riskAgent.js        风险筛查：情绪词典 + 行为时序融合 + 干预建议
│  │  ├─ knowledge.js        知识库检索：分词、同义词、字段加权 BM25、置信分层
│  │  ├─ llmClient.js        大模型加固：超时 / 重试 / 熔断 / 并发 / 缓存 / 故障注入
│  │  ├─ guard.js            幻觉护栏：白名单、不降级、硬事实可追溯
│  │  └─ prompts.js          版本化提示词注册表
│  ├─ llm.js               DeepSeek 可选增强层（失败自动回退）
│  ├─ dorm.js / dormSeed.js 宿舍查寝逻辑与演示数据
│  ├─ seed.js              15 个部门、27 张演示工单、知识库
│  ├─ store.js             JSON 持久化
│  └─ reset.js             重置演示数据
├─ scripts/                验收与工具脚本（见 scripts/README.md）
│  ├─ ai/                  B 部分自检：冒烟 / 评测 / 演示 / 降级演练（见 scripts/ai/README.md）
│  ├─ e2e/                 接口 / 界面 / 契约三套端到端校验
│  ├─ screenshots/         各视口与主题的截图脚本
│  ├─ tools/               一次性辅助工具（外部文档抽取、编码恢复）
│  └─ archive/             历史恢复产物，仅留档
├─ docs/                   备赛文档（见 docs/README.md）
├─ public/                 静态资源、MSW worker
├─ push.cmd / push.ps1     一键提交并推送
└─ .env.example            大模型等可选配置样例
```

### 根目录约定

| 文件 | 说明 |
| --- | --- |
| `.env` | 本地真实密钥，**永不入库**（已被 `.gitignore` 忽略） |
| `.env.example` | 配置样例，填入 `DEEPSEEK_API_KEY` 后可启用真实大模型 |
| `.env.local.example` | 本地覆盖样例（覆盖 `.env`，不入库） |
| `.env.development` / `.env.production` | 前端构建开关（是否启用 MSW），不含密钥 |
| `push.cmd` / `push.ps1` | 一键 `add + commit + push` 并带密钥体检，见下方「日常提交」 |
| `vite.config.ts` / `tsconfig.json` | 前端构建与类型配置，修改需评审 |

### 日常提交

```powershell
push "本次改了什么"     # 在仓库根目录执行；省略说明则用时间戳
push "说明" -NoPush     # 只提交不推送
```

脚本会自动暂存、提交、推送并在失败时重试，且会在检测到 `.env` 里出现真实 `sk-` 密钥时拦下确认。

## 7. 主要 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 账号密码登录 |
| POST | `/api/auth/demo` | 一键体验登录 |
| GET | `/api/student/home` | 学生首页聚合 |
| GET | `/api/counselor/dashboard` | 辅导员中枢聚合 |
| GET | `/api/counselor/insights` | 协同洞察 |
| GET/POST | `/api/counselor/dorm-check` | 宿舍查寝数据 / 提交查寝打卡 |
| POST | `/api/ai/precheck` | AI 预检 + 知识库检索（响应新增 `graph` / `risk` / `trace`） |
| GET | `/api/ai/health` | AI 健康度：引擎、熔断与指标、图谱规模、词典规模、提示词版本 |
| GET | `/api/ai/agents` | Agent 清单与 I/O 约定 |
| POST | `/api/ai/agents/:name` | 统一 Agent 调用入口（`attribution` 仅辅导员） |
| GET | `/api/ai/graph` | 图谱总览；`?full=1` 返回完整 `nodes` / `edges` |
| GET | `/api/ai/graph/duty/:id` | 单条权责子图 |
| POST | `/api/ai/graph/query` | 文本 → 权责子图检索（会签 / 复合判定 / 派单路径） |
| GET | `/api/ai/kb/search` | 知识库检索详情（含置信分层与阈值） |
| POST | `/api/ai/risk-scan` | 风险筛查（风险标签 + 干预建议） |
| POST | `/api/ai/attribution` | 复盘归因（卡点排序 + 结论 + 建议） |
| POST | `/api/ai/llm/fault` · `/api/ai/llm/reset` | **演练用**：注入 / 复位模型故障 |
| GET/POST | `/api/tickets` | 工单列表 / 创建 |
| GET | `/api/tickets/:id` | 工单详情（含角色权限） |
| PATCH | `/api/tickets/:id/review` | 辅导员审核分派 |
| PATCH | `/api/tickets/:id/progress` | 部门接单 / 处置结果代录 |
| POST | `/api/tickets/:id/split` | 复合工单拆分 |
| POST | `/api/tickets/:id/urge` 等 | 催办、备注、提醒确认 |
| POST | `/api/tickets/:id/confirm` | 学生确认办结 + 评价 |
| GET/POST | `/api/notifications*` | 消息中心 |

## 8. 已验收

- `npm run build` 通过。
- Playwright 以 390 × 844 移动视口完整走查学生端、辅导员端全部页面，浏览器控制台无报错。
- API 端到端流程已通过：学生提交 → 辅导员审核分派 → 部门接单 → 录入处置结果 → 学生确认并 5 星评价 → 归档。
- AI 认知层（B 部分）自检全部通过：`eval-b.mjs` 18/18、`drill-degrade.mjs` 35/35，GraphRAG 与风险预警演示脚本退出码均为 0。
- 容灾验证：无 API Key、模型超时、网络不可达、脏 JSON、上游 500 五种情形下业务结论与规则基线零差异。

## 9. 下一阶段建议

1. 增加职能部门移动端与学工/党委驾驶舱。
2. 接入对象存储、消息推送（订阅消息 / WebSocket）与统一身份认证。
3. 将 JSON 存储替换为 PostgreSQL / MySQL，补充审计日志与数据脱敏策略。
4. 知识库扩容后可把 `searchKnowledgeDetailed` 换成向量检索（上层接口已抽象，无需改动认知链路）；用积累的 `behaviorFeatures` 训练 D 侧时序风险预测模型。
