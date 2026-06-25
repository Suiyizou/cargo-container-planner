# Deployment

当前项目以客户端软件为主，服务器只承担静态页面或安装包分发职责。

## Web 静态部署

```bash
docker compose up -d --build
```

只有 `frontend` 容器，监听 80 端口。没有 Java 后端、MySQL 或 Redis。

访问：

```text
http://your-server-ip/
```

装箱计算在用户浏览器的 WebWorker 中完成，不消耗服务器 CPU。

## Windows 客户端打包

在 Windows 开发机执行：

```bash
cd frontend
npm install
npm run desktop:build
```

国内网络可先设置镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run desktop:build
```

安装包输出目录：

```text
frontend/release/
```

预览桌面客户端：

```bash
npm run desktop:preview
```

## 运行模式

- 网页版：Vue + WebWorker + Three.js。
- 桌面版：Electron + 同一套 Vue + WebWorker + Three.js。
- 数据：保存在本机浏览器/客户端 localStorage。
- 服务器：不参与计算，不需要数据库。
