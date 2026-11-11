# B 部分交付说明 · 大模型算法与认知层

> 角色：**成员 B · 大模型算法与认知层（AI & LLM）**
> 定位：核心 AI 能力开发、知识库与风控中枢
> 本文用途：给 A（后端与架构）/ C（辅导员端与可视化）/ D（测试与交付）交代**接口、字段与配置约定**，
> 并逐条对应「基础任务 + 升级任务」的交付标准（AI 服务稳定、幻觉可控、GraphRAG 演示样例、风险预警 Demo）。
> 演示命令、答辩台词与演练留证见 [B部分演示与验收.md](./B部分演示与验收.md)。

---

## 一、交付范围

### 1.1 承接的原有任务

| 任务 | 落点 | 交付证据 |
| --- | --- | --- |
| AI 规则修正 | `server/ai/agents.js` → `applyRuleCorrections()` | `eval-b.mjs` B-05 / B-12（规则与图谱互相纠偏） |
| 知识库匹配阈值 | `server/ai/knowledge.js` | `eval-b.mjs` B-06 / B-07 / B-08；`drill-degrade.mjs` 步骤 5 |
| DeepSeek 超时降级 | `server/ai/llmClient.js` + `server/llm.js` | `drill-degrade.mjs` 步骤 1–3 |

### 1.2 基础任务

- **保障大模型调用链路稳定 + 超时降级策略**：超时、指数退避重试、熔断、并发闸门、LRU+TTL 缓存、故障注入、指标采集（含 p95 与失败归因计数）。
- **调优知识库检索阈值，提升自助答复准确率**：字段加权 BM25 + 同义词归一 + 泛化词剔除 + 四级置信分层 + 四条兜底规则（歧义、弱证据、短查询、高风险关门）。
- **完成 AI 前置预检与规则修正**：`POST /api/ai/precheck` 在原有契约上增加图谱与风险结论，并把「图谱权责归属 / 风险等级」回写进分析结果。

### 1.3 升级任务（创新点 2、3）

- **创新点 2 · GraphRAG + 轻量级权责流程图谱**：70 节点 / 104 条加权边的权责—流程图谱 + 由工单历史回填权重的诉求事件图谱，支撑**路由 Agent**、**意图 Agent 识别复合工单**、**触发会签**。
- **创新点 3 · 风险筛查 Agent**：文本情绪分析 + 行为时序特征融合，输出**高/中/低风险标签**与**干预建议**（动作、话术、触达方式、通知部门、SLA）。

---

## 二、架构总览

```
                     ┌────────────────────────── POST /api/ai/precheck ──────────────────────────┐
                     │                                                                          │
  诉求文本 ──► 意图解析 Agent ──┬──► 风险筛查 Agent ──┐                                          │
                (intent)        │     (risk)         │                                          │
                                ├──► 权责路由 Agent ──┼──► 规则修正 ──► 幻觉护栏 ──► 组装输出 ──┘
                                │    (route/GraphRAG) │   applyRule-     guard
                                └──► 知识库 Agent ────┘   Corrections
                                     (kb)
                                        │
                     ┌──────────────────┴──────────────────┐
                     │  LLM 加固层 (ai/llmClient.js)        │
                     │  超时·重试·熔断·并发·缓存·故障注入     │
                     └──────────────────┬──────────────────┘
                                        │ 任一环节不可用
                                        ▼
                              本地规则链路（永远可用）

   复盘归因 Agent (attribution) ◄── 工单历史 ──► 诉求事件图谱卡点权重
```

### 2.1 模块与文件

| 文件 | 职责 | Owner |
| --- | --- | --- |
| `server/ai/prompts.js` | 版本化提示词注册表（`intentAnalysis@v2`、`riskScan@v1`、`routeAssist@v1`、`selfServiceAnswer@v1`、`groundedReview@v1`） | B |
| `server/ai/llmClient.js` | 大模型调用加固层：超时/重试/熔断/并发/缓存/故障注入/指标 | B |
| `server/ai/guard.js` | 幻觉护栏：字段白名单、不降级、硬事实可追溯、注入残留 | B |
| `server/ai/knowledge.js` | 知识库检索：分词、同义词、字段加权 BM25、四级置信分层 | B |
| `server/ai/graphrag.js` | 权责流程图谱 + 事件图谱 + 子图检索 + 会签判定 + 卡点归因 | B |
| `server/ai/riskAgent.js` | 风险筛查：情绪词典 + 行为时序融合 + 干预建议库 | B |
| `server/ai/agents.js` | Agent 编排、信封协议、规则修正、认知链路、工单快照 | B |
| `server/ai.js` | 规则引擎（分类/风险/SLA/知识库检索），B 仅做**加法式**改造 | A/D 原有 |
| `server/llm.js` | DeepSeek 增强薄封装（对外接口名保持不变） | B |
| `server/index.js` | AI 相关路由（B 新增 `/api/ai/*`），其余不动 | A |
| `scripts/ai/*` | 冒烟 / 评测 / 演示 / 降级演练脚本 | B |

