# 货代装箱体积规划系统

这是一个面向货代装箱估算、箱型选择和可视化剖析的系统。当前版本仍然保留浏览器端 WebWorker 本地装箱计算，同时新增了 Spring Boot + MySQL 后端，用于公司员工账号、设备登录限制和总管理员后台。

## 当前架构

- 前端：Vue 3 + Vite
- 3D 可视化：Three.js
- 装箱计算：WebWorker 本地计算
- 桌面打包：Electron
- 后端：Spring Boot 3 + JDBC
- 智能导入：后台可控制 LLM 开关、API Key、Base URL 和模型，未配置 Key 时使用规则兜底
- 数据库：MySQL 8
- 部署：Docker Compose，Nginx 代理 `/api` 到后端

## 已有能力

- 录入货物长、宽、高、数量、单重、摆放规则和颜色。
- 按箱型本地计算，生成推荐箱型排序。
- 使用 Three.js 展示当前货舱 3D 摆放结果，可拖动、缩放查看。
- 支持剩余空间、质量重心偏载可视化和导出报告。
- 提供 CSV 导入导出、Excel 样板说明、示例数据、清空货物和算法说明页面。
- 新增管理后台：总管理员登录、员工账号管理、在线设备/IP 查看、设备踢下线、基础运行监控。
- 同一账号默认限制最多 5 台在线设备。
- 智能导入支持两条路径：本地规则预览，以及后端文本识别任务；管理员启用 LLM 后可由模型抽取非标准文本。

## 统一工作台入口

登录成功后默认进入 `/workbenches`，用户可以选择装箱规划或货物追踪工作台。装箱规划继续使用站内 `/planner` 路由；货物追踪默认跳转到网关代理路径 `/tracking/`，两套业务服务保持独立运行。

如网关使用了其他追踪路径，可在构建前端时设置：

```env
VITE_TRACKING_WORKBENCH_URL=/tracking/
```

进入装箱规划后，可通过左侧“切换工作台”返回统一入口。

## 后端与数据库

建表脚本：

```text
backend/sql/schema.sql
```

默认总管理员：

```text
账号：admin
密码：Admin@123456
```

首次生产登录后请立即修改默认密码。浏览器 Web 端无法可靠读取真实 MAC 地址，因此当前版本记录的是设备指纹、IP、浏览器 UA，并预留 `mac_address` 字段给后续桌面客户端或内网 Agent 上报。

## LLM 文本识别

默认启用 LLM 开关，默认模型为 `deepseek-v4-flash`，默认 Base URL 为 `https://api.deepseek.com`。如果管理员尚未配置 API Key，文本识别会自动使用规则兜底，不影响系统使用。

管理员登录后台后，可在“系统管理”中修改：

```text
是否启用 LLM
API Key
Base URL
模型名称
```

也可以用 `.env` 作为首次启动的默认种子值：

```env
SPRING_AI_CHAT_MODEL=none
SPRING_AI_OPENAI_API_KEY=你的_API_Key
SPRING_AI_OPENAI_BASE_URL=https://api.deepseek.com
SPRING_AI_OPENAI_MODEL=deepseek-v4-flash
```

说明：`SPRING_AI_CHAT_MODEL=none` 用于避免后端启动阶段强制创建模型 Bean；文本识别任务会按后台数据库配置动态创建 OpenAI-compatible HTTP 调用。

对应接口：

```text
POST /api/text-recognition/tasks
GET  /api/text-recognition/tasks/{id}
GET  /api/text-recognition/tasks/{id}/cleaned-excel
```

## 本地前端开发

```bash
cd frontend
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:5177
```

如果要在 Vite 开发环境访问管理后台，请先启动后端：

```bash
cd backend
mvn spring-boot:run
```

默认后端地址：

```text
http://127.0.0.1:8080/api
```

## 构建前端

```bash
cd frontend
npm run build
```

输出目录：

```text
frontend/dist/
```

## 构建后端

```bash
cd backend
mvn -DskipTests package
```

输出文件：

```text
backend/target/cargo-planner-backend-0.1.0.jar
```

## Docker 部署

```bash
docker compose up -d --build
```

默认端口：

```text
前端：http://服务器IP/
后端：http://服务器IP:8080/
MySQL：服务器IP:3306
```

可复制 `.env.example` 为 `.env` 后修改数据库密码、端口和设备登录上限。

## Windows 客户端打包

```bash
cd frontend
npm run desktop:build
```

如果 Electron 下载较慢，可以在 PowerShell 中设置镜像后再执行：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run desktop:build
```

输出目录：

```text
frontend/release/
```

## Workspace upload storage

Authenticated Excel/CSV uploads are retained for 14 days by default. Files are stored below a
per-user directory named from the account display name plus the immutable user id; database rows
hold metadata only. Re-uploading the same content under the same name refreshes its expiry without
creating another copy, while changed content receives the next version number.

Docker Compose mounts the named volume `workspace-files` at `/app/uploads`, so uploads survive
backend container rebuilds. The relevant environment variables are:

```env
APP_WORKSPACE_FILE_RETENTION=14d
APP_WORKSPACE_FILE_CLEANUP_INTERVAL_MS=3600000
APP_WORKSPACE_FILE_MAX_SIZE_BYTES=83886080
```

When the backend runs outside Docker, set `APP_WORKSPACE_FILE_ROOT` to an absolute writable path;
otherwise it uses `./uploads`. Expired files are removed by an hourly scheduled cleanup.

User APIs are rooted at `/api/workspace-files`. Administrators can list and inspect all users'
uploads through `/api/admin/workspace-files`. Existing databases must apply the
`cp_workspace_files` statement from `backend/sql/schema.sql` once during upgrade.
