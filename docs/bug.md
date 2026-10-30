# LightDrop 远端服务器部署与测试缺陷报告 (Bug Report)

> **测试目标主机**: `root@192.0.2.10` (Ubuntu 22.04 LTS 独立节点)  
> **操作系统**: Ubuntu 22.04.5 LTS (x86_64, Linux 5.15)  
> **基础环境**: 默认系统 Node `/usr/bin/node` 为 v12.22.9，NVM 安装有 Node v20.20.2 / v22.22.3；Docker 29.4.1；宿主机 8080 端口已被其他服务占用。  
> **测试覆盖范围**: 制品构建（Docker 镜像与导出包、免编译独立发行包）、容器化部署与生命周期（Docker）、非容器化部署与生命周期（Linux Systemd、原生独立进程 Standalone、便携包直跑）、核心业务 API（上传、下载、记录、密码保护、IP 白名单、热更新配置）以及全量卸载与数据保护机制。

---

## 缺陷总览 (Issue Summary)

| 缺陷编号 | 影响模块 | 严重级别 | 缺陷简述 | 修复状态 |
| :--- | :--- | :---: | :--- | :---: |
| **BUG-001** | `package.sh` | 高危 (High) | `--docker` 打包时无条件在宿主机执行源码编译，缺少 `pnpm` 时直接报错中断 | 已修复 |
| **BUG-002** | `common.sh` | 严重 (Critical) | `json_read` 使用空值合并操作符 `??`，在 Node < 14 环境下引发 SyntaxError 导致卸载及版本读取崩溃 | 已修复 |
| **BUG-003** | `common.sh` | 严重 (Critical) | `get_node_bin` 未校验 Node 版本且未探测 NVM，非交互 Shell 下误用 Node 12 导致现代 ES 模块崩溃 | 已修复 |
| **BUG-004** | `deploy.sh` | 高危 (High) | Docker 模式下未预生成配置文件，导致 Docker 守护进程将挂载点自动创建为目录并引发 `EISDIR` 崩溃 | 已修复 |
| **BUG-005** | `package.sh` | 高危 (High) | 便携式免编译发行包缺少 `node_modules` 依赖，解压后无法直接独立运行 | 已修复 |
| **BUG-006** | `Dockerfile` | 中危 (Medium) | 缺少 `.dockerignore`，构建上下文误上传宿主机 172MB 的 `node_modules` 并破坏容器内二进制兼容 | 已修复 |
| **BUG-007** | `deploy.sh` | 中危 (Medium) | 部署前未做目标端口占用预检，端口冲突时无友好提示且容器启动静默失败 | 已修复 |
| **BUG-008** | 服务端鉴权 | 高危 (High) | Docker 容器网桥网关 (`172.17.0.1`) 未被识别为宿主机本地访问，导致本地管理权限被降级为访客 | 已修复 |
| **BUG-009** | `package.json` | 高危 (High) | `package.json` 中 `build` 脚本硬编码 `pnpm`，在未全局安装 pnpm 的机器上通过 npm 构建失败 | 已修复 |
| **BUG-010** | `deploy.sh` / Docker | 高危 (High) | Docker 单文件挂载在宿主机文件被 `sed -i` 或原子编辑器覆写（更换 inode）后失去同步，配置热更新失效 | 已修复 |
| **BUG-011** | 配置管理模块 | 高危 (High) | 数据目录下的 `settings.json` 反向覆盖主配置文件的 `storageDir` 与 `port`，导致容器与宿主机切换部署时路径错乱 | 已修复 |
| **BUG-012** | 便携包 `run.sh` | 高危 (High) | 便携发行包自带的 `run.sh` 启动器通过 `command -v node` 命中系统老版本 Node 12，导致语法错误无法启动 | 已修复 |

---

## 缺陷详细分析与修复说明

### BUG-001: package.sh 针对 --docker 目标未跳过宿主机构建
- **问题现象**: 执行 `./package.sh --docker` 时，脚本在第一阶段无条件在宿主机执行 `pnpm build`。若宿主机未安装 `pnpm`（例如纯 Docker 服务器环境），脚本立即报 `pnpm: not found` 失败退出。
- **根本原因**: Dockerfile 本身采用多阶段构建（内部已包含完整的 node:22-alpine 及 pnpm 环境构建步骤），构建容器镜像完全不需要宿主机具备 Node/pnpm 环境。但 `package.sh` 未针对 `--docker` 模式跳过 `build_project`。
- **修复方案**: 在 `scripts/package.sh` 中检测当打包目标仅为 `--docker` 时，自动跳过宿主机源码构建步骤，直接调用 Docker CLI 进行镜像编译与导出。

