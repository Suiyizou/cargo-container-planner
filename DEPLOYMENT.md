# Deployment

当前项目采用前后端分离部署：

- `frontend`：Nginx 静态前端，代理 `/api` 到后端。
- `backend`：Spring Boot 管理账号、设备登录、监控接口。
- `mysql`：保存用户、设备、登录事件和管理员审计日志。

## Docker 部署

```bash
docker compose up -d --build
```

首次启动 MySQL 时会自动执行：

```text
backend/sql/schema.sql
```

默认总管理员：

```text
账号：admin
密码：Admin@123456
```

生产环境请先复制 `.env.example` 为 `.env`，修改数据库密码和端口后再启动。

## Spring AI 文本识别

智能导入里的“交给 Agent 识别”默认先使用规则兜底，服务端不需要 API Key 也能启动。后续拿到 Key 后，在 `.env` 中启用：

```env
TEXT_RECOGNITION_SPRING_AI_ENABLED=true
SPRING_AI_CHAT_MODEL=openai
SPRING_AI_OPENAI_API_KEY=你的_API_Key
SPRING_AI_OPENAI_BASE_URL=https://api.deepseek.com
SPRING_AI_OPENAI_MODEL=deepseekv4-flash
```

更新后重启后端或重新执行：

```bash
docker compose up -d --build backend
```

## 本地开发

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
mvn spring-boot:run
```

MySQL 可以使用本机服务，也可以只启动 compose 里的数据库：

```bash
docker compose up -d mysql
```

## 运行模式

- 装箱计算仍在用户浏览器的 WebWorker 中完成，不消耗服务器 CPU。
- 后端主要承载账号、登录设备限制、管理员后台和监控数据。
- Web 端无法直接读取真实 MAC 地址；当前记录设备指纹、IP、UA，并预留 MAC 字段。