> 依赖方向：`agents.js → ai.js`（单向）。`ai.js` **不反向依赖** `agents.js`，`graphrag.js` 通过入参 `preferredDepts` 接收分类先验，避免循环依赖。

---

## 三、接口契约

### 3.1 兼容既有接口：`POST /api/ai/precheck`

原有请求仍可使用。调用方可选传 `urgency`（`normal`、`high`、`urgent`），让预检按提交时的紧急度判断自助资格。

```json
{ "text": "宿舍阳台天花板漏水，已经滴到插线板附近", "location": "学生公寓 5 号楼 208", "category": "宿舍生活", "useLlm": true }
```

响应在**原有字段全部保留**的基础上**只增不改**：

| 字段 | 状态 | 说明 |
| --- | --- | --- |
| `analysis` | 兼容 | 分类、风险、紧急度、SLA、建议部门、要素、摘要、话术（新增 `riskScore` / `riskSignals` / `tags` 内可能含「图谱路由」「高风险预警」） |
| `knowledge` | 兼容 | 命中条目，新增 `matchTier` / `confidence` / `matchedTerms` / `related` / `ambiguous` / `threshold` |
| `answer` | 兼容 | 自助答复或引导话术（高风险/紧急时强制关闭自助） |
| `canSelfSolve` | 兼容 | 仅当知识库 **confident** + 低风险 + 非紧急才为 `true` |
| `needsTicket` / `quickReplies` | 兼容 | 未改动 |
| `graph` | **新增** | GraphRAG 检索结果（见 3.4） |
| `risk` | **新增** | 风险筛查结果（见 3.4） |
| `trace` | **新增** | 链路轨迹 `[{ agent, degraded, ms, warnings, notes? }]` |
| `latencyMs` / `engine` | **新增** | 链路耗时。模型输出实际参与时为 `deepseek+rules`，其余为 `local-rules` |

### 3.2 新增接口一览

| 方法 | 路径 | 权限 | 作用 |
| --- | --- | --- | --- |
| GET | `/api/ai/health` | 登录 | AI 健康度：Agent 版本、引擎、LLM 熔断与指标、知识库索引、图谱规模、风险词典、护栏规则、提示词版本 |
| GET | `/api/ai/agents` | 登录 | Agent 清单与 I/O 约定（A 侧编排参考） |
| POST | `/api/ai/agents/:name` | 登录（`attribution` 仅辅导员） | 统一 Agent 调用入口，`output` 直接包含 Agent 结果。学生调用 `risk` 时，服务端使用当前账号的工单历史 |
| GET | `/api/ai/graph` | 登录 | 图谱总览；`?full=1` 追加完整 `nodes` / `edges`（供 C 大屏渲染） |
| GET | `/api/ai/graph/duty/:id` | 登录 | 单条权责子图（入边/出边，含来源节点），找不到返回 404 |
| POST | `/api/ai/graph/query` | 登录 | 任意文本的图谱检索：`{ text, category?, preferredDepts?, riskLevel?, limit? }` |
| GET | `/api/ai/kb/search` | 登录 | 知识库检索详情 `?q=`，返回分层与阈值，用于阈值调优观察 |
| POST | `/api/ai/risk-scan` | 登录 | 规则风险筛查。学生使用当前账号的工单历史；辅导员可传 `studentId` 查询历史，也可传 `history` 和 `baseRisk` 做模拟 |
| POST | `/api/ai/attribution` | 辅导员 | 复盘归因：卡点排序 + 一句话结论 + 改进建议 |
| POST | `/api/ai/llm/fault` | 辅导员 | **演练用**：注入 `timeout` / `offline` / `bad-json` / `http-500` |
| POST | `/api/ai/llm/reset` | 辅导员 | **演练用**：复位熔断、缓存与指标 |

