# 货代装箱体积规划系统

这是一个面向货代装箱估算、箱型选择和可视化剖析的系统。当前版本仍然保留浏览器端 WebWorker 本地装箱计算，同时新增了 Spring Boot + MySQL 后端，用于公司员工账号、设备登录限制和总管理员后台。

## 当前架构

- 前端：Vue 3 + Vite
- 3D 可视化：Three.js
- 装箱计算：WebWorker 本地计算
- 桌面打包：Electron
- 后端：Spring Boot 3 + JDBC
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
