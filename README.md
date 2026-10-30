<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./public/logo.png">
    <img src="./public/logo.png" width="380" alt="LightDrop Logo" />
  </picture>
</p>

<p align="center">
  <strong>现代化、极简、高隐私的局域网跨设备文件与文本共享服务</strong><br>
  无需公网中转 · 零外部数据库 · 纯 TypeScript 全栈 · PWA 原生支持 · 原生 Mermaid 图表渲染 · 毫秒级实时同步
</p>

<p align="center">
  <a href="./README.md">简体中文</a> | <a href="./README_EN.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Language-TypeScript_100%25-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Frontend-React_18_%2B_Vite_%2B_TailwindCSS-06b6d4?style=flat-square&logo=react&logoColor=white" alt="Frontend" />
  <img src="https://img.shields.io/badge/Backend-Node.js_%2B_Express_%2B_WS-339933?style=flat-square&logo=node.js&logoColor=white" alt="Backend" />
  <img src="https://img.shields.io/badge/Markdown-GFM_%2B_Mermaid-ff69b4?style=flat-square&logo=markdown&logoColor=white" alt="Markdown & Mermaid" />
  <img src="https://img.shields.io/badge/PWA-Supported-orange?style=flat-square&logo=pwa&logoColor=white" alt="PWA Ready" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ed?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## 📖 目录

