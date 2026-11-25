---
name: zhixing-ai-eval
description: Evaluate the Zhixingqiao student consultation assistant against fixed expected cases, separating rule, mock API, and real model evidence. Use when auditing changes to consultation classification, guidance, safety, or handoff.
---

# 知行桥 AI 评测

用于回归咨询助手的意图分类、办理入口、多轮话题切换、证据不足、转人工、紧急处置与时限表达。

- 先确认用户指定仓库，阅读其中 `server/b/routes.js`、`server/b/policy.js` 和 `scripts/ai/eval-b.mjs`，以实际代码确认能力边界；不得把未实现能力写成支持，也不得为迎合实现修改固定预期。
- 从仓库目录执行本技能的 `scripts/evaluate.mjs --mode api --repo <仓库绝对路径>`。它创建临时数据文件、虚构账号和3条明确标注的测试知识，启动隔离后端，逐例请求真实本机 `/api/b/assistant`；关闭外部模型，退出时停止服务并清理本次临时数据。报告保存到仓库 `.tmp/skill-eval-*/`。
- 用 `--mode rules` 单独运行既有规则套件。规则结果与36条咨询接口案例分开统计；本机真实API不应称作mock大模型。若环境阻止启动服务，按工具权限流程运行或报告具体错误，不将未执行项记为通过。
- `--mode mock`、`--mode real` 当前只输出未运行说明；没有模拟模型或真实模型适配器，不会调用外部模型。需增加相应适配器并获得授权后，才能验证云模型质量和超时行为。
- 所有未执行的层级标为“未运行”；不能用规则结果代表模型结果。记录失败与产品缺口，避免改写预期或弱化现有测试。
- 输出分层汇总、逐例失败、未运行项和复现命令；不要记录密钥、令牌或个人信息。自动断言仅检查返回状态、动作、入口及引用等可观察字段；`needs_review` 必须由人结合原始预期复核，不算通过。不要把这36条样例换算成线上准确率。

固定人工预期在 `scripts/cases.json`；执行器和报告格式在 `scripts/evaluate.mjs`。