### 3.3 Agent 信封协议（给 A 的 Pipeline）

`POST /api/ai/agents/:name` 与 `invokeAgent()` 统一返回：

```json
{
  "ok": true,
  "agent": "route",
  "version": "b-1.0.0",
  "degraded": false,
  "latencyMs": 3,
  "output": { },
  "warnings": []
}
```

- **永不抛异常**：Agent 内部异常被捕获为 `ok:false, degraded:true, output:null, warnings:[原因]`，A 侧可直接按 `ok` 分支，不需要 try/catch。
- `degraded:true` 时 `output` 仍可能有效（模型不可用 → 回退本地规则），业务结论依然完整。
- `agent` 取值：`intent` / `route` / `risk` / `kb` / `attribution` / `guard`。

### 3.4 新增字段定义（C 端展示 / D 端训练）

**`graph`（GraphRAG 检索结果）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `matched` | boolean | 是否命中明确权责事项（未命中时 `complexity='unknown'`，前端应提示人工确认） |
| `duties[]` | array | 候选权责事项：`id` / `name` / `score` / `ownerDept` / `ownerDeptName` / `matchedKeywords` / `selected` |
| `primaryDuty` / `primaryDept` | object / string | 主责权责与主责部门 id |
| `ownerDepts` | string[] | 联合主办部门（复合工单时长度 > 1） |
| `collaboratorDepts` | string[] | 协同 + 会签 + 诉求中提到的部门（已去重、已剔除主办） |
| `countersign` | object | `required` / `departments[{id,name,short,reason,dutyId}]` / `rules[]` / `jointOwners[]` |
| `dispatchPath[]` | array | 派单路径：`order` / `stage` / `actor` / `action` / `slaMinutes` / `countersign?` |
| `complexity` | string | `single` / `compound` / `unknown` |
| `bottlenecks[]` | array | 该权责的历史卡点：`id` / `name` / `hint` / `suggestion` / `deptName` |
| `escalation[]` | array | 升级路径：`dept` / `deptName` / `reason` |
| `slaMinutes` | number | 取相关权责中最紧的时限 |
| `confidence` | number | 0–0.95，检索置信度 |
| `evidence[]` | array | 多跳证据链：`path` / `type` / `label` / `weight`（可直接渲染成解释气泡） |

**`risk`（风险筛查结果）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `level` / `levelLabel` | string | `high` / `medium` / `low` 与中文标签 |
| `score` / `thresholds` | number / object | 融合分（情绪 + 行为）与当前阈值（可解释） |
| `reasons[]` | string[] | 判定依据（人类可读，可直接展示） |
| `signals[]` | array | `type`(`crisis`/`safety`/`emotion`/`behavior`) / `label` / `weight` / `evidence` |
| `dimensions.emotion` | object | `score` / `polarity` / `intensity` / `dominantDimension` / `hits[]` / `dimensionScores` |
| `dimensions.behavior.features` | object | **D 端可直接作为特征向量**：`totalTickets` / `submits24h` / `submits72h` / `submits7d` / `nightSubmits` / `nightRatio` / `minIntervalMinutes` / `repeatCategory7d` / `overdueCount` / `priorHighRisk30d` |
| `intervention` | object | `level` / `deadline` / `channels[]` / `notifyDepartments[]` / `actions[]` / `script` / `followUp[]` / `resources[]` / `tone`（配色建议） |
| `slaMinutes` | number | 60 / 120 / 240（高/中/低） |
| `confidence` | number | 判定置信度 |

**`knowledge`（新增子字段）**：`matchScore` / `matchTier`(`confident`/`probable`/`weak`/`none`) / `confidence` / `matchedTerms` / `related` / `ambiguous` / `threshold`。

### 3.5 工单落库字段：`ticket.ai`

`ticketAiSnapshot()`（`server/ai/agents.js`）在原有 `summary / risk / riskReason / sentiment / confidence / suggestedDepartments / tags / draft` 之外新增：

- `elements`：结构化要素（地点、时间、涉及人员、诉求类型…）
- `riskScan`：`level` / `score` / `signals[≤6]` / `intervention` / `behaviorFeatures` / `at`
- `graph`：`matched` / `primaryDuty` / `primaryDept` / `ownerDepts` / `collaboratorDepts` / `countersign` / `dispatchPath` / `complexity` / `bottlenecks` / `evidence[≤6]` / `confidence`

