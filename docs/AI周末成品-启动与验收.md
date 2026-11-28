# AI 周末成品：启动与验收

本轮提供实际的向量接口、Qdrant存储、同语料BM25混合检索、多轮咨询、逐条引用、预约草稿和辅导员摘要。缺配置时只显示资料不足或明确降级；没有硬编码向量、模拟成功开关或虚构真实模型成绩。

## 1. 当前事实与外部前置条件

- 当前有生成模型配置；新增百炼账号尚未开通，`EMBEDDING_API_KEY` 未配置。
- 本机未检测到Docker命令，Qdrant未启动；真实向量入库和真实三组评测尚未运行。
- 综测仅核查了2024细则“组织与程序”一节，整理自仓库现有正文。官方原文：<https://cse.csu.edu.cn/info/1040/9697.htm>；2026通知列出该2024版为附件：<https://cse.csu.edu.cn/info/1040/11465.htm>。
- 未给资料编造失效日期。整份细则与就业参考仍待核查，未发布到新索引。仅有栏目链接不能证明团队整理的就业内容。
- 当前演示学生属于“信息工程学院”，资料限定“计算机学院”。不应为了得到答案放开过滤；使用真实匹配的试用账号，或在**隔离测试数据**中建立标明虚构的计算机学院账号。
- 不能把未核实资料、合成测试、浏览器接口替身当作真实学生使用效果。

## 2. 配置与启动

安装并启动Docker Desktop；项目根目录运行以下命令。Windows采用命名卷保存向量，不把数据库文件提交到Git。

```powershell
docker compose -f compose.rag.yaml up -d
```

在现有`.env`中增加下列内容，保留原来的DeepSeek配置。百炼密钥不是DeepSeek密钥。地址按百炼工作空间所属地域填写；示例是兼容模式地址，不保证适用每个账号。

```dotenv
EMBEDDING_API_KEY=在本机填写
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4
QDRANT_URL=http://127.0.0.1:6333
RAG_BUDGET_CNY=50
RAG_MAX_GENERATION_CALLS=400
RAG_IMPORT_MAX_CHUNKS=500
RAG_GENERATION_INPUT_CNY_PER_MILLION=
RAG_GENERATION_OUTPUT_CNY_PER_MILLION=
```

```powershell
node scripts/ai/rag-check.mjs --live
node scripts/ai/import-rag.mjs --check
node scripts/ai/import-rag.mjs
node scripts/ai/rag-check.mjs
node server/index.js
```

第一次检查因尚未入库返回非就绪是预期行为；先确认模型向量检查通过、Qdrant可达，再导入。检查脚本不会输出密钥。仅`--live`会执行一个小型真实向量调用。

学生/辅导员页面继续使用原启动方式，访问学生“AI咨询”。页面回答中的引用可展开和打开原文；新会话最多12轮。

网络需要本机代理时，沿用已经验证的代理环境配置；不要提交代理账号、令牌或密钥。若生成模型或向量服务不可达，先查配置，不使用模拟服务录制成真实成果。

## 3. 资料发布和检索行为

编辑`server/knowledge-source/rag-catalog.json`：每份资料必须有实质正文、明确来源、适用学校/学院/年级、`kind`、`reviewedAt`和`reviewed:true`。`policy`代表政策条款，`reference`代表参考材料；不把就业建议描述成审批依据。

只导入审核通过条目。按段落切分，目标650字符、保留80字符上下文；同范围相同片段去重。内容、标题、向量模型和服务地址参与缓存标识。模型或地址变化要求重建，避免混用向量空间。

每次导入建新集合，写入全部成功后原子发布本地索引快照。失败保留原索引。旧集合保留便于排错，持续导入后可由维护者核对快照并清理不再引用的集合。索引和向量缓存位于忽略提交的`server/data/rag`；需要同时备份该目录和Docker卷。

检索先按账号范围与资料有效日期筛选，再执行向量和BM25各前20，RRF融合取6。生成回答仅可引用这些片段；硬事实护栏拒绝来源不存在的电话、金额、时长与过度承诺。**引用存在不等于语义一定正确**，引用支持关系仍须人工评测。

