# 货代装箱体积规划系统

这是一个以 Windows 客户端打包为优先目标的装箱计算系统。

- UI：Vue 3 + Vite
- 3D：Three.js
- 计算：WebWorker 本机计算
- 桌面打包：Electron
- 存储：localStorage 本地保存
- 服务器：只用于静态页面或安装包分发，不再需要 Java 后端、MySQL、Redis

## 为什么这样设计

装箱计算属于 CPU 密集型任务。几十个 B 端用户同时使用时，如果都压到 2 核 2G 服务器上，体验会不稳定。

现在的方案把计算迁移到用户本机：

- 浏览器版用用户电脑的 WebWorker 计算。
- 桌面版用同一套 Vue 页面和 WebWorker 计算。
- 服务器只发页面或安装包，压力很小。
- 不需要用户登录模块，也不需要公司服务器维护数据库。

## 当前能力

- 录入货物长、宽、高、数量、单重、摆放规则和颜色。
- 按箱型本机计算，生成推荐箱型排序。
- 支持 20GP、20HQ、40GP、40HQ、45HQ、冷藏柜等默认箱型，也支持添加自定义箱型。
- 主视图使用 Three.js 展示当前货舱 3D 摆放结果，可拖动、缩放查看。
- 图例可点击隐藏/显示某类货物，方便观察内部堆放。
- 三视图使用 Canvas 展示俯视、正视、侧视，并标注箱体长宽高。
- 当一个箱型需要多个货舱时，可切换第 1 箱、第 2 箱等视图，并带等待动画。
- 提供 CSV 导入、导出、示例数据、清空货物和算法说明页面。

## 本地开发

```bash
cd frontend
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:5177
```

## 构建网页版本

```bash
cd frontend
npm run build
```

输出目录：

```text
frontend/dist/
```

## 打包 Windows 客户端

```bash
cd frontend
npm run desktop:build
```

如果 Electron 下载较慢，可以在 PowerShell 中使用镜像后再执行：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run desktop:build
```

输出目录：

```text
frontend/release/
```

也可以先本地预览桌面客户端：

```bash
npm run desktop:preview
```

## Docker 静态部署

```bash
docker compose up -d --build
```

部署后访问：

```text
http://服务器IP/
```

Docker 只运行 Nginx 静态前端容器。没有后端、MySQL、Redis。

## 算法说明

当前算法是启发式 3D bin packing：

- 先将货物按数量展开成单件。
- 大体积货物优先摆放。
- 每件货物不能超出箱体，不能和已摆放货物相交。
- 有堆叠时要求下方有足够支撑面积。
- 普通货物允许旋转；保持朝上、托盘货默认不旋转；不可重压货物不会承载上层货物。
- 多箱型分别试算，排序优先考虑箱数更少，其次考虑首箱利用率更高。

它适合做货代报价、体积估算和箱型选择辅助，不等同于专业排柜软件的全局最优求解器。