> 工单创建时还会向 timeline 追加「GraphRAG 权责路由」「风险筛查」两条事件，C 端详情页可直接读到派单依据。

---

## 四、GraphRAG 设计（创新点 2）

### 4.1 图谱 schema

**权责—流程图谱**（70 节点 / 104 条加权边）

| 节点类型 | 数量 | 关键属性 |
| --- | --- | --- |
| `department` | 15 | `name` / `short` / `sla` / `phone` / `contact` |
| `duty`（权责事项） | 23 | `ownerDept` / `supportDepts` / `categories` / `keywords` / `slaMinutes` / `bottlenecks` / `escalateTo` / `countersign` |
| `countersign`（会签规则节点） | 19 | `dept` / `reason` / `trigger` |
| `bottleneck`（卡点） | 7 | `name` / `hint` / `suggestion` / `dept` |
| `stage`（流程阶段） | 6 | `slaMinutes` / `desc` |

| 边类型 | 语义 | 权重 |
| --- | --- | --- |
| `owns` | 部门 —主责→ 权责 | 1.0 |
| `supports` | 部门 —协同→ 权责 | 0.6 |
| `requires_countersign` | 权责 —触发会签→ 会签节点 | 1.0 |
| `countersigned_by` | 会签节点 —会签部门→ 部门 | 0.9 |
| `bottleneck_at` | 权责 —历史卡点→ 卡点 | 0.8 |
| `escalates_to` | 权责 —升级→ 部门 | 0.9 |
| `enters` | 权责 —进入流程→ 受理阶段 | 1.0 |
| `precedes` | 阶段 —先后→ 阶段 | 1.0 |

### 4.2 检索流程

1. **文本归一** → 权责关键词打分（长关键词权重更高，记录全部命中词作为证据）。
2. **分类先验**：`preferredDepts` 给已有实质关键词命中的权责加权。部门先验、地点和泛化词单独出现时，无法触发权责命中。
3. **阈值门槛**：`score < 1.4` 视为未命中 → `complexity='unknown'`，提示人工确认归属（**不硬派单**）。
4. **复合工单判定**：第二项权责须有独立关键词且主责部门不同。无并列连接词时，第二项分数还须达到首项的 55%。
5. **会签判定**：会签规则带 `trigger` 触发词，命中才生成会签节点；会签部门与主办部门去重，避免「自己会签自己」。
6. **证据链**：沿 `duty` 入边/出边收集多跳证据（会签只保留本次触发的），供前端做「为什么这样派单」的解释。
7. **派单路径**：受理 → 派单（联合主办时列出全部权责）→ 会签（逐条）→ 处置 → 反馈归档，每步带时限。

### 4.3 诉求事件图谱 · 卡点归因

`rankBottlenecks(tickets)` 用历史工单给权责节点回填权重：

```
收缩超时率 = (超时单量 + 0.5) / (单量 + 2)      # 小样本收缩，避免「1 单 100% 超时」霸榜
卡点权重   = 收缩超时率 × 0.5 + 单量占比 × 0.3 + 高风险占比 × 0.2
```

每条结果同时给出原始 `overdueRate`（前端展示用）、`smoothedOverdueRate`（参与打分）与
`sampleAdequate`（`total >= 2`；`false` 表示样本量偏小，建议大屏置灰或标注「样本不足」）。

输出按权重排序的「权责事项 → 卡点 → 改进建议」，`attributionSummary()` 再给一句可朗读的归因结论，例如：

> 宿舍设施维修是当前最集中的流程卡点：4 单中有 3 单超时（超时率 75%），主要卡在「物资申领与备件等待」

建议：`对高频备件建立楼栋周转库存，先换后补`。若排名第一的事项样本量不足（`sampleAdequate: false`），
结论末尾会自动追加「（当前仅 N 单，样本量偏小，结论供参考）」，并单独放在 `sampleNote` 字段里。

---

## 五、风险筛查 Agent 设计（创新点 3）

### 5.1 文本情绪路（6 个维度）