向量服务故障时使用关键词降级并显式标注。资料不足时说明不足、追问或转人工。危急信号先走本地保护，不向云模型发送该条咨询，不生成普通预约草稿。

## 4. 接口和预约衔接

所有接口使用原Bearer登录，咨询限学生本人。

| 接口 | 输入/输出 |
|---|---|
| `POST /api/ai/consult` | `{text,sessionId?}` → `{sessionId,answer,citations,clarification,actionDraft,engine,traceId,telemetry}` |
| `GET /api/ai/consult/:id` | 本人会话 `{id,userId,scope,turns,...}` |
| `POST /api/ai/consult/:id/appointment-draft` | → `{item:{topic,minutes,summary,materials,questions}}` |
| `POST /api/ai/consult/:id/feedback` | `{helpful:boolean,reason?:string}` |

每条引用保留片段编号、原文、文档编号、版本、范围和来源。问题与证据作为数据进入模型提示，不执行资料中的指令。

现有预约创建接口接受可选`consultationSessionId`、`consultationSummary`；只允许关联自己的非紧急会话，草稿不会自动创建预约。学生可以编辑主题和给老师的诉求摘要，后端保存学生确认的文本、服务器侧引用和待确认问题；不接受客户端自行指定政策引用。辅导员通过原预约关系权限查看摘要，无权读取其他学生会话。摘要草稿只是模型整理，不能视作学生事实已经核实。

会话、反馈、生成调用记录使用现有JSON存储，沿用原保存机制；单进程试用版本不承诺多实例事务一致性。浏览器恢复失败会清掉过期会话标识，不自动删除后端记录。

## 5. 验证、评测和费用边界

```powershell
node --test server/ai/consult.test.js server/ai/rag/rag.test.js
node --test server/*.test.js server/b/appointment-advice.test.js
node scripts/e2e/rag-ui.mjs
node scripts/e2e/appointment-sprint.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node scripts/ai/eval-rag.mjs
```

新增单元测试使用明确注入的模拟模型/向量传输；包含真实本机HTTP权限和预约关联测试。浏览器测试使用真实页面、登录与预约API，但咨询响应被明确替换成合成测试响应，仅验证界面契约，不验证AI质量。截图在`.tmp/rag-ui/`。

评测题固定60道合成题：开发20道、测试40道，人工标注状态为待复核。就业尚未审核时相应预期为资料不足；后续补语料时应先在独立版本更新预期并记录原因，不能运行后迎合模型改答案。

完成真实服务配置与入库后执行：

```powershell
node scripts/ai/eval-rag.mjs --live --split test --limit 40
```

三组为同语料关键词抽取基线、直接大模型、真实混合检索增强。该关键词组是受控消融实验，**不是旧B接口**。输出原始回答、引用、生成Token、检索用量、耗时和待人工核对字段。自动结构检查不换算成答案准确率；最终需人工核对正确性、引用支持、适用性和应否拒答。报告在`.tmp/rag-eval/`，不会自动提交。

费用单价空缺时只记录用量，不虚报费用。50元为按配置单价累计估算的停止线，不是供应商账单硬限额；当前独立向量服务和失败重试用量不保证完整计费。生成调用还有400次总量上限、每次1200输出Token上限，导入限制500片段。供应商后台另设预算/额度限制，真实评测先少量运行核价；缓存命中与未命中差异、失败调用费用需按账单复核。

## 6. 比赛前剩余事项

1. 配好百炼和本地Qdrant，完成真实入库、重启验证和少量真实问答。
2. 核查更多综测条款、就业材料及对应来源，明确适用账号。
3. 人工复核固定题和真实模型结果，完成3～5名学生试用与辅导员核对。
4. 以“口语提问→引用→预约草稿→老师摘要”为主演示，另演示无依据处理；再录90秒成片。

没有配置向量服务前，本轮应称为“实现和本地验证完成，真实向量服务联调待完成”，不能称为已验证的完整AI成品。
