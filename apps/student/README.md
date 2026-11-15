# 学生端

独立入口：npm run dev:student，端口 5191。独立构建：npm run build:student，产物 dist-portals/student。

复用 src 下已验收页面和登录守卫。开发时另外启动 npm run dev:api。当前共享旧双角色路由，单端专属登录页由下一阶段拆分；端口隔离不是权限控制。
