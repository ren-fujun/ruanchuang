# 团队资料知识库

将来自学校官网、学院官网或正式通知的资料放在本目录，再执行：

```bash
npm run knowledge:import
```

导入成功后会生成 `server/b/imported-knowledge.json`。该文件会在后端启动时作为“已发布的基础知识”载入，学生咨询可以检索并引用资料来源。

## 添加一份资料

1. 新建 UTF-8 编码的 `.txt` 或 `.md` 正文文件，例如 `leave-policy.md`；保留原文件链接，不要只填写二手转述。
2. 在 `catalog.json` 增加一项，填写标题、学校官网 HTTPS 链接、责任部门、关键词和有效期。
3. 本地执行 `npm run knowledge:import`。若命令失败，先修复错误再提交；旧的导入结果不会被覆盖。
4. 一起提交正文文件、`catalog.json` 与生成的 `imported-knowledge.json`，部署后重启后端。

当前基础框架有意只支持 `.txt` / `.md`：这样正文可审阅、可追溯、导入结果稳定。PDF/Word 自动解析将在确认学校文件格式和依赖方案后单独接入。

不要提交学生隐私、账号密码、内部通讯录或未经核实的材料。