---

### BUG-002: common.sh 中 json_read 使用 ?? 导致 Node < 14 环境语法报错
- **问题现象**: 在带有老版本 Node（如 Ubuntu 22.04 LTS 自带的 Node 12.22.9）的环境中执行 `uninstall.sh` 或版本读取时，终端报出：
  ```
  [eval]:2
  console.log(process.argv[2].split(".").reduce((o, i) => o?.[i], data) ?? "");
                                                                         ^
  SyntaxError: Unexpected token '?'
  ```
  导致 `uninstall.sh` 无法解析运行记录 `runinfo.json` 中的部署模式和数据路径。
- **根本原因**: Node.js 12 不支持 ES2020 空值合并操作符 `??`。
- **修复方案**: 修改 `scripts/common.sh` 中的 `json_read`，采用向下兼容的条件判断 `(v !== undefined && v !== null ? v : "")`。

---

### BUG-003: get_node_bin 未筛选 Node 版本且在非交互式 Shell 中丢失 NVM
- **问题现象**: 在远端服务器（通过 SSH 非交互执行或 Systemd 守护进程中），`/root/.bashrc` 会因 `[ -z "$PS1" ] && return` 提前返回，导致 NVM 环境变量未加载。此时 `command -v node` 默认匹配到 `/usr/bin/node` (v12)，导致后续执行 ESM 语法或现代 Node API 时崩溃。
- **根本原因**: `get_node_bin` 优先信赖了 `command -v node`，未对 Node 大版本进行 `>= 18` 校验，也未主动搜寻 `/root/.nvm/versions/node/v*/bin/node` 等典型 NVM 安装路径。
- **修复方案**: 在 `scripts/common.sh` 的 `get_node_bin()` 中加入版本检测逻辑：遍历候选路径并执行 `$cand -v`，提取主版本号确保 `>= 18`；若当前命令不满足，自动从 NVM 各版本目录及常见安装路径中匹配最新且合规的 Node 可执行文件。

---

### BUG-004: Docker 模式部署时未预创 lightdrop.config.json 引发 EISDIR 错误
- **问题现象**: 首次执行 `./deploy.sh -m docker` 时，宿主机未预先生成 `lightdrop.config.json` 文件。Docker 执行 `-v "${CONFIG_FILE_PATH}:/app/lightdrop.config.json"` 时，由于宿主机路径不存在，Docker 守护进程自动将其作为**目录**创建。容器启动时 Node 读取该路径抛出 `EISDIR: illegal operation on a directory, read` 并崩溃退出。且后续切换为宿主机部署时，因残留该目录导致常规文件写入也全部失败。
- **根本原因**: 早期 `deploy.sh` 仅在非 Docker 模式下才初始化配置文件，而 Docker 单文件挂载要求目标宿主机文件必须事先存在。
- **修复方案**:
  1. 将配置文件初始化提升至环境初始化步骤，所有部署模式（含 Docker）均确保先行生成合规的 JSON 文件。
  2. 部署与卸载脚本中增加防错检查：若检测到 `CONFIG_FILE_PATH` 为目录，则自动清理纠正。

---

### BUG-005: 免编译独立发行包漏打包 node_modules 生产依赖
- **问题现象**: 执行 `./package.sh --binary` 生成的 `lightdrop-standalone-1.0.0.tar.gz` 在目标机器解压后运行，报 `Error: Cannot find package 'dotenv'` 等依赖缺失错误。
- **根本原因**: 打包脚本仅打包了 `dist/`、`public/`、`package.json`，遗漏了生产环境运行必需的 `node_modules` 依赖目录。
- **修复方案**: 在 `scripts/package.sh` 打包独立免编译发行包时，将当前环境构建就绪的 `node_modules` 完整归档进 `.tar.gz`，确保分发包开箱即用。

---

