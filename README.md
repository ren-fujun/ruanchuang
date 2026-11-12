# 智汇中枢 · 校园诉求协同督办系统

> 给诉求赋权，给基层减负。以辅导员为流转中枢、AI 为调度引擎的学院级学生事务协同督办平台。
>
> 本版本聚焦 **学生手机端** 与 **辅导员手机端**，当前为演示原型；部门、联系方式和初始工单均为示例，尚未接入学校真实系统。

## 1. 本轮交付范围

| 端 | 已实现能力 |
| --- | --- |
| 学生手机端 | AI 诉求预检、知识库自助解答、多模态附件选择、工单提交、进度追踪、部门联系、温和催办、办结确认、星级评价、消息中心、个人中心 |
| 辅导员手机端 | 中枢驾驶舱、高风险雷达、SLA 限时督办、待审核队列、AI 研判摘要、多部门分派、部门接单/处置结果代录、催办、内部备注、复合工单拆分、提醒学生确认、宿舍查寝打卡、协同洞察 |
| 后端 | 登录与会话、角色数据隔离、工单全生命周期、通知、AI 规则引擎 + 校园知识库检索、SLA 计算、风险识别、统计聚合 |
| 协同部门 | 学生公寓管理中心、后勤保障处、学院办公室、信息网络中心、保卫处、心理健康教育中心 |

**部门建议和处理时限需要辅导员确认；系统内记录督办不代表消息已发送给部门。**

> 说明：当前附件上传为移动端演示版，保存文件名、类型与大小元数据；生产版可接入对象存储。AI 层采用“本地可解释规则 + 校园知识库检索”，并支持通过环境变量一键切换 DeepSeek 大模型增强，接口保持同一份返回结构。

### 可选：启用真实大模型

复制 `.env.example` 为 `.env`，填入 `DEEPSEEK_API_KEY` 后重启服务即可。未配置时系统自动使用本地规则引擎，不影响演示。

```env
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

大模型可用于语义归类和摘要增强；部门建议及回复草稿保留本地规则结果。模型不可用时回退本地规则，且不允许模型下调本地规则已识别的风险等级。

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

重置演示数据（会覆盖默认演示数据文件；运行前先确认并备份需要保留的内容）：

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
  → 工单办结，进入工单统计（原型没有单独的归档状态）
```

本地规则命中的高风险信号会触发示例时限和人工复核提示；实际风险和时限需要辅导员判断。

如果你是第一次接触代码，可先阅读 [零基础项目学习与演示指南](docs/零基础项目学习与演示指南.md)。

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
│  ├─ ai.js                本地分类、风险、SLA、知识库检索
│  ├─ llm.js               DeepSeek 可选增强层（失败自动回退）
│  ├─ dorm.js / dormSeed.js 宿舍查寝逻辑与演示数据
│  ├─ seed.js              6 个部门、27 张演示工单、知识库
│  ├─ store.js             JSON 持久化
│  └─ reset.js             重置演示数据
├─ scripts/                验收与工具脚本（见 scripts/README.md）
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
| POST | `/api/ai/precheck` | AI 预检 + 知识库检索 |
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

## 9. 下一阶段建议

1. 接入真实大模型与校内办事知识库向量检索（接口已预留）。
2. 增加职能部门移动端与学工/党委驾驶舱。
3. 接入对象存储、消息推送（订阅消息 / WebSocket）与统一身份认证。
4. 将 JSON 存储替换为 PostgreSQL / MySQL，补充审计日志与数据脱敏策略。
