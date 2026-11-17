# 导师端（B业务已接通）

运行 `npm run demo:b` 启动隔离API、导师端和学生端。导师页面 http://127.0.0.1:5195 ，完整说明见 [B五端交付](../../docs/B五端交付.md)。

生产业务模式仍可用 `npm run dev:mentor`，默认代理8787，设置 PORTAL_API_URL 可调整。独立构建 `npm run build:mentor`。任务权限由后端校验，不以本地端口作为权限边界。
