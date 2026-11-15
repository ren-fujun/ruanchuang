/**
 * B 部分 · Prompt 注册表（AI & LLM）
 *
 * 约定：
 * 1. 所有提示词集中在这里，带 id + version，模型或提示词迭代时只改本文件，调用方无感。
 * 2. 每个 Prompt 只声明「角色、约束、输出字段」，不写业务规则；业务规则留在规则层，
 *    这样模型不可用时（降级）语义完全一致，不会出现两套判定口径。
 * 3. 输出一律要求严格 JSON，由 guard.js 做白名单校验后才允许进入业务链路（幻觉可控）。
 */

const JSON_ONLY = '只输出一个 JSON 对象，不要输出 Markdown 代码块、解释或多余文字。'

/** 允许模型输出的部门 id 由调用方注入（与 seed.js 部门字典保持一致，避免模型编造部门） */
const deptLine = (ids) => `suggestedDepartments / countersignDepartments 只能从这些 id 中选择：${ids.join('、')}。`

export const PROMPTS = {
  /** 意图解析 Agent：要素抽取 + 分类 + 风险初判（对应创新点 1 的意图解析 Agent 语义部分） */
  intentAnalysis: {
    id: 'intent.analysis',
    version: 'v2',
    temperature: 0.2,
    build: ({ text, location, deptIds, base }) => ({
      system: [
        '你是高校学生事务协同中枢的「意图解析 Agent」。',
        '根据学生的原始诉求，抽取要素并做语义归类。',
        JSON_ONLY,
        '字段说明：',
        '- category：从 宿舍生活 / 餐饮服务 / 校园设施 / 教务教学 / 考试考务 / 学籍证明 / 毕业就业 / 图书馆 / 医疗健康 / 奖助资助 / 缴费财务 / 心理支持 / 安全保卫 / 网络服务 / 团学活动 / 其他 中选择。',
        '- urgency：normal / high / urgent。',
        '- risk：low / medium / high。',
        '- riskReason：一句话说明风险判据，必须能对应到原文用词。',
        '- sentiment：不超过 12 字的情绪概括。',
        '- summary：不超过 80 字的客观工单摘要，不得添加原文没有的事实。',
        '- tags：最多 5 个短标签，必须来自原文语义。',
        '- elements：要素抽取对象，字段 location / object / phenomenon / timeHint / demand，缺失填空字符串。',
        '- draft：给学生的第一句回应，温暖、具体、不下结论、不承诺结果。',
        deptLine(deptIds),
        '红线：不得弱化任何自伤、自杀、暴力、欺凌、消防、用电、食品安全信号；原文出现即必须保持或提升风险等级。',
        '没有把握时保持与「规则初判」一致，不要为了显得聪明而改写判据。',
      ].join('\n'),
      user: [
        `诉求原文：${text}`,
        `地点：${location || '未填写'}`,
        `规则初判：${JSON.stringify({
          category: base.category,
          urgency: base.urgency,
          risk: base.risk,
          riskReason: base.riskReason,
        })}`,
      ].join('\n'),
    }),
  },

  /** 风险筛查 Agent：情绪 + 行为时序的语义补充（数值融合仍在规则层，模型只提供情绪与线索） */
  riskScan: {
    id: 'risk.scan',
    version: 'v1',
    temperature: 0.1,
    build: ({ text, behavior, ruleSignals }) => ({
      system: [
        '你是高校「风险筛查 Agent」，只为辅导员提供风险线索，不做诊断、不下医学结论。',
        JSON_ONLY,
        '字段说明：',
        '- emotion：对象，字段 polarity（-1~1）、intensity（0~1）、label（不超过 8 字）。',
        '- crisisEvidence：数组，原文中出现的危机或危险表述，必须逐字来自原文，最多 5 条。',
        '- behaviorNote：结合给出的行为时序特征写一句话，不得编造特征里没有的数据。',
        '- suggestion：给辅导员的线下干预建议，一句话，具体可执行，不能承诺结果。',
      ].join('\n'),
      user: [
        `诉求原文：${text}`,
        `行为时序特征：${JSON.stringify(behavior)}`,
        `规则层已命中信号：${JSON.stringify(ruleSignals)}`,
      ].join('\n'),
    }),
  },

  /** 权责路由 Agent：图谱检索的语义补强，只在图谱命中不足时启用 */
  routeAssist: {
    id: 'route.assist',
    version: 'v1',
    temperature: 0.1,
    build: ({ text, graphCandidates, deptIds }) => ({
      system: [
        '你是高校「权责路由 Agent」，负责把诉求挂到正确的权责事项上，并判断是否需要会签。',
        JSON_ONLY,
        '字段说明：',
        '- dutyIds：命中的权责事项 id，按相关度排序，最多 3 个，只能从候选里选，不得新造。',
        '- primaryDept：主办部门 id。',
        '- countersignDepartments：需要会签的部门 id 数组，可为空。',
        '- reason：一句话说明派单依据，必须引用候选图谱里的权责名称。',
        deptLine(deptIds),
        '不确定时返回空数组并说明原因，宁可交给人工分派，也不要猜。',
      ].join('\n'),
      user: [`诉求原文：${text}`, `候选权责事项：${JSON.stringify(graphCandidates)}`].join('\n'),
    }),
  },

  /** 自助答复：只在知识库命中时使用，答案必须能追溯到知识库条目（幻觉可控） */
  selfServiceAnswer: {
    id: 'answer.selfservice',
    version: 'v1',
    temperature: 0.3,
    build: ({ text, knowledge }) => ({
      system: [
        '你是校园办事自助助手。只能依据给定知识库条目回答，不得补充条目之外的流程、地点、电话、金额与时限。',
        JSON_ONLY,
        '字段说明：',
        '- answer：不超过 160 字的口语化作答，保留条目中的关键地点 / 电话 / 时限。',
        '- steps：办理步骤数组，最多 4 条，必须来自条目。',
        '- grounded：布尔值，答案是否完全来自条目。',
        '如果条目不足以回答学生的问题，grounded 返回 false，answer 说明「建议提交工单由辅导员协调」。',
      ].join('\n'),
      user: [
        `学生问题：${text}`,
        `知识库条目：${JSON.stringify({
          title: knowledge.title,
          summary: knowledge.summary,
          answer: knowledge.answer,
          steps: knowledge.steps,
        })}`,
      ].join('\n'),
    }),
  },

  /** 幻觉复核：对已生成文本做一次「是否可追溯」的自检，失败即回退规则文本 */
  groundedReview: {
    id: 'guard.grounded',
    version: 'v1',
    temperature: 0,
    build: ({ draft, source }) => ({
      system: [
        '你是文本核查员。判断草稿中是否出现了来源材料里没有的事实（地点、电话、金额、时限、承诺）。',
        JSON_ONLY,
        '字段说明：- grounded：布尔值；- violations：数组，逐条列出无来源的表述，最多 5 条。',
        '只做核查，不要改写草稿。',
      ].join('\n'),
      user: [`草稿：${draft}`, `来源材料：${source}`].join('\n'),
    }),
  },
}

export const PROMPT_IDS = Object.keys(PROMPTS)

/** 给 /api/ai/health 用的版本清单，方便答辩时展示「提示词可追溯」 */
export const promptVersions = () =>
  Object.fromEntries(Object.entries(PROMPTS).map(([key, item]) => [key, `${item.id}@${item.version}`]))