### BUG-006: 根目录缺少 .dockerignore 导致大体积上下文传输与模块污染
- **问题现象**: 执行 Docker 构建时，构建上下文将宿主机的 `node_modules`（172MB+）全量传输至 Docker Daemon，耗时极长；且在 `COPY . .` 时可能将宿主机的系统相关二进制覆写进容器 Alpine Linux，造成潜在架构冲突。
- **根本原因**: 项目根目录未配置 `.dockerignore`。
- **修复方案**: 在项目根目录创建标准 `.dockerignore`，明确排除 `node_modules`、`dist-packages`、`data`、`.git`、`*.log` 等非必要文件。

---

### BUG-007: 部署前未做端口占用预检
- **问题现象**: 当目标端口（如 8080）已被宿主机其他服务（如 `tunnel-client`）占用时，执行 `./deploy.sh` 会在完成全量编译、同步文件后才抛出底层 bind 错误或静默失败，体验极差。
- **根本原因**: 部署引擎未在流程早期检查端口可用性。
- **修复方案**: 在 `scripts/common.sh` 中实现跨平台端口检查函数 `is_port_in_use` 及进程检测函数 `get_process_on_port`，在 `deploy.sh` 步骤 3 提前预检：若端口被外部进程占用，直接阻断并提示用户指定可用端口（如 `-p 8088`）。

---

### BUG-008: Docker 桥接网卡网关 172.17.0.1 权限被误判为非管理员
- **问题现象**: 容器化部署后，在宿主机上通过 `curl http://127.0.0.1:8088/api/settings` 或浏览器访问，返回结果中 `isAdmin` 为 `false`，导致宿主机本机管理员无法修改系统设置。
- **根本原因**: 请求经由 Docker 端口映射进入容器后，容器内看到的来源 IP 为网桥网关 `172.17.0.1`。服务端安全策略仅将 `127.0.0.1` 和容器内部 IP 视为本机白名单，`172.17.0.1` 未被纳入本地管理员认定范围。
- **修复方案**: 在 `src/server/services/audit.service.ts` 和 `src/server/routes/settings.routes.ts` 中检测当前是否处于 Docker 容器环境（`fs.existsSync('/.dockerenv')`）。若在容器中，自动将默认网桥网关 `172.17.0.1` 纳入本地可信管理员 IP 集合。

---

### BUG-009: package.json 的 build 脚本硬编码 pnpm 阻碍跨环境构建
- **问题现象**: 在仅安装了 Node/npm 但未安装全局 `pnpm` 的机器上运行部署脚本时，`deploy.sh` 执行 `npm run build`，但其内部命令定义为 `"build": "pnpm build:client && pnpm build:server"`，导致 npm 子进程报 `sh: 1: pnpm: not found` 失败。
- **根本原因**: `package.json` 中的 `scripts` 未使用通用工具链。
- **修复方案**: 将 `package.json` 的 `"build"` 调整为 `"vite build && tsc -p tsconfig.server.json"`。由于 npm/pnpm 会自动将 `./node_modules/.bin` 置入子进程 PATH，这样无论是通过 `pnpm`、`npm`、`npx` 或任何包管理器调用均可稳定运行。同时在 `deploy.sh` 启动时将 `NODE_BIN` 所在目录导出到 PATH 中。

---

### BUG-010: Docker 模式单文件挂载在宿主机文本编辑器覆写时导致 Inode 失效
- **问题现象**: 在 Docker 部署模式下，用户在宿主机使用 `sed -i`、`vim` 等文本编辑器修改 `/var/lib/lightdrop/lightdrop.config.json` 时，容器内未能同步感知更新，热更新失效。
- **根本原因**: 单文件挂载 `-v host_file:container_file` 绑定的是宿主机文件的物理 Inode。而 `sed -i`、`vim`、VSCode 等编辑器采用“写临时文件并重命名替换”的原子写入机制，替换后宿主机生成了新的 Inode，容器内的挂载点仍停留在旧的已孤立 Inode 上。
- **修复方案**:
  1. 将配置挂载升级为**目录挂载**: 在宿主机创建 `/var/lib/lightdrop/config/` 目录，容器挂载 `-v /var/lib/lightdrop/config:/app/config`。Linux 目录挂载会完整跟踪目录下所有文件的增删与 Inode 替换。
  2. 在宿主机保留软链接 `/var/lib/lightdrop/lightdrop.config.json -> config/lightdrop.config.json`，方便用户习惯。
  3. 服务端 `config.manager.ts` 结合 `fs.watch(dir)` 目录监听与 `fs.watchFile` 周期轮询，无论用户如何修改均能在 1 秒内无感知热重载。
  4. 部署时自动同步 `storageDir`：切换为 Docker 模式时自动设置为 `/app/data`，切换为宿主机模式时自动恢复为物理路径。