| 维度 | 词量 | 权重 | 说明 |
| --- | --- | --- | --- |
| `crisis` 危机表达 | 25 | 4.0 | 风险词命中即置高风险 |
| `safety` 安全风险 | 34 | 3.0 | 漏电/消防/人身威胁一类，命中即置高风险 |
| `distress` 强烈痛苦 | 22 | 1.6 | 痛苦、无助、失眠等 |
| `conflict` 冲突与关系 | 20 | 1.3 | 冲突信号单独设「中风险下限」 |
| `anxiety` 焦虑与压力 | 9 | 0.9 | 催促、烦躁、等不了 |
| `positive` 情绪缓和 | 6 | -0.9 | 降温词，负向计分 |

叠加规则：程度副词强化（`非常/特别/极其/严重/一直/反复…` ×1.5）、弱化副词（`有点/稍微/一点…` ×0.6）、否定衰减（×0.35，**危机与安全维度不参与**，避免「我没有想不开」成为绕过检测的口子）、标点与叠字强度（`！？`、`啊啊啊` → 最多 +1.6）。

### 5.2 行为时序路（8 个特征）

`submits24h / submits72h / submits7d / nightSubmits / nightRatio / minIntervalMinutes / repeatCategory7d / overdueCount / priorHighRisk30d`

计分：24h ≥3 单 +2（=2 单 +1）、最短间隔 ≤30 分钟 +1.5（≤120 分钟 +0.8）、夜间高频 +1.2、同类 7 天反复 ≥3 次 +1、历史超时 ≥2 单 +0.8、30 天内出现过高风险 +1.5（行为分上限 6）。

### 5.3 融合与红线

- 融合分 = 情绪分 + 行为分；`≥7` 高风险，`≥3.2` 中风险（`RISK_HIGH_SCORE` / `RISK_MEDIUM_SCORE` 可调）。
- **红线 1**：命中危机或即时安全信号 → 直接高风险，不看分数。
- **红线 2**：本地规则已判定的风险不允许下调（不降级原则）。
- **红线 3**：冲突信号 → 至少中风险（有升级为舆情/人身安全事件的先例）。
- **红线 4**：行为异常但文本平静 → 至少中风险，提示主动跟进。
- 输出 `intervention`：分级干预（危机 15 分钟内电话直呼、安全 30 分钟内现场核查、困扰/冲突 24 小时内当面沟通、常规按 SLA），含通知部门、话术模板、跟进动作与资源号码。

> 模型只能补充「情绪解读 / 行为解读 / 干预话术」三个文本字段（`refineRiskScan`），**风险等级与分数完全由规则决定**，这是幻觉可控的关键设计。

---

## 六、知识库检索与阈值调优

### 6.1 检索管线

`normalize`（去标点小写） → **泛化词整词剔除**（`问题/情况/麻烦/希望/处理…`，避免「只写问题」凑分） → CJK 单字 + bigram 分词 → 同义词组扩展（12 组：校园卡、断电、漏水、断网、热水、报修、心理、证明、奖助、补办、延毕、宿舍） → 字段加权 BM25（`title`/`keywords` ×3、`summary` ×1.4、`steps` ×1.2、`answer` ×1，`k1=1.4`、`b=0.75`） → 关键词精确命中加分（长词更高）→ 分层。

### 6.2 置信分层与兜底规则

| 层级 | 条件 | 能否自助答复 |
| --- | --- | --- |
| `confident` | `score ≥ 4.5` **且**有强证据 | 满足「低风险 + 非紧急」才允许 |
| `probable` | `2.4 ≤ score < 4.5`，或触发任一兜底规则 | 否，引导提交工单 |
| `none` | `score < 2.4` | 否 |

四条兜底规则（把「看起来高分但不可信」的情况压回 `probable`）：

1. **歧义**：次优 / 最优 `≥ 0.85` → 降级；
2. **弱证据**：无关键词命中且与标题共享的多字词 < 2 → 降级（如「卡住」不应撞上「校园卡」）；
3. **短查询**：归一化后长度 < 4（如只写「宿舍」）→ 降级；
4. **高风险关门**：`risk != low` 或 `urgency ∈ {high, urgent}` → 直接关闭自助通道。

### 6.3 调优效果

| 查询 | 层级 | 分数 | 结果 |
| --- | --- | --- | --- |
| 校园卡丢了，补办需要带什么材料？ | `confident` | 20.8 | 允许自助 |
| 助学金材料要交到哪里，截止时间是什么时候？ | `confident` | 22.1 | 允许自助，且不越权承诺 |
| 宿舍 | `probable` | 4.9 | 短查询拦截，不来自助答案 |
| 就是有点问题，你们看着办吧 | `none` | 0 | 泛化词剔除后不再误命中 |

