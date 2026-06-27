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

## 前端路由刷新

前端使用 Vue Router history 模式，线上 Nginx 必须把非 `/api`、非静态资源的路径回退到 `index.html`。否则直接刷新 `/planner/results`、`/smart-import`、`/admin` 等地址会由 Nginx 当作真实文件路径处理，从而出现 404/405。

`docker/nginx.conf` 已包含必要配置：

```nginx
location / {
  add_header Cache-Control "no-cache";
  try_files $uri $uri/ /index.html;
  error_page 404 /index.html;
}
```

如果服务器没有走 Docker 内置 Nginx，需把同等配置同步到线上站点配置后执行 `nginx -t && nginx -s reload`。

## LLM 文本识别

智能导入里的“交给 Agent 识别”由后台“系统管理”控制，默认启用 LLM，默认模型为 `deepseekv4-flash`。如果尚未配置 API Key，会自动使用规则兜底。

推荐操作：

```text
管理员登录后台 -> 系统管理 -> 智能识别模型配置 -> 填写 API Key -> 保存
```

`.env` 可作为首次启动的默认种子值：

```env
SPRING_AI_CHAT_MODEL=none
SPRING_AI_OPENAI_API_KEY=你的_API_Key
SPRING_AI_OPENAI_BASE_URL=https://api.deepseek.com
SPRING_AI_OPENAI_MODEL=deepseekv4-flash
```

说明：后台保存后的配置存入 MySQL，修改 LLM 开关、API Key、Base URL、模型名后不需要重新打包。更新镜像或配置后可重启后端：

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