---

### BUG-011: settings.json 覆盖环境变量导致模式切换路径污染
- **问题现象**: 先部署 Docker 模式，容器在数据目录创建了 `settings.json`（其中包含 `"storageDir": "/app/data"`）。卸载 Docker 后使用相同数据目录部署宿主机 Systemd 模式，Systemd 启动时虽然正确读取了主配置文件的 `/var/lib/lightdrop/data`，但随后被数据目录下的 `settings.json` 反向覆盖为 `/app/data`，导致宿主机向不存在的 `/app/data` 读写文件。
- **根本原因**: `config.manager.ts` 的 `loadInitialConfig` 无差别合并了 `settings.json` 中的所有字段，未对系统级部署参数与应用级用户偏好进行职责隔离。
- **修复方案**: 在 `src/server/config/config.manager.ts` 中明确职责边界：`storageDir` 与 `port` 属于系统部署级属性，严格以主配置文件（`lightdrop.config.json`）为单一真相源；数据目录内的 `settings.json` 仅允许持久化和覆盖应用偏好设置（如 `siteTitle`、`maxFileSizeMB`、`autoCleanupDays` 等）。

---

### BUG-012: 便携式发行包启动器 run.sh 缺少现代 Node 版本匹配
- **问题现象**: 将 `lightdrop-standalone-1.0.0.tar.gz` 解压至独立目录运行 `./run.sh` 时，终端抛出：
  ```
  file:///tmp/test-pkg/lightdrop/dist/server/app.js:54
              error: err?.message || '服务器处理异常',
                         ^
  SyntaxError: Unexpected token '.'
  ```
- **根本原因**: 便携包内预置的 `run.sh` 仅简单执行 `command -v node`，直接使用了系统过时的 Node 12，缺少与部署脚本等同的高版本检测与 NVM 检索逻辑。
- **修复方案**: 重构 `scripts/package.sh` 生成 `run.sh` 的模板，内置轻量级版本探测逻辑：按序检索环境 PATH、NVM 版本目录、`/usr/local/bin` 等位置，校验提取版本 `>= 18` 的 Node 实例并执行。

---

## 验证与验收结论 (Verification Summary)

所有 12 项缺陷均已在目标测试服务器 `root@192.0.2.10` 上逐一复现、修复并完成了完整的生命周期验证：

1. **制品打包验证 (Packaging)**:
   - `./package.sh --docker`: 成功生成 `dist-packages/lightdrop-docker-1.0.0.tar` (114.14 MB)，构建过程完全自闭环，本地缓存镜像自动清理。
   - `./package.sh --binary`: 成功生成 `dist-packages/lightdrop-standalone-1.0.0.tar.gz` (38.98 MB)，内置依赖库与自适应启动器。
2. **容器化部署与卸载 (Docker)**:
   - 一键部署成功，端口 8088 监听正常，容器健康运行。
   - 宿主机访问自动识别本地管理员权限 (`isAdmin: true`)。
   - 编辑 `/var/lib/lightdrop/config/lightdrop.config.json` 经由 `sed -i` 修改 `siteTitle`，容器内即刻热重载生效（无重启）。
   - 文件上传、历史记录查询、文件下载接口全部通过。
   - 执行 `./uninstall.sh -y` 成功停止并删除容器，数据目录安全保留，端口即刻释放。
3. **原生 Systemd 部署与卸载 (Systemd)**:
   - 一键注册系统服务并配置开机自启 (`systemctl is-active` 返回 active)。
   - 自动绑定 NVM Node 22 环境运行，无老版本语法兼容问题。
   - 配置热重载 1.5 秒内自动生效。
   - 执行 `./uninstall.sh -y` 成功注销单元与自启项，工作目录清理完毕，端口释放。
4. **原生独立进程部署与卸载 (Standalone)**:
   - 成功以后台守护进程模式启动，PID 追踪正常，日志写入稳定。
   - 文本分享接口正常交互。
   - 执行 `./uninstall.sh -y` 依据 PID 优雅退出进程并回收端口。
5. **便携式免编译运行包 (Standalone Tarball)**:
   - 在独立临时目录解压并直接运行 `./run.sh`，自动识别 Node 22 成功对外提供服务，接口响应正常。