---

## 七、大模型调用链路稳定性

`server/ai/llmClient.js` 提供统一入口 `chatJson()`，**永不抛异常**，失败即返回 `{ ok:false, reason, degraded:true }`。

| 机制 | 实现 | 默认值 |
| --- | --- | --- |
| 超时 | `AbortController`，错误标记 `timeout` | `LLM_TIMEOUT_MS=9000` |
| 重试 | 指数退避 `120×2^n + jitter`，仅重试可重试错误（408/409/425/429/5xx 与网络错误） | `LLM_MAX_RETRIES=1` |
| 熔断 | 连续失败达阈值后打开，冷却后仅放行一次半开探测，成功后关闭 | `LLM_CIRCUIT_FAILURES=3`、`LLM_CIRCUIT_COOLDOWN_MS=60000` |
| 并发闸门 | 请求超过并发上限时排队，等待超过 `LLM_TIMEOUT_MS` 后回退规则 | `LLM_MAX_CONCURRENCY=4` |
| 缓存 | LRU + TTL，命中直接返回（`cached:true`） | `LLM_CACHE_TTL_MS=600000` |
| JSON 容错 | 剥离 Markdown 代码围栏后解析，模型返回值须为 JSON 对象，失败标记 `bad-json` | — |
| 故障注入 | `timeout` / `offline` / `bad-json` / `http-500` | 默认关闭 |
| 指标 | `calls/success/failure/degraded/retries/timeouts/avgLatencyMs/p95LatencyMs/reasonCounts` | `/api/ai/health` |

**降级策略（三层）**

1. **模型不可用**（无 Key / 超时 / 网络 / 5xx / 脏 JSON / 熔断打开）→ 用本地规则结论，业务字段完全一致，仅在 `trace.warnings` 与 `analysis.degradation` 留痕；
2. **模型输出越界**（分类不在白名单、部门不存在、试图下调风险）→ 护栏逐字段丢弃并记录 `rejected`；
3. **答复不可追溯**（电话/金额/时限来源里找不到、过度承诺、注入残留）→ 整段回退知识库原文。

> 验收口径：**降级是正常状态，不是故障**。`engine='local-rules'` 时系统功能完整可用，这是能在断网教室环境下完成答辩演示的前提。

---

## 八、幻觉护栏

| 防线 | 规则 | 落地 |
| --- | --- | --- |
| 字段白名单 | `category` / `risk` / `urgency` / 部门 id 越界即丢弃 | `guardAnalysis()` |
| 不降级原则 | `risk` / `urgency` 只允许持平或提升 | `guardAnalysis()` |
| 硬事实可追溯 | 电话、金额、时限必须出现在来源材料（公益号码 110/119/120/122/12355/12356 例外） | `guardAnswerText()` + `extractFacts()` |
| 过度承诺与注入 | 「保证/一定能/100%…」、`system:`/`忽略以上` 一类残留一律回退 | `guardAnswerText()` |
| 二次复核（可选） | 模型自评 `grounded=false` 则回退知识库原文 | `groundedReview()`，不可用时视为通过 |

---

## 九、配置项（环境变量）

| 变量 | 默认 | 含义与调优建议 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 空 | 未配置则全链路走本地规则（仍完整可用） |
| `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL` | 见 `.env.example` | 模型与网关 |
| `LLM_TIMEOUT_MS` | `9000` | 现场网络差可降到 5000，SLA 更稳 |
| `LLM_MAX_RETRIES` | `1` | 与超时相乘决定最坏耗时，演示环境建议 1 |
| `LLM_CIRCUIT_FAILURES` | `3` | 连续失败阈值，越小越快进入降级 |
| `LLM_CIRCUIT_COOLDOWN_MS` | `60000` | 冷却时长；演示可调到 5000 便于观察恢复 |
| `LLM_MAX_CONCURRENCY` | `4` | 批量预检时保护上游 |
| `LLM_CACHE_TTL_MS` | `600000` | 相同诉求重复预检直接命中缓存 |
| `KB_MIN_SCORE` | `2.4` | 低于此分视为未命中 |
| `KB_CONFIDENT_SCORE` | `4.5` | 高置信阈值；**调高可提升准确率、降低自助覆盖率** |
| `KB_AMBIGUITY_RATIO` | `0.85` | 歧义判定比值，越小越保守 |
| `RISK_HIGH_SCORE` | `7` | 高风险融合分阈值 |
| `RISK_MEDIUM_SCORE` | `3.2` | 中风险融合分阈值 |