- [💡 项目亮点](#-项目亮点)
- [🌟 核心功能特性](#-核心功能特性)
  - [1. 📝 沉浸式 Markdown 阅读器与 Mermaid 图表引擎](#1--沉浸式-markdown-阅读器与-mermaid-图表引擎)
  - [2. 📁 多文件、文件夹递归压缩与图文合辑](#2--多文件文件夹递归压缩与图文合辑)
  - [3. 🔒 权限模式与安全解密体验](#3--权限模式与安全解密体验)
  - [4. 🔗 独立提取页与免密直达链接](#4--独立提取页与免密直达链接)
  - [5. ⚡ 毫秒级多端实时同步 (WebSocket)](#5--毫秒级多端实时同步-websocket)
  - [6. 🧽 经典海绵宝宝身份系统](#6--经典海绵宝宝身份系统)
  - [7. 💾 纯文件原子存储引擎 (No-DB)](#7--纯文件原子存储引擎-no-db)
  - [8. 🛡️ 本机专属操作审计日志 (Audit Logs)](#8-️-本机专属操作审计日志-audit-logs)
  - [9. 📱 PWA 原生跨平台体验](#9--pwa-原生跨平台体验)
  - [10. 🌐 局域网 IP 变动自愈与稳定域名发现](#10--局域网-ip-变动自愈与稳定域名发现)
  - [11. 🚀 点对点 (P2P) 极速直传与双轨传输引擎](#11--点对点-p2p-极速直传与双轨传输引擎)
- [🚀 快速开始](#-快速开始)
  - [方式一：Docker Compose（推荐）](#方式一docker-compose推荐)
  - [方式二：全平台智能运维部署脚本 (`deploy.sh` / `deploy.bat` / `deploy.ps1`)](#方式二全平台智能运维部署脚本-deploysh--deploybat--deployps1)
  - [方式三：本地源码运行](#方式三本地源码运行)
- [📐 架构设计与技术栈](#-架构设计与技术栈)
  - [⚡ P2P 点对点技术实现深度解析](#-p2p-点对点技术实现深度解析)
    - [1. P2P 点对点设备发现原理](#1-p2p-点对点设备发现原理)
    - [2. 连接建立与信令协商机制](#2-连接建立与信令协商机制)
    - [3. 高性能双轨传输与流控实现](#3-高性能双轨传输与流控实现)
    - [4. P2P 资源存储与无服务器管理方案](#4-p2p-资源存储与无服务器管理方案)
  - [📚 架构与技术设计文档导航](#-架构与技术设计文档导航)
- [📦 自动化运维体系](#-自动化运维体系)
- [⚙️ 配置与数据持久化](#️-配置与数据持久化)
- [🛡️ 网络安全与企业局域网设计](#️-网络安全与企业局域网设计)
- [❓ 常见问题 (FAQ)](#-常见问题-faq)
- [🤝 参与贡献](#-参与贡献)
- [📄 开源协议](#-开源协议)

---

## 💡 项目亮点

<p align="center">
  <img width="1024" alt="LightDrop Dashboard Preview" src="./docs/images/dashboard-zh.png" />
</p>

在跨设备文件与文本互传场景中，现有方案往往存在诸多痛点与限制：

| 方案 | 常见痛点 | LightDrop 优势 |
| :--- | :--- | :--- |
| **微信 / QQ / 钉钉** | 文件限速、图片视频严重压缩、敏感信息上传第三方公网云端 | **跑满局域网千兆/万兆带宽**，零外网流量消耗，数据 100% 物理留存本地 |
| **Apple AirDrop** | 强绑定苹果生态，无法与 Windows、Linux、Android 设备互通 | **全平台免装客户端**，任意设备只要有现代浏览器即可秒级互传 |
| **网盘 / 商业快传** | 强制注册登录、文件大小严苛受限、下载限速、需中间节点中转 | **零门槛即开即用**，局域网扫码秒连，支持 PWA 桌面/移动端安装 |
| **传统 Samba / FTP** | 搭建配置繁琐、移动端界面体验差、完全不具备富文本与代码协同能力 | **开箱即用**，现代响应式 UI，原生支持 Markdown 与 Mermaid 矢量图表 |

---

## 🌟 核心功能特性

### 1. 📝 沉浸式 Markdown 阅读器与 Mermaid 图表引擎
- **全功能沉浸式阅读器**：
  - 快速预览卡片与传输记录均提供一键 **「查看」**，呼出支持全屏平滑滚动的专用文档阅读器；
  - **双视图自由切换**：支持在 **渲染预览 (Preview)** 与 **纯文本源码 (Raw)** 之间无缝切换；
  - 完美兼容 **GitHub Flavored Markdown (GFM)**，包括复杂表格、任务列表、块引用与代码语法高亮。
- **原生 Mermaid 流程图与图表渲染**：
  - **丰富图表语法支持**：原生渲染 `flowchart` 流程图、`sequenceDiagram` 时序图、`classDiagram` 类图、`stateDiagram` 状态机、`erDiagram` 实体关系图、`gantt` 甘特图、`pie` 饼图、`gitGraph` 分支图、`mindmap` 思维导图等；
  - **图表交互工具栏**：自动识别图表类型并标注徽标，支持图表与源码双视图独立切换；
  - **一键复制代码 & 导出 SVG**：支持一键将图表源码复制到剪贴板，或直接导出高保真矢量 `.svg` 文件；
  - **超大画布全屏大图预览**：点击放大按钮唤起居中全屏模态框，轻松平移与检视大型复杂架构图；
  - **动态异步按需加载 (Code Splitting)**：未包含 Mermaid 的文档保持零额外网络负载，按需加载渲染模块；
  - **强隔离排版引擎 (CSS Reset)**：严格重置并隔离外层 Markdown 行高与内边距，从根本上杜绝文字溢出边框、中英文乱折行或行距失真。
- **智能多级目录 (TOC) 导航**：
  - 自动从 Markdown 标题中提取章节层级目录，支持一键展开/折叠与快速定位；
  - 点击目录项平滑滚动至对应章节，附带高亮淡出动效；
  - 右侧悬浮“回到目录”与“回到顶部”快捷按钮，顶部提供实时阅读进度指示条；
  - 支持一键导出/下载为标准 `.md` 文件，内置文件名合法化校验与自定义重命名。

### 2. 📁 多文件、文件夹递归压缩与图文合辑
- **批量拖拽极速互传**：支持多文件、海量图片一次性拖拽上传，动态展示精确传输进度、速度与分项元信息；
- **文件夹自动打包**：直接选择整个本地文件夹，服务端采用流式压缩（Streaming Zip）自动归档打包，完整保留多级层级结构；
- **图文合辑专属呈现**：支持在上传文件的同时附带说明文本或 Markdown 笔记，列表顶部优先渲染正文摘要与可折叠 Markdown，附件整洁汇聚；
- **高清缩略图与大图预览**：图片自动生成高清缩略图，点击呼出轻量画廊查看原图；
- **智能剪贴板集成**：支持在页面任意位置通过快捷键 `Ctrl+V` / `Cmd+V` 直接粘贴图片、文件或长文本，附带本地文件路径防呆检测。

### 3. 🔒 权限模式与安全解密体验
- **简明清晰的两种权限类型**：
  - **🌐 局域网公开**：免密公开，局域网内任意访客均可自由查看、复制正文与下载附件；
  - **🔒 PIN 密码保护**：受访问密码保护，服务端采用 SHA-256 加盐哈希脱敏，未验证前正文与文件下载直链均不向客户端泄露。
- **会话解密持久记忆**：成功解锁一条记录后，在当前浏览器会话周期内自动保持解锁状态，再次查看或复制**无需重复输入密码**，锁图标自动转换为可用状态。

### 4. 🔗 独立提取页与免密直达链接
- **单记录专属提取页 (`/download/:id`)**：
  - 每条记录分配专属短链接与二维码，手机微信或浏览器扫码直达单个条目，无需暴露主站仪表盘所有历史记录；
  - 针对文本记录提供优雅的卡片解锁过渡与阅读界面；
- **免密直达链接**：
  - 支持在分享链接中携带安全凭证参数（`?pwd=xxx`），接收方点击自动静默校验解锁；
  - 分享弹窗支持一键复制“图文分享文案”与“快捷免密直链”。

### 5. ⚡ 毫秒级多端实时同步 (WebSocket)
- 局域网内任意设备执行发送、修改、重命名、删除或清空操作，其余所有在线设备**无需手动刷新**，毫秒级全自动同步视图；
- 底部状态栏实时呈现当前局域网在线设备总数、延迟与服务健康状态。

### 6. 🧽 经典海绵宝宝身份系统
- 内置 15 位经典海绵宝宝角色库（海绵宝宝 🧽、派大星 ⭐️、章鱼哥 🐙、蟹老板 🦀 等），初次访问自动分发角色与专属 Emoji；
- 基于 `localStorage` 浏览器持久化，免去传统账号密码注册的繁琐，同时为发送记录、操作审计提供清晰直观的身份标识；
- 顶部导航支持随时自定义昵称或一键随机换角色。

### 7. 💾 纯文件原子存储引擎 (No-DB)
- **零外部数据库依赖**：无需安装 MySQL、PostgreSQL 或 Redis，采用 `records.json` 索引 + 物理文件目录隔离；
- **文件系统原子写入 (Atomic Write)**：通过临时文件与底层重命名（`fs.renameSync`）机制保障并发写入安全，防止意外断电导致数据损坏；
- **Web 端平滑热迁移**：系统设置中支持随时更改物理存储目录（如挂载的 NAS 或外部移动硬盘路径），支持**一键热迁移**历史数据，服务重启自动读取引导配置；
- **自动清理策略**：支持配置 1 天 / 3 天 / 7 天 / 30 天 或永不清理过期文件。

### 8. 🛡️ 本机专属操作审计日志 (Audit Logs)
- 仅在部署服务的本机（`localhost` / `127.0.0.1`）或受信任的管理员 IP 开放审计面板，局域网普通访客完全不可见；
- 全链路实时追踪局域网各客户端的上传、下载、复制、删除、查看密码及访问分享单页等操作轨迹。

### 9. 📱 PWA 原生跨平台体验
- 完整遵循 Web App Manifest 与 Service Worker 规范；
- 手机端支持“添加到主屏幕”，电脑端 Chrome / Edge / Safari 支持“安装应用”，拥有独立的运行窗口与原生 App 级操作质感。

### 10. 🌐 局域网 IP 变动自愈与稳定域名发现
- **Bonjour / mDNS 稳定本地域名**：系统自动生成 `http://<主机名>.local:8080` 稳定访问域名。宿主电脑无论切换到哪个 Wi-Fi，物理 IP 如何变动，手机添加到书签或主屏幕后**免重复扫码**，由底层 mDNS 协议秒级自动解析至最新物理 IP；
- **跨平台原生桌面通知**：电脑切换 Wi-Fi 时，自动触发系统级通知横幅（macOS 通知中心、Windows 原生 Toast、Linux `notify-send`），第一瞬间告知当前最新可用局域网 IP 与访问地址；
- **手机实时推送 (Bark / Webhook)**：设置中心支持填入 iOS Bark Key 或通用 Webhook 接收端，电脑切换 Wi-Fi 手机立即收到通知横幅，点击通知直接跳转进入最新服务；
- **UDP 自发现与连接断线自愈**：集成轻量 UDP 8089 端口广播信标，前端实时监听网络断线与 WebSocket 变动事件，网络恢复时静默重连与寻址自愈。

### 11. 🚀 点对点 (P2P) 极速直传与双轨传输引擎

<p align="center">
  <img width="1024" alt="LightDrop P2P Direct Drop Mode" src="./docs/images/p2p-zh.png" />
</p>

- **局域网设备自发现与在线感知**：自动发现同网段在线设备，动态生成专属设备卡片并标识系统与浏览器类型，支持一键设备收藏与长连接互信会话；
- **WebRTC DataChannel 极速直连**：两端设备优先建立端到端加密通道（DTLS/SCTP），跑满局域网千兆/万兆带宽，大文件直传不经服务端磁盘中转，保护极致隐私；
- **智能双轨降级与 100% 连通保障**：面对跨子网隔离或防火墙阻断 UDP 时，1.2 秒内自动平滑降级为 WebSocket 内存流式管道，兼顾极致传输速率与复杂内网环境 100% 连通性；
- **严格背压控制与流式分片**：采用 64KB 流式分片与严格背压流控机制（256KB 唤醒 / 1MB 阈值），内存占用严格恒定在 2MB 以内，大文件传输零卡顿、零内存泄漏；
- **IndexedDB 离线持久化与零落盘安全**：接收的文件与文本完全不经服务端磁盘存储，前端自动持久化存入浏览器本地 IndexedDB，支持离线极速调取与 0 流量导出。

<p align="center">
  <img width="1024" alt="LightDrop P2P Device Picker Modal" src="./docs/images/p2p-picker-zh.png" />
</p>

---

## 🚀 快速开始

### 方式一：Docker Compose（推荐）

**环境要求**：已安装 Docker 和 Docker Compose。

1. 克隆仓库并进入项目目录：

```bash
git clone https://github.com/zhatiai/LightDrop.git
cd LightDrop
```

2. 一键启动服务：

```bash
docker compose up -d
```

Docker Compose 将自动基于内置 `Dockerfile` 编译并启动服务，无需在宿主机安装 Node.js 或 pnpm。

打开浏览器访问 `http://<本机局域网IP>:8080` 即可开始使用。数据与文件将持久化存储在 `./data` 中。

后续更新代码只需执行：

```bash
git pull
docker compose up -d --build
```

---

### 方式二：全平台智能运维部署脚本 (`deploy.sh` / `deploy.bat` / `deploy.ps1`)

项目内置跨平台一键部署系统，**自动嗅探操作系统环境 (macOS / Linux / Windows)** 并动态匹配最优生命周期管理机制与开机自启动配置：

```bash
# === macOS / Linux / Windows (Git Bash) ===
# 交互式向导 (自动检测系统、适配模式与自启动选项)
./deploy.sh

# 自动选择系统最优原生模式并开启开机自启 (macOS 推荐)
./deploy.sh -m auto --autostart

# macOS 原生 LaunchAgent 守护服务 (免 root、崩溃自动恢复、开机自启)
./deploy.sh -m launchd --autostart

# Linux 原生 Systemd 系统服务
./deploy.sh -m systemd --autostart

# Docker 容器化部署 (全平台)
./deploy.sh -m docker -p 8080 --autostart
```

```powershell
# === Windows 原生 (PowerShell / CMD 双击) ===
# 双击 deploy.bat 或在 PowerShell 中执行:
.\deploy.ps1

# Windows 任务计划程序静默后台常驻 (推荐)
.\deploy.ps1 -Mode task -AutoStart $true

# Windows 开机自启文件夹模式 (免管理员权限)
.\deploy.ps1 -Mode startup -AutoStart $true
```

---

### 方式三：本地源码运行

**环境要求**：Node.js >= 18.0.0，pnpm >= 8.0.0

```bash
# 1. 安装全量依赖
pnpm install

# 2. 编译生产代码 (客户端 Vite + 服务端 TypeScript)
pnpm build

# 3. 启动生产服务
pnpm start

# 或进入开发热重载模式
pnpm dev
```

---

## 📐 架构设计与技术栈

本项目采用 **TypeScript 全栈单仓 (Monorepo) 规范**，前后端共享底层类型契约与协议定义：

> [!TIP]
> 📖 **进阶技术文档**：想深入了解系统整体全景设计、No-DB 原子存储、WebSocket 连接池与 P2P 双轨协议实现细节？欢迎查阅 [系统整体架构与详细设计文档](./docs/architecture.md) 与 [P2P 点对点传输与存储设计文档](./docs/p2p-design.md)。

```mermaid
flowchart TD
    subgraph ClientLayer["客户端 (Client) - React 18 + Vite + TailwindCSS"]
        UI["响应式 Web / PWA 界面"]
        Reader["Markdown 阅读器 (GFM + Mermaid 引擎)"]
        WSClient["WebSocket Client (实时状态同步)"]
        P2PEngine["P2P Engine (WebRTC DataChannel + Relay)"]
        P2PStorage["IndexedDB + LocalStorage (P2P 本地安全存储)"]
    end

    subgraph ServerLayer["服务端 (Server) - Node.js + Express + WS"]
        Router["Express REST API 路由 (/api/records, /download)"]
        WSServer["WebSocket Hub (广播、信令中继与节点拓扑)"]
        MDNS["Bonjour / mDNS + UDP 广播引擎 (Port 8089)"]
    end

    subgraph StorageLayer["持久化层 (Storage) - No-DB Atomic Storage"]
        JSONIndex["records.json (原子重命名索引)"]
        Config["lightdrop.config.json (免重启热更新配置)"]
        FileDir["files/<recordId>/ (分片物理存储)"]
        Audit["audit_logs.json (本地安全审计)"]
    end

    UI --> Router
    Reader --> UI
    WSClient <-->|全双工毫秒级同步 & P2P 信令中继| WSServer
    P2PEngine <==>|WebRTC DataChannel 局域网直连 (优先)| P2PEngine
    P2PEngine -.->|WebSocket 内存隧道降级| WSServer
    P2PEngine --> P2PStorage
    Router --> JSONIndex
    Router --> FileDir
    Router --> Audit
    Router --> Config
    MDNS -.->|网络自愈感知| ClientLayer
```

### ⚡ P2P 点对点技术实现深度解析

针对现代浏览器在纯 Web 环境下缺乏原生 Raw UDP / 广播套接字能力的限制，LightDrop 设计了一套**「两层分立、服务协调驱动」**的高性能 P2P 传输架构。系统在保持完全免装客户端、纯浏览器原生体验的前提下，实现了毫秒级设备自发现、WebRTC/WebSocket 双轨传输、纳秒级背压流控以及前端 IndexedDB 离线持久化管理。

#### 1. P2P 点对点设备发现原理

系统将设备发现划分为**服务级物理网络发现**与**端侧浏览器节点拓扑发现**两个层次：

- **底层服务级发现 (UDP 广播信标 + mDNS)**：
  - **主动广播 (Announce)**：后台 `UdpDiscoveryService` 监听 `0.0.0.0:8089`，在服务冷启动或检测到物理网卡 IP 切换时，主动向局域网广播地址 `255.255.255.255:8089` 发射 `LIGHTDROP_ANNOUNCE` 报文，广播当前服务实例 ID、IP、端口及 Bonjour 域名；
  - **被动嗅探应答 (Probe Response)**：持续监听局域网内客户端或节点发出的探测请求（包含 `DISCOVER`、`PING`、`SCAN`、`QUERY`），单播回复包含服务元信息的 `LIGHTDROP_PONG`；
  - **防风暴与防回路设计**：每个服务进程生成唯一 `instanceId`，绝对丢弃自身回环报文；配置同 IP 客户端 500ms 响应限流与 5 秒 TTL 网卡接口缓存，杜绝网络风暴与高频系统调用消耗 CPU。
- **端侧浏览器节点拓扑发现 (WebSocket Hub)**：
  - **稳定设备指纹**：客户端在 `localStorage` 持久化生成全局唯一且跨刷新稳定的 `deviceId`（格式形如 `node_<timestamp>_<random>`），并绑定当前设备的操作系统、浏览器标识、角色昵称与专属头像色彩；
  - **入网自声明 (`PEER_REGISTER`)**：浏览器建立 WebSocket 连接后，立即上报 `PEER_REGISTER`。服务端提取客户端真实底层局域网 IP (`clientIp`) 注入节点元数据；
  - **全量单播 + 增量广播拓扑模型**：
    - **全量单播**：服务端仅向新上线节点单播下发当前所有在线设备列表（`PEER_ONLINE_LIST`，排除自身），避免全网组播；
    - **增量广播**：服务端向其他在线节点轻量通知新节点加入（`PEER_JOINED`），节点改名或进入接收模式时通知 `PEER_UPDATED`，节点掉线通过 30s 心跳探活感知后广播 `PEER_LEFT`。全网拓扑数据传输维持在微秒级与数十字节级别。

#### 2. 连接建立与信令协商机制

P2P 传输建立前，系统通过双段握手、信令单播转发与超时自动降级机制确保连接安全与 100% 可达：

- **会话模型与握手协议**：
  - **轻量单次传输握手**：发送方发送 `HANDSHAKE_REQUEST`，携带文件列表、预览文本、总数据量及发送方指纹；接收方弹出接收卡片，支持**接受 / 拒绝 / 忙碌**响应（`HANDSHAKE_RESPONSE`）；
  - **互信长连接会话 (Persistent Session)**：双方可申请建立长期互信直通会话（`SESSION_REQUEST` -> `SESSION_ESTABLISHED`），会话存续期间支持**免二次确认极速直传**，以及专属的 **0-RTT 极速单向文本直发 (`SESSION_DIRECT_TEXT`)**；
  - **绝对单播信令中继**：所有会话握手、SDP Offer/Answer 及 ICE Candidates 均封装为 `P2P_DIRECT_MESSAGE`，服务端严格按照 `targetDeviceId` 单播投递，服务端仅做内存透明转发，完全不触碰无关设备。
- **1.2 秒双轨自适应通道协商**：
  - 协商阶段首先尝试初始化 WebRTC `RTCPeerConnection`，配置公网 STUN 候选集并创建 DataChannel（`ordered: true`，二进制传输类型 `arraybuffer`）；
  - **握手超时保护**：设立 1200ms 的局域网直连打洞等待窗口。若 1.2 秒内 DataChannel 打开成功，锁定 `webrtc` 极速直连模式（强制 DTLS/SCTP 加密，跑满局域网千兆/万兆带宽）；若处于跨子网隔离、对称 NAT 或企业防火墙严禁 UDP 端口导致超时，**无缝平滑降级至 `relay` 模式**（通过已有 WebSocket 管道实现内存流式中继），确保极端网络环境下的 100% 成功交付。

#### 3. 高性能双轨传输与流控实现

为应对大文件、海量数据互传中的内存抖动、网卡拥塞与卡顿问题，P2P 引擎设计了严格的流控流水线：

- **64KB 流式分片 (Streaming Chunking)**：
  - 文件读取完全摒弃整文件载入内存的方式，采用 `File.slice(offset, offset + 64KB)` 步进分块流式读取为 `ArrayBuffer`；
  - 在 WebRTC 通道下原生投递二进制分片；在 Relay 通道下以内存 Base64 分片走 WebSocket 单播中继。
- **严格的双向背压控制 (Backpressure Control)**：
  - **WebRTC 背压**：持续监控 DataChannel 缓冲区水位 `dc.bufferedAmount`，当堆积超过 1MB 阈值时立即挂起读取，等待底层网卡排空并触发 `onbufferedamountlow`（唤醒水位 256KB）后再恢复调度；
  - **WebSocket 背压**：实时探测底层的 `activeWs.bufferedAmount`，当积压超过 512KB 时挂起循环执行 `waitForWsDrain` 等待网络冲刷；
  - 双端内存占用始终恒定在 **< 2MB**，彻底杜绝大文件传输导致浏览器页面卡死或标签页崩溃 (OOM)。
- **网卡级真实出站速率测算**：
  - 计算传输进度与瞬时速度时，系统严格扣除本地套接字出站缓冲区中暂存滞留的数据量（`actualDeliveredBytes = transferredBytes - buffered`），杜绝“数据还在本地内存就提前显示 100%”的虚假进度。
- **双端确认与落盘强同步 (ACK-driven Reliability)**：
  - 传输期间接收端每 300ms 或每接收 256KB 向发送端节流回传已收到的真实字节数（`TRANSFER_ACK`），双端进度毫秒级精准对齐；
  - **关键完成握手**：发送端在全部数据发出后，进度最高停留在 99%；接收端必须在组装全部二进制分片、校验无误并写入存储后，回传 `TRANSFER_COMPLETE_ACK` 确认，发送端收到后才正式触发 100% 完成回调，从协议层杜绝单侧假死。

#### 4. P2P 资源存储与无服务器管理方案

LightDrop P2P 传输彻底贯彻**「零服务端依赖与数据绝对留存本地」**的隐私哲学：

- **零服务端物理落盘 (Zero-Server-Disk-Retention)**：
  - P2P 直传产生的所有文件实体与私密文本**完全不经过服务端的物理磁盘**（绝不写入服务端 `data/files/` 物理目录与 `records.json` 索引库），服务端数据库无任何明文记录，物理隔绝服务端窥探。
- **前端双层混合持久化存储 (Hybrid Local Persistence)**：
  - **轻量元数据层 (`localStorage`)**：存储 P2P 传输历史摘要（`lightdrop_p2p_records`，包含传输 ID、对端昵称、角色头像、时间戳、文件列表及体积），与服务端公共共享记录无缝聚合在同一个数据表格中展示，附带显式 `P2P` 专有徽标；
  - **二进制实体层 (`IndexedDB`)**：文件传输完成（`completeP2PRecord`）后，接收端将二进制文件 Blob 自动持久化写入浏览器独立的 IndexedDB（数据库名 `LightDrop_P2P_DB`，对象仓库 `blobs`，键名 `${recordId}_${fileIndex}`），彻底突破 `localStorage` 5MB 的存储容量限制，安全承载数百 MB 乃至 GB 级文件的离线安全留存。
- **无服务极速提取与下载 (Zero-Network Blob Export)**：
  - 用户在记录表格中点击“下载”或“查看”P2P 记录时，数据层（`useRecords`）检测到 `isP2P` 属性，直接通过 `getP2PRecordBlob()` 从本地 IndexedDB 读取 Blob，并通过 `URL.createObjectURL` 唤起浏览器原生安全保存；**全程消耗 0 外部网络带宽、0 服务端资源负载**。
- **原子级生命周期管理**：
  - **级联删除**：删除单条 P2P 记录时，原子同步清理 `localStorage` 索引元数据及关联的全部 `IndexedDB` 物理文件分片；
  - **一键清空**：支持在表格批量清理时一键排空所有本地 P2P 缓存（`clearAllLocalP2PRecords`）；
  - **隐私隔离**：在浏览器无痕/隐身模式或手动清空站点数据时自动全量销毁，不留任何持久化物理痕迹。

### 📚 架构与技术设计文档导航

为了方便开发者和架构师深入掌握 LightDrop 的底层架构与交互协议，项目在 [`docs/`](./docs) 目录下维护了专项技术设计全景文档：

| 专题技术文档 | 语言版本 | 核心覆盖范围 |
| :--- | :--- | :--- |
| 📘 **系统整体技术架构与详细设计** | [简体中文](./docs/architecture.md) · [English](./docs/architecture_EN.md) | 全栈分层拓扑、No-DB 原子覆写引擎、WebSocket 连接池、局域网 IP 自愈感知、企业安全白名单与权限模型 |
| 🚀 **P2P 点对点传输与资源存储技术设计** | [简体中文](./docs/p2p-design.md) · [English](./docs/p2p-design_EN.md) | 两层设备发现机制、WebRTC/Relay 1.2s 双轨竞速、64KB 背压流控流水线、IndexedDB 零落盘隐私持久化 |
| 🛠️ **远端服务器部署与测试缺陷报告** | [缺陷复盘报告](./docs/bug.md) | 真实 Ubuntu 生产服务器全覆盖压测、多环境 Shell 脚本兼容性诊断与 12 项高危缺陷修复复盘 |

### 目录结构组织

```text
LightDrop/
├── src/
│   ├── shared/                # 协议层：前后端共享 TypeScript 类型定义与常量
│   ├── server/                # 服务端：Express + WebSocket + 原子文件引擎 + mDNS 服务
│   └── client/                # 客户端：React 18 + Vite + Tailwind CSS + Mermaid + PWA
├── scripts/                   # 自动化运维脚本库 (deploy, package, uninstall, common)
├── Dockerfile                 # 多阶段瘦身生产容器构建文件
└── docker-compose.yml         # 生产容器编排文件
```

---

## 📦 自动化运维体系

| 脚本 | 适用平台 | 生命周期支持 | 常用指令示例 |
| :--- | :--- | :--- | :--- |
| `deploy.sh` / `deploy.bat` / `deploy.ps1` | macOS / Linux / Windows | **macOS**: `launchd` (LaunchAgent)<br>**Linux**: `systemd`<br>**Windows**: `task` / `startup`<br>**全平台**: `docker` / `pm2` / `standalone` | `./deploy.sh -m auto --autostart`<br>`.\deploy.ps1 -Mode task` |
| `package.sh` | Linux / macOS / Git Bash | 多形态发行打包 (Docker TAR 离线镜像 / 原生免编独立发行包) | `./package.sh --all` |
| `uninstall.sh` / `uninstall.bat` / `uninstall.ps1` | macOS / Linux / Windows | 精准停用服务、注销自启动项，支持数据保留或全量清除 | `./uninstall.sh --keep-data`<br>`.\uninstall.ps1 -DeleteData` |

---

## ⚙️ 配置与数据持久化

### 存储目录结构
数据默认持久化在 `./data`（或部署工作目录下的 `data` 路径）：

```text
data/
├── records.json               # 共享记录元数据 (内存索引加速 + 原子重命名覆写)
├── settings.json              # 系统运行首选项 (单文件限额、自动清理周期)
├── audit_logs.json            # 局域网操作审计日志
└── files/<recordId>/          # 上传的物理文件存储目录
```

### 独立配置文件与免重启热更新 (`lightdrop.config.json`)

系统提供独立的全局配置文件 `lightdrop.config.json`（位于部署工作目录，例如 macOS 原生服务为 `~/Library/Application Support/LightDrop/config/lightdrop.config.json`，源码运行则位于项目根目录）：

```json
{
  "storageDir": "/Users/user/data",
  "port": 8080,
  "maxFileSizeMB": 1024,
  "autoCleanupDays": 7,
  "siteTitle": "LightDrop",
  "adminIps": [
    "192.168.1.100",
    "10.0.0.*"
  ]
}
```

- **免重启热更新 (Hot-Reloading)**：直接编辑该 JSON 配置文件并保存，服务端底层文件监听器将**毫秒级自动热更新**并应用新策略，且通过 WebSocket 实时广播同步至所有已连接的设备界面，**完全无需重启服务进程**。
- **权限安全隔离 (Guest Read-Only / Admin)**：
  - 存储目录、单文件上传上限与自动清理策略为服务端全局配置；
  - 局域网内其他设备打开「设置」时，**所有服务器配置项均强制呈只读锁定状态**，界面呈现黄色访客标识，防止非管理员篡改；
  - 仅**部署服务器本机（回环地址及宿主机物理网卡）**或在 `adminIps` 列表中指定的管理员 IP 设备具备可写修改权限；
  - 部署脚本支持直接指定管理员 IP 列表：`./deploy.sh --admin-ips "192.168.1.100,10.0.0.*"`。

### 进程管理常用命令
- **macOS (launchd)**:
  ```bash
  launchctl unload -w ~/Library/LaunchAgents/com.lightdrop.server.plist && launchctl load -w ~/Library/LaunchAgents/com.lightdrop.server.plist
  ```
- **Linux (systemd)**:
  ```bash
  sudo systemctl restart lightdrop.service
  ```
- **PM2**:
  ```bash
  pm2 restart lightdrop
  ```
- **Docker**:
  ```bash
  docker restart lightdrop
  ```

---

## 🛡️ 网络安全与企业局域网设计

很多局域网工具在企业环境或大型 Wi-Fi 下容易引发 IT 审计关注或网络广播风暴担忧。LightDrop 从底层协议规范严格遵循**低频、单向、零污染**原则设计，天然适配企业内网：

### 1. 绝对杜绝“广播风暴” (Zero Broadcast Storm)
- **纯事件驱动（无定时轮询广播）**：服务端内部**没有任何定时轮询发包器**。仅在服务首次启动以及检测到网卡 IP 实际切换时触发**单次** UDP 信标，日常待机广播包发送量恒为 **0**；
- **微小数据包（单包 ~300 字节）**：单次通知耗时小于 0.1ms，仅相当于普通 ARP 请求包大小；
- **单向无放大、无环路**：接收端设备仅接收并更新本地内存，绝不参与任何转发或中继，物理上完全不具备触发广播风暴或环路放大的条件。

### 2. 链路本地（Link-Local）范围限制与企业 VLAN 隔离
- **mDNS 组播局限于物理二层**：Bonjour / mDNS 组播协议（`224.0.0.251:5353`）严格限制 TTL=1，仅在当前 Wi-Fi/广播域生效。三层核心交换机与企业路由器默认绝不路由或转播该组播包，**绝不会跨网段扩散至公司其他部门或核心服务器**；
- **兼容企业 AP 隔离 (Client Isolation)**：在开启了 AP 隔离的受控公司 Wi-Fi 下，无线 AP 会在空口或二层静默丢弃客户端间直连探测包。此时 UDP 信标与组播自然静默失效，不会对网络设施产生任何冲击或报警。

### 3. 企业严格合规模式（一键彻底关闭 UDP）
若公司信息安全或 EDR/态势感知审计策略严格禁止任何未经审批的 UDP 端口广播：
- 点击页面右上角 **「设置」->「局域网发现与 IP 变动感知」**；
- 直接**关闭「启用 UDP 局域网自发现」**开关，服务端将立即彻底销毁（`socket.close()`）UDP 8089 端口监听，不再发送或接收任何 UDP 数据包；
- 关闭后依然可以通过 `.local` 稳定域名、手机扫码或 Bark / Webhook 远程推送完整使用快传与 IP 自愈功能。

---

## ❓ 常见问题 (FAQ)

<details>
<summary><strong>Q: 手机扫码提示无法连接或超时？</strong></summary>

1. 确认手机与电脑连接在**同一 Wi-Fi** 下（处于同一局域网网段）；
2. 检查电脑系统防火墙是否已放行 `8080` 端口入站规则；
3. 若电脑启用了 VPN 或虚拟机虚拟网卡，点击顶部 IP 下拉框切换至真实的局域网 IPv4 地址。
</details>

<details>
<summary><strong>Q: Markdown 中包含复杂的 Mermaid 流程图或时序图能否正常展示？</strong></summary>

完全支持。LightDrop 内置专业级 Mermaid 渲染引擎与样式强隔离重置方案，无论是流程图（Flowchart）、时序图（Sequence）、类图（Class）、状态图（State）还是甘特图（Gantt）均能精确矢量渲染。支持图表/源码双视图切换、一键复制代码、导出 SVG 矢量图以及超大画布全屏大图预览。
</details>

<details>
<summary><strong>Q: 电脑切换 Wi-Fi 后，手机如何最快重新访问？</strong></summary>

系统提供 3 种极速感知与自愈方案：
1. **稳定域名（推荐）**：使用二维码弹窗中的 `http://<主机名>.local:8080` 稳定域名访问，手机直接「添加到主屏幕」或收藏为书签。电脑无论切换哪个 Wi-Fi，系统级 mDNS 均秒级自动将该域名解析至最新物理 IP，永久免换地址；
2. **桌面原生通知**：电脑切换 Wi-Fi 时，macOS / Windows / Linux 屏幕右上角会自动弹出桌面通知，清晰展示最新 IP；
3. **手机实时推送**：在设置中配置 iOS Bark URL，Wi-Fi 切换瞬间手机即刻收到通知弹窗，点击直接打开最新服务。
</details>

<details>
<summary><strong>Q: 该组件的 UDP 广播或组播会在公司局域网中引发广播风暴吗？</strong></summary>

绝对不会。
1. LightDrop 绝无定时广播循环，仅在 Wi-Fi 物理切换瞬间发送单个 300 字节的事件单包，频率比操作系统自带的 ARP/DHCP/AirDrop 后台网络行为低几个数量级；
2. mDNS 组播 TTL=1，仅在二层链路生效，三层企业路由器默认不转发，无法扩散至其他部门；
3. 若公司有严苛的内网合规审计，可在设置中一键彻底关闭「启用 UDP 局域网自发现」。
</details>

<details>
<summary><strong>Q: 上传超大文件是否有限制？</strong></summary>

原生无大小限制。系统采用流式写入机制，内存占用极低。如遇限额提示，可在右上角「设置」中将「单文件大小限制」调整为更大或设置为“无限制”。
</details>

<details>
<summary><strong>Q: 更改存储路径到 NAS 挂载目录后，重启会丢失吗？</strong></summary>

不会。工作目录下的 `lightdrop.config.json` 会持久记录当前生效的物理路径，服务重启后自动从引导配置定位目标目录。
</details>

<details>
<summary><strong>Q: 如何快捷分享带密码的文本并免去输入步骤？</strong></summary>

在记录的操作栏点击“复制链接”，弹窗内提供「快捷免密链接」（内含安全校验参数），接收者直接点击该链接即可自动验证并展开阅读。
</details>

<details>
<summary><strong>Q: 为什么手机端看不到“操作审计”入口？</strong></summary>

安全设计机制。局域网操作审计包含所有客户端行为留痕，仅开放给运行服务的本机（Localhost / 127.0.0.1）管理员访问，防止数据外泄。
</details>

---

## 🤝 参与贡献

欢迎提交 Issue 与 Pull Request！

1. Fork 本项目并克隆到本地
2. 创建特性分支 (`git checkout -b feature/awesome-feature`)
3. 提交改动 (`git commit -m 'feat: add awesome feature'`)
4. 推送到远程分支 (`git push origin feature/awesome-feature`)
5. 发起 Pull Request

---

## 📄 开源协议

本项目采用 [MIT 许可证](LICENSE) 开源，允许免费商用与自由二次分发。