---

## 十、验收对照表

| 交付标准 | 实现 | 验证方式 | 通过标准 |
| --- | --- | --- | --- |
| AI 服务稳定 | 超时、重试、熔断、并发、缓存与规则降级 | `node scripts/ai/drill-degrade.mjs` | 47/47 通过，四种注入故障的业务结论与规则基线一致 |
| 幻觉可控 | 模型输出护栏 | `drill-degrade.mjs` 步骤 4 与 `eval-b.mjs` 护栏用例 | 16 项护栏演练和 3 项回归用例通过 |
| GraphRAG 检索匹配演示样例 | 权责流程图谱、子图检索与事件图谱 | `node scripts/ai/demo-graphrag.mjs` | 10 条样例覆盖权责、会签、复合判定、派单路径和证据链 |
| 风险预警 Demo，可稳定触发风险标签 | 情绪与行为融合 | `node scripts/ai/demo-risk.mjs --repeat 5` | 11 条样例标签与预期一致，每条复跑 5 次 |
| 认知链路正确性回归 | 23 条链路用例与 3 条护栏用例 | `node scripts/ai/eval-b.mjs` | 26/26 通过，退出码 0 |
| 不影响既有业务 | 预检契约只增不改、工单状态机不动 | `node scripts/e2e/api.mjs` | 全链路用例通过 |

---

## 十一、跨成员约定

### 给 A（后端与架构）

- `POST /api/ai/precheck` 兼容原有请求体，支持可选 `urgency`。传 `useLlm:false` 可强制走规则链路。
- Agent 编排请走 `POST /api/ai/agents/:name` 或直接 `import { invokeAgent } from './ai/agents.js'`，**不要**在 `index.js` 里重新实现链路。
- `server/ai.js` 的 `analyzeRequest` / `precheckRequest` 对外行为保持兼容；`searchKnowledge` 仍是原签名（内部改为调用新检索）。
- 演练接口 `/api/ai/llm/fault`、`/api/ai/llm/reset` 仅限辅导员角色，**上线前建议加环境开关**。

### 给 C（辅导员端与可视化）

- 图谱可视化直接用 `GET /api/ai/graph?full=1` 的 `nodes` / `edges`；`type` 可作为节点分组，`weight` 可作为连线粗细。
- 风险预警卡片建议用 `risk.levelLabel` + `risk.reasons` + `risk.intervention.tone`（`coral`/`amber`/`mint` 对应高/中/低配色）。
- 「为什么这样派单」用 `graph.evidence[].label` 逐跳展示，`graph.dispatchPath[]` 直接渲染流程条。
- 复盘归因页面用 `POST /api/ai/attribution` 的 `headline` / `top[]` / `suggestion`；`top[].sampleAdequate === false` 表示该事项单量 < 2，建议置灰或标注「样本不足」，`sampleNote` 是配套文案。

### 给 D（测试与交付）

- `graph.riskScan.behaviorFeatures` 与 `knowledge.matchTier` 可作为特征列，做离线评估或时序预测实验。
- 回归命令：`smoke-b` → `eval-b` → `demo-graphrag` → `demo-risk` → `drill-degrade`（均可离线运行，退出码即结论）。
- 阈值调参请改环境变量后重跑 `eval-b.mjs` 与 `drill-degrade.mjs`，不要直接改词表权重。

---

## 十二、已知限制与后续计划

| 限制 | 现状 | 计划 |
| --- | --- | --- |
| 图谱为手工维护的静态知识 | 23 项权责 / 19 条会签规则，来源为校内办事流程梳理 | 支持从工单历史自动挖掘新权责与卡点（当前已产出卡点权重） |
| 行为特征依赖工单历史量 | 冷启动阶段样本少，权重偏保守 | 累积数据后用 D 侧模型替换规则权重 |
| 情绪词典为规则词表 | 覆盖 96 个词，方言与新词可能漏检 | 引入向量相似度召回候选新词，人工确认后入库 |
| 故障注入为进程级开关 | 适合单人演示 | 生产环境改为不可用（环境变量网关） |
| 自助答复仅覆盖 8 条知识库条目 | 覆盖率有限 | 扩充知识库并复用同一阈值框架，无需改代码 |
