#!/usr/bin/env bash
# ==============================================================================
# LightDrop 跨平台智能构建与部署脚本 (Build & Deploy Script)
# 支持：
# 1. 自动识别操作系统 (macOS / Linux / Windows) 与架构
# 2. 根据系统类型动态适配生命周期管理：
#    • macOS:   launchd (LaunchAgent 系统服务，开机/登录自启，守护进程，免 root 推荐)
#    • Linux:   systemd (Systemd 系统服务，开机自启，生产推荐)
#    • Windows: task (任务计划程序静默自启) / startup (开机自启文件夹)
#    • 全平台:  docker (容器化) | pm2 (进程管理) | standalone (原生独立后台进程)
# 3. 灵活配置开机自启动 (支持命令行参数及交互式确认)
# 4. 自适应默认工作路径 (macOS: ~/Library/Application Support/LightDrop, Linux: /var/lib/lightdrop, Windows: %LOCALAPPDATA%/LightDrop)
# 5. 持久化记录部署元数据至 <工作路径>/runinfo/lightdrop-runinfo.json
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# 导入通用库
if [ -f "${SCRIPT_DIR}/common.sh" ]; then
  # shellcheck source=scripts/common.sh
  source "${SCRIPT_DIR}/common.sh"
fi

# ----------------- 环境与操作系统探测 -----------------
CURRENT_OS="$(detect_os)"
OS_PRETTY="$(get_os_pretty_name)"
DEFAULT_WORK_DIR="$(get_default_work_dir)"
NODE_BIN="$(get_node_bin)"
if [ -n "$NODE_BIN" ]; then
  export PATH="$(dirname "$NODE_BIN"):$PATH"
fi

# ----------------- 默认配置 -----------------
WORK_DIR="${DEFAULT_WORK_DIR}"
DEPLOY_MODE=""       # 留空则根据 OS 自动推荐原生最优模式
AUTOSTART=""         # 留空则在交互模式下询问，非交互默认服务模式为 true
LANG_OPT="zh"        # 默认中文
PORT=8080
DATA_DIR=""
IMAGE_TAR=""
SKIP_BUILD=false
AUTO_YES=false
ADMIN_IPS=""

# 标识名称定义
CONTAINER_NAME="lightdrop"
IMAGE_NAME="lightdrop:latest"
SERVICE_NAME="lightdrop.service"
PM2_NAME="lightdrop"
TASK_NAME="LightDrop"
PLIST_LABEL="com.lightdrop.server"
PLIST_PATH=""
VERSION="1.0.0"

if [ -f "${REPO_ROOT}/package.json" ]; then
  PKG_VER=$(json_read "${REPO_ROOT}/package.json" "version")
  [ -n "$PKG_VER" ] && VERSION="$PKG_VER"
fi

# ----------------- 帮助文档 -----------------
show_help() {
  if [ "$LANG_OPT" = "en" ]; then
    cat <<EOF
LightDrop Cross-Platform Build & Deploy Tool - v${VERSION}
Detected System: ${OS_PRETTY}

Usage:
  ./deploy.sh [OPTIONS]

Options:
  -m, --mode <MODE>          Deployment lifecycle mode:
                               • auto       - Automatically select best native mode for this OS
                               • launchd    - macOS native LaunchAgent service (macOS only)
                               • systemd    - Linux systemd system service (Linux only)
                               • task       - Windows Task Scheduler silent daemon (Windows only)
                               • startup    - Windows Startup folder auto-launcher (Windows only)
                               • docker     - Containerized deployment (Cross-platform)
                               • pm2        - PM2 process manager (Cross-platform)
                               • standalone - Standalone background daemon (Zero external dependencies)
  -a, --autostart            Enable autostart on system boot/login
  --no-autostart             Disable autostart on system boot/login
  -w, --workdir <DIR>        Working directory path (Default for this OS: ${DEFAULT_WORK_DIR})
  -l, --lang <zh|en>         Installation language: zh (Chinese, Default) | en (English)
  -p, --port <PORT>          Service HTTP listening port (Default: 8080)
  -d, --data-dir <DIR>       Persistent data directory (Default: <WORKDIR>/data)
  --admin-ips <IP_LIST>      Allowed admin IP list (comma-separated, e.g. "192.168.1.100,10.0.0.*")
  --image-tar <FILE>         Import pre-built Docker image .tar directly without rebuilding
  --skip-build               Skip frontend/backend compilation step
  -y, --yes                  Non-interactive mode, apply defaults or arguments directly
  -h, --help                 Show this help information

Examples:
  ./deploy.sh                                    # Interactive deployment wizard
  ./deploy.sh -m auto                            # Deploy with best native mode on current OS
  ./deploy.sh -m docker -p 8080 --autostart      # Deploy via Docker with autostart enabled
  ./deploy.sh -m standalone --no-autostart -y    # Deploy standalone daemon without autostart
EOF
  else
    cat <<EOF
LightDrop 跨平台构建与部署工具 - v${VERSION}
检测到当前系统: ${OS_PRETTY}

用法:
  ./deploy.sh [选项]

选项:
  -m, --mode <模式>          指定生命周期与部署方式:
                               • auto       - 自动选择适配当前系统的原生最优模式 (推荐)
                               • launchd    - macOS LaunchAgent 守护服务 (仅 macOS, 开机/登录自启, 免 root)
                               • systemd    - Linux Systemd 系统服务 (仅 Linux, 开机自启, 生产标准)
                               • task       - Windows 任务计划程序 (仅 Windows, 静默常驻, 开机自启)
                               • startup    - Windows 开机自启文件夹 (仅 Windows, 用户级免提权)
                               • docker     - Docker 容器化部署 (跨平台)
                               • pm2        - PM2 进程守护管理 (跨平台)
                               • standalone - 原生独立后台常驻进程 (零额外组件依赖)
  -a, --autostart            开启系统开机/登录自启动
  --no-autostart             关闭开机自启动 (仅手动启动)
  -w, --workdir <路径>       工作目录 (当前系统自适应默认: ${DEFAULT_WORK_DIR})
  -l, --lang <zh|en>         选择安装语言: zh (简体中文, 默认) | en (English)
  -p, --port <端口>          服务监听端口 (默认: 8080)
  -d, --data-dir <路径>      数据持久化目录 (默认: <工作路径>/data)
  --admin-ips <IP列表>       允许配置服务器的管理员 IP 列表 (逗号分隔，如 "192.168.1.100,10.0.0.*")
  --image-tar <文件>         使用导出的 Docker 镜像 .tar 文件直接导入
  --skip-build               跳过源码编译步骤
  -y, --yes                  非交互模式，全部使用默认参数或命令行传入参数
  -h, --help                 显示此帮助信息

示例:
  ./deploy.sh                                    # 启动跨平台交互式引导向导
  ./deploy.sh -m auto                            # 自动以当前系统原生最优服务部署
  ./deploy.sh -m docker -p 8080 --autostart      # 容器化部署并开启开机自启
  ./deploy.sh -m standalone --no-autostart -y    # 静默部署独立进程且不自启
EOF
  fi
  exit 0
}

# ----------------- 解析命令行参数 -----------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode)
      DEPLOY_MODE="$2"
      shift 2
      ;;
    -a|--autostart)
      AUTOSTART=true
      shift
      ;;
    --no-autostart|--disable-autostart)
      AUTOSTART=false
      shift
      ;;
    -w|--workdir)
      WORK_DIR="$2"
      shift 2
      ;;
    -l|--lang)
      LANG_OPT="$2"
      shift 2
      ;;
    -p|--port)
      PORT="$2"
      shift 2
      ;;
    -d|--data-dir)
      DATA_DIR="$2"
      shift 2
      ;;
    --admin-ips)
      ADMIN_IPS="$2"
      shift 2
      ;;
    --image-tar)
      IMAGE_TAR="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
      ;;
    -h|--help)
      show_help
      ;;
    *)
      log_warn "未知参数: $1"
      show_help
      ;;
  esac
done

# ----------------- 交互式配置向导 (Wizard) -----------------
is_interactive() {
  [ -t 0 ] && [ "$AUTO_YES" = false ]
}

if is_interactive; then
  # 1. 语言选择
  echo ""
  echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║  🌐 请选择语言 / Select Language                               ║${RESET}"
  echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
  echo -e "║  ${BOLD}[1]${RESET} 简体中文 (默认 / Default)                                  ║"
  echo -e "║  ${BOLD}[2]${RESET} English                                                    ║"
  echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
  read -r -p "请输入选项 [1-2] (默认: 1): " lang_choice
  case "$lang_choice" in
    2|[eE][nN]*)
      LANG_OPT="en"
      ;;
    *)
      LANG_OPT="zh"
      ;;
  esac

  # 2. 显示检测到的操作系统
  echo ""
  if [ "$LANG_OPT" = "en" ]; then
    echo -e "  ${CYAN}🖥️  Detected OS:${RESET} ${BOLD}${OS_PRETTY}${RESET}"
  else
    echo -e "  ${CYAN}🖥️  检测到当前系统:${RESET} ${BOLD}${OS_PRETTY}${RESET}"
  fi

  # 3. 部署方式选择 (根据检测到的操作系统动态呈现针对性的菜单)
  if [ -z "$DEPLOY_MODE" ] || [ "$DEPLOY_MODE" = "auto" ]; then
    echo ""
    if [ "$CURRENT_OS" = "macos" ]; then
      if [ "$LANG_OPT" = "en" ]; then
        echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}${BOLD}║  🚀 Select Deployment Mode for macOS                           ║${RESET}"
        echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
        echo -e "║  ${BOLD}[1]${RESET} launchd    - macOS LaunchAgent Service (Recommended)        ║"
        echo -e "║  ${BOLD}[2]${RESET} docker     - Docker Container                               ║"
        echo -e "║  ${BOLD}[3]${RESET} pm2        - PM2 Process Manager                            ║"
        echo -e "║  ${BOLD}[4]${RESET} standalone - Standalone Background Process                  ║"
        echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
        read -r -p "Enter choice [1-4] (Default: 1 - launchd): " mode_choice
      else
        echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}${BOLD}║  🚀 请选择适配 macOS 的生命周期部署方式                        ║${RESET}"
        echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
        echo -e "║  ${BOLD}[1]${RESET} launchd    - macOS LaunchAgent 守护服务 (系统原生，推荐)    ║"
        echo -e "║  ${BOLD}[2]${RESET} docker     - Docker 容器化部署                              ║"
        echo -e "║  ${BOLD}[3]${RESET} pm2        - PM2 进程守护管理                               ║"
        echo -e "║  ${BOLD}[4]${RESET} standalone - 原生独立后台进程                               ║"
        echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
        read -r -p "请输入选项 [1-4] (默认: 1 - launchd): " mode_choice
      fi

      case "$mode_choice" in
        2|docker)     DEPLOY_MODE="docker" ;;
        3|pm2)        DEPLOY_MODE="pm2" ;;
        4|standalone) DEPLOY_MODE="standalone" ;;
        *)            DEPLOY_MODE="launchd" ;;
      esac

    elif [ "$CURRENT_OS" = "windows" ]; then
      if [ "$LANG_OPT" = "en" ]; then
        echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}${BOLD}║  🚀 Select Deployment Mode for Windows                         ║${RESET}"
        echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
        echo -e "║  ${BOLD}[1]${RESET} task       - Windows Task Scheduler (Recommended)           ║"
        echo -e "║  ${BOLD}[2]${RESET} startup    - Windows Startup Folder Auto-Launcher           ║"
        echo -e "║  ${BOLD}[3]${RESET} docker     - Docker Container                               ║"
        echo -e "║  ${BOLD}[4]${RESET} pm2        - PM2 Process Manager                            ║"
        echo -e "║  ${BOLD}[5]${RESET} standalone - Standalone Background Process                  ║"
        echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
        read -r -p "Enter choice [1-5] (Default: 1 - task): " mode_choice
      else
        echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}${BOLD}║  🚀 请选择适配 Windows 的生命周期部署方式                      ║${RESET}"
        echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
        echo -e "║  ${BOLD}[1]${RESET} task       - Windows 任务计划程序守护 (推荐，静默常驻)       ║"
        echo -e "║  ${BOLD}[2]${RESET} startup    - Windows 开机自启文件夹 (免管理员权限)          ║"
        echo -e "║  ${BOLD}[3]${RESET} docker     - Docker 容器化部署                              ║"
        echo -e "║  ${BOLD}[4]${RESET} pm2        - PM2 进程守护管理                               ║"
        echo -e "║  ${BOLD}[5]${RESET} standalone - 原生独立后台进程                               ║"
        echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
        read -r -p "请输入选项 [1-5] (默认: 1 - task): " mode_choice
      fi

      case "$mode_choice" in
        2|startup)    DEPLOY_MODE="startup" ;;
        3|docker)     DEPLOY_MODE="docker" ;;
        4|pm2)        DEPLOY_MODE="pm2" ;;
        5|standalone) DEPLOY_MODE="standalone" ;;
        *)            DEPLOY_MODE="task" ;;
      esac

    else
      # Linux 及通用系统
      if [ "$LANG_OPT" = "en" ]; then
        echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}${BOLD}║  🚀 Select Deployment Mode for Linux                           ║${RESET}"
        echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
        echo -e "║  ${BOLD}[1]${RESET} systemd    - Linux Systemd Service (Recommended)            ║"
        echo -e "║  ${BOLD}[2]${RESET} docker     - Docker Container                               ║"
        echo -e "║  ${BOLD}[3]${RESET} pm2        - PM2 Process Manager                            ║"
        echo -e "║  ${BOLD}[4]${RESET} standalone - Standalone Background Process                  ║"
        echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
        read -r -p "Enter choice [1-4] (Default: 1 - systemd): " mode_choice
      else
        echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}${BOLD}║  🚀 请选择适配 Linux 的生命周期部署方式                        ║${RESET}"
        echo -e "${CYAN}${BOLD}╠════════════════════════════════════════════════════════════════╣${RESET}"
        echo -e "║  ${BOLD}[1]${RESET} systemd    - Linux Systemd 系统服务 (生产推荐)              ║"
        echo -e "║  ${BOLD}[2]${RESET} docker     - Docker 容器化部署                              ║"
        echo -e "║  ${BOLD}[3]${RESET} pm2        - PM2 进程守护管理                               ║"
        echo -e "║  ${BOLD}[4]${RESET} standalone - 原生独立后台进程                               ║"
        echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${RESET}"
        read -r -p "请输入选项 [1-4] (默认: 1 - systemd): " mode_choice
      fi

      case "$mode_choice" in
        2|docker)     DEPLOY_MODE="docker" ;;
        3|pm2)        DEPLOY_MODE="pm2" ;;
        4|standalone) DEPLOY_MODE="standalone" ;;
        *)            DEPLOY_MODE="systemd" ;;
      esac
    fi
  fi

  # 4. 开机自启动配置确认
  if [ -z "$AUTOSTART" ]; then
    echo ""
    if [ "$LANG_OPT" = "en" ]; then
      read -r -p "Enable autostart on system boot/login? [Y/n] (Default: Y): " autostart_input
    else
      read -r -p "是否配置系统开机/登录自启动？[Y/n] (默认: Y 开启): " autostart_input
    fi
    case "$autostart_input" in
      [nN]|[nN][oO])
        AUTOSTART=false
        ;;
      *)
        AUTOSTART=true
        ;;
    esac
  fi

  # 5. 工作路径确认 (根据操作系统自适应默认值)
  if [ "$WORK_DIR" = "$DEFAULT_WORK_DIR" ]; then
    if [ "$LANG_OPT" = "en" ]; then
      read -r -p "Working directory [Default: ${DEFAULT_WORK_DIR}]: " input_workdir
    else
      read -r -p "工作路径 [默认: ${DEFAULT_WORK_DIR}]: " input_workdir
    fi
    if [ -n "$input_workdir" ]; then
      WORK_DIR="$input_workdir"
    fi
  fi

  # 6. 运行端口
  if [ "$PORT" = "8080" ]; then
    if [ "$LANG_OPT" = "en" ]; then
      read -r -p "Listening Port [Default: 8080]: " input_port
    else
      read -r -p "运行端口 [默认: 8080]: " input_port
    fi
    if [ -n "$input_port" ]; then
      PORT="$input_port"
    fi
  fi

  # 7. 管理员 IP 授权 (可选)
  if [ -z "$ADMIN_IPS" ]; then
    echo ""
    if [ "$LANG_OPT" = "en" ]; then
      read -r -p "Admin IP list (Optional, comma-separated, e.g. 192.168.1.100, leave blank for host only): " input_admin_ips
    else
      read -r -p "管理员 IP 列表 (可选，逗号分隔，如 192.168.1.100,10.0.0.*，留空则仅宿主机为管理员): " input_admin_ips
    fi
    if [ -n "$input_admin_ips" ]; then
      ADMIN_IPS="$input_admin_ips"
    fi
  fi
fi

# ----------------- 非交互/命令行参数自动推断 -----------------
if [ -z "$DEPLOY_MODE" ] || [ "$DEPLOY_MODE" = "auto" ]; then
  case "$CURRENT_OS" in
    macos)
      DEPLOY_MODE="launchd"
      ;;
    linux)
      if command -v systemctl >/dev/null 2>&1; then
        DEPLOY_MODE="systemd"
      elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        DEPLOY_MODE="docker"
      else
        DEPLOY_MODE="standalone"
      fi
      ;;
    windows)
      DEPLOY_MODE="task"
      ;;
    *)
      DEPLOY_MODE="standalone"
      ;;
  esac
fi

# 开机自启动默认值推断
if [ -z "$AUTOSTART" ]; then
  case "$DEPLOY_MODE" in
    launchd|systemd|task|startup|docker)
      AUTOSTART=true
      ;;
    *)
      AUTOSTART=false
      ;;
  esac
fi

# 模式平台兼容性检查
case "$DEPLOY_MODE" in
  launchd)
    if [ "$CURRENT_OS" != "macos" ]; then
      log_error "模式 launchd 仅适用于 macOS。当前操作系统: ${OS_PRETTY}"
      exit 1
    fi
    ;;
  systemd)
    if [ "$CURRENT_OS" != "linux" ]; then
      log_error "模式 systemd 仅适用于 Linux。当前操作系统: ${OS_PRETTY}"
      if [ "$CURRENT_OS" = "macos" ]; then
        log_info "在 macOS 上建议使用原生模式: -m launchd"
      elif [ "$CURRENT_OS" = "windows" ]; then
        log_info "在 Windows 上建议使用原生模式: -m task"
      fi
      exit 1
    fi
    ;;
  task|startup)
    if [ "$CURRENT_OS" != "windows" ]; then
      log_error "模式 ${DEPLOY_MODE} 仅适用于 Windows。当前操作系统: ${OS_PRETTY}"
      exit 1
    fi
    ;;
esac

# 规范化路径
if [ -z "$DATA_DIR" ]; then
  DATA_DIR="${WORK_DIR}/data"
fi

RUNINFO_DIR="${WORK_DIR}/runinfo"
RUNINFO_FILE="${RUNINFO_DIR}/lightdrop-runinfo.json"
APP_DIR="${WORK_DIR}/app"
LOG_DIR="${WORK_DIR}/logs"
PID_FILE="${RUNINFO_DIR}/lightdrop.pid"
CONFIG_DIR="${WORK_DIR}/config"
CONFIG_FILE_PATH="${CONFIG_DIR}/lightdrop.config.json"

# macOS LaunchAgent 路径推导
if [ "$CURRENT_OS" = "macos" ]; then
  if [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]; then
    PLIST_PATH="/Library/LaunchAgents/${PLIST_LABEL}.plist"
  else
    PLIST_PATH="${HOME}/Library/LaunchAgents/${PLIST_LABEL}.plist"
  fi
fi

# ----------------- 打印部署横幅 -----------------
echo ""
if [ "$LANG_OPT" = "en" ]; then
  print_banner "LightDrop Deployment Engine v${VERSION}" "OS: ${OS_PRETTY} | Mode: ${DEPLOY_MODE} | Autostart: ${AUTOSTART}"
else
  print_banner "LightDrop 跨平台部署引擎 v${VERSION}" "系统: ${OS_PRETTY} | 模式: ${DEPLOY_MODE} | 开机自启: ${AUTOSTART}"
fi

# ----------------- 步骤 1: 检查环境并初始化工作目录 -----------------
if [ "$LANG_OPT" = "en" ]; then
  log_step "1/5" "Initializing working directory and environment..."
else
  log_step "1/5" "检查环境并初始化工作目录结构..."
fi

log_info "操作系统: ${OS_PRETTY}"
log_info "工作路径: ${WORK_DIR}"
log_info "数据目录: ${DATA_DIR}"
log_info "开机自启: $([ "$AUTOSTART" = true ] && echo "已启用 (Enabled)" || echo "未启用 (Disabled)")"

if ! ensure_writable_dir "${WORK_DIR}"; then
  log_error "无法写入工作路径: ${WORK_DIR}。请使用管理员权限或指定用户可写目录 (-w)"
  exit 1
fi

mkdir -p "${DATA_DIR}/files"
mkdir -p "${CONFIG_DIR}"
mkdir -p "${RUNINFO_DIR}"
mkdir -p "${LOG_DIR}"

if [ -f "${WORK_DIR}/lightdrop.config.json" ] && [ ! -L "${WORK_DIR}/lightdrop.config.json" ]; then
  if [ ! -f "${CONFIG_FILE_PATH}" ]; then
    cp -f "${WORK_DIR}/lightdrop.config.json" "${CONFIG_FILE_PATH}"
  fi
  rm -f "${WORK_DIR}/lightdrop.config.json"
fi
ln -sf "config/lightdrop.config.json" "${WORK_DIR}/lightdrop.config.json" 2>/dev/null || true

if [ "$CURRENT_OS" = "macos" ] && [ "$DEPLOY_MODE" = "launchd" ]; then
  mkdir -p "$(dirname "${PLIST_PATH}")"
fi

log_success "工作路径与运行目录就绪"

# ----------------- 步骤 2: 源码构建 -----------------
if [ "$LANG_OPT" = "en" ]; then
  log_step "2/5" "Building application source code..."
else
  log_step "2/5" "编译构建前端与后端应用程序..."
fi

if [ -n "$IMAGE_TAR" ] && [ "$DEPLOY_MODE" = "docker" ]; then
  log_info "已指定镜像归档包 ${IMAGE_TAR}，跳过本地源码编译"
elif [ "$SKIP_BUILD" = true ] && [ -d "${REPO_ROOT}/dist/client" ] && [ -d "${REPO_ROOT}/dist/server" ]; then
  log_info "已检测到已有构建产物，跳过编译步骤 (--skip-build)"
else
  cd "${REPO_ROOT}"
  if [ ! -d "${REPO_ROOT}/node_modules" ]; then
    log_info "未检测到项目依赖库 node_modules，正在执行自动安装..."
    if command -v pnpm >/dev/null 2>&1; then
      pnpm install
    elif command -v npm >/dev/null 2>&1; then
      npm install
    fi
  fi
  rm -f "${REPO_ROOT}/tsconfig.server.tsbuildinfo" "${REPO_ROOT}/tsconfig.client.tsbuildinfo"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm build
  elif command -v npm >/dev/null 2>&1; then
    npm run build
  else
    log_error "未检测到 Node.js 包管理器 (pnpm/npm)"
    exit 1
  fi
  log_success "应用全量编译完成"
fi

# ----------------- 步骤 3: 准备运行环境与应用产物 -----------------
if [ "$LANG_OPT" = "en" ]; then
  log_step "3/5" "Preparing runtime distribution assets..."
else
  log_step "3/5" "同步分发产物与应用引导配置..."
fi

# 端口可用性预检
if is_port_in_use "${PORT}"; then
  OCCUPY_INFO="$(get_process_on_port "${PORT}")"
  IS_OWN_SERVICE=false
  if [ "$DEPLOY_MODE" = "docker" ] && command -v docker >/dev/null 2>&1; then
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Eq "^${CONTAINER_NAME}\$"; then
      IS_OWN_SERVICE=true
    fi
  elif [ "$DEPLOY_MODE" = "systemd" ] && command -v systemctl >/dev/null 2>&1; then
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
      IS_OWN_SERVICE=true
    fi
  elif [ "$DEPLOY_MODE" = "launchd" ] && command -v launchctl >/dev/null 2>&1; then
    if launchctl list 2>/dev/null | grep -q "${PLIST_LABEL}"; then
      IS_OWN_SERVICE=true
    fi
  elif [ -f "${PID_FILE}" ]; then
    OLD_PID=$(cat "${PID_FILE}" 2>/dev/null || true)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      IS_OWN_SERVICE=true
    fi
  fi

  if [ "$IS_OWN_SERVICE" != true ]; then
    log_error "目标端口 ${PORT} 已被其他外部程序占用: ${OCCUPY_INFO:-未知进程}"
    log_info "提示: 请使用 -p 参数指定可用端口，例如: ./deploy.sh -p 8088"
    exit 1
  fi
fi

APP_PID=""

# 如果配置文件路径误为目录 (常见于早期未生成文件时被 Docker 挂载创建为目录)，安全移除
if [ -d "${CONFIG_FILE_PATH}" ]; then
  log_warn "检测到配置文件路径误为目录 (可能由早期异常容器挂载残留)，正在自动纠正..."
  rm -rf "${CONFIG_FILE_PATH}"
fi

# 解析 ADMIN_IPS 转为 JSON array
ADMIN_IPS_JSON="[]"
if [ -n "$ADMIN_IPS" ]; then
  ADMIN_IPS_JSON=$(echo "$ADMIN_IPS" | awk -F',' '{
    printf "["
    count = 0
    for (i=1; i<=NF; i++) {
      gsub(/^[ \t]+|[ \t]+$/, "", $i)
      if (length($i) > 0) {
        if (count > 0) printf ", "
        printf "\"%s\"", $i
        count++
      }
    }
    printf "]"
  }')
fi

# 写入主配置文件 lightdrop.config.json (支持免重启热更新，Docker与宿主机均生成)
CONFIG_STORAGE_DIR="${DATA_DIR}"
[ "$DEPLOY_MODE" = "docker" ] && CONFIG_STORAGE_DIR="/app/data"

if [ ! -f "${CONFIG_FILE_PATH}" ]; then
  cat <<BOOTSTRAP_JSON > "${CONFIG_FILE_PATH}"
{
  "storageDir": "${CONFIG_STORAGE_DIR}",
  "port": ${PORT},
  "maxFileSizeMB": 1024,
  "autoCleanupDays": 7,
  "siteTitle": "LightDrop",
  "adminIps": ${ADMIN_IPS_JSON}
}
BOOTSTRAP_JSON
else
  log_info "更新现有配置文件中的参数与管理员 IP 列表..."
  local_node="$(get_node_bin)"
  "${local_node:-node}" -e '
    const fs = require("fs");
    const p = process.argv[1];
    const targetStorage = process.argv[2];
    const targetPort = parseInt(process.argv[3], 10);
    const ips = JSON.parse(process.argv[4] || "[]");
    try {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      cfg.storageDir = targetStorage;
      if (targetPort) cfg.port = targetPort;
      if (ips.length > 0) cfg.adminIps = ips;
      fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf8");
    } catch(e) {}
  ' "${CONFIG_FILE_PATH}" "${CONFIG_STORAGE_DIR}" "${PORT}" "${ADMIN_IPS_JSON}" 2>/dev/null || true
fi

# 非 Docker 模式下，将应用产物同步至工作路径的 app 目录
if [ "$DEPLOY_MODE" != "docker" ]; then
  mkdir -p "${APP_DIR}"
  log_info "同步应用产物至目标目录: ${APP_DIR}..."
  rm -rf "${APP_DIR}/dist" "${APP_DIR}/public"
  cp -r "${REPO_ROOT}/dist" "${APP_DIR}/"
  cp -r "${REPO_ROOT}/public" "${APP_DIR}/"
  cp "${REPO_ROOT}/package.json" "${APP_DIR}/"
  cp "${REPO_ROOT}/ecosystem.config.cjs" "${APP_DIR}/"
  if [ -f "${REPO_ROOT}/pnpm-lock.yaml" ]; then
    cp "${REPO_ROOT}/pnpm-lock.yaml" "${APP_DIR}/"
  fi
  cp -f "${CONFIG_FILE_PATH}" "${APP_DIR}/lightdrop.config.json"

  # 拷贝/同步 node_modules 保证独立可运行
  if [ -d "${REPO_ROOT}/node_modules" ]; then
    if [ ! -d "${APP_DIR}/node_modules" ]; then
      log_info "复制 node_modules 依赖库至部署目录..."
      cp -R "${REPO_ROOT}/node_modules" "${APP_DIR}/" 2>/dev/null || true
    else
      log_info "增量同步 node_modules 依赖库至部署目录..."
      if command -v rsync >/dev/null 2>&1; then
        rsync -a "${REPO_ROOT}/node_modules/" "${APP_DIR}/node_modules/" 2>/dev/null || true
      fi
    fi
  fi
fi

# ----------------- 步骤 4: 执行具体模式部署与生命周期装配 -----------------
if [ "$LANG_OPT" = "en" ]; then
  log_step "4/5" "Configuring lifecycle & starting service via [${DEPLOY_MODE}]..."
else
  log_step "4/5" "配置系统生命周期并以 [${DEPLOY_MODE}] 模式启动传输服务..."
fi

NODE_ENV_PATH="${PATH}"
if [ -n "$NODE_BIN" ]; then
  NODE_DIR="$(dirname "$NODE_BIN")"
  NODE_ENV_PATH="${NODE_DIR}:${PATH}"
fi

case "$DEPLOY_MODE" in
  # ----------------- macOS 原生 launchd (LaunchAgent) -----------------
  launchd)
    if [ -z "$NODE_BIN" ]; then
      log_error "系统未找到 node 可执行程序，无法注册 LaunchAgent"
      exit 1
    fi

    log_info "停止已有的 LaunchAgent 实例 (如果存在)..."
    launchctl unload -w "${PLIST_PATH}" 2>/dev/null || true

    log_info "生成 macOS LaunchAgent 属性列表文件: ${PLIST_PATH}..."
    RUN_AT_LOAD_TAG="<false/>"
    if [ "$AUTOSTART" = true ]; then
      RUN_AT_LOAD_TAG="<true/>"
    fi

    cat <<PLIST_EOF > "${PLIST_PATH}"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${APP_DIR}/dist/server/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${APP_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>${PORT}</string>
        <key>PATH</key>
        <string>${NODE_ENV_PATH}</string>
        <key>LIGHTDROP_CONFIG_PATH</key>
        <string>${CONFIG_FILE_PATH}</string>
    </dict>
    <key>RunAtLoad</key>
    ${RUN_AT_LOAD_TAG}
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/app.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/error.log</string>
</dict>
</plist>
PLIST_EOF

    log_info "加载并注册 macOS LaunchAgent 服务..."
    launchctl load -w "${PLIST_PATH}"
    launchctl start "${PLIST_LABEL}" 2>/dev/null || true

    sleep 1.5
    if launchctl list | grep -q "${PLIST_LABEL}"; then
      log_success "macOS LaunchAgent 服务已成功激活并运行 (${PLIST_LABEL})"
      if [ "$AUTOSTART" = true ]; then
        log_success "已配置 macOS 登录开机自启动 (RunAtLoad: true)"
      else
        log_info "开机自启动未配置 (RunAtLoad: false)"
      fi
    else
      log_error "LaunchAgent 启动状态异常，日志如下:"
      tail -n 20 "${LOG_DIR}/error.log" 2>/dev/null || tail -n 20 "${LOG_DIR}/app.log" || true
      exit 1
    fi
    ;;

  # ----------------- Linux 原生 systemd -----------------
  systemd)
    if ! command -v systemctl >/dev/null 2>&1; then
      log_error "当前环境不支持 systemctl"
      exit 1
    fi

    if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
      NODE_BIN="$(get_node_bin)"
    fi
    if [ -z "$NODE_BIN" ]; then
      log_error "未找到支持的 Node.js (>= 18.0.0)。请先安装 Node.js 18+ 或使用 NVM。"
      exit 1
    fi

    SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
    USE_USER_SYSTEMD=false

    # 判断是否具备 root/sudo 权限
    if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
      USE_USER_SYSTEMD=true
      SERVICE_PATH="${HOME}/.config/systemd/user/${SERVICE_NAME}"
      mkdir -p "$(dirname "${SERVICE_PATH}")"
    fi

    log_info "生成 Systemd 单元配置文件: ${SERVICE_PATH}..."
    cat <<SYSTEMD_UNIT | ([ "$USE_USER_SYSTEMD" = true ] && tee "${SERVICE_PATH}" >/dev/null || sudo tee "${SERVICE_PATH}" >/dev/null)
[Unit]
Description=LightDrop LAN File Sharing Service
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} dist/server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=PATH=${NODE_ENV_PATH}
Environment=LIGHTDROP_CONFIG_PATH=${CONFIG_FILE_PATH}

[Install]
WantedBy=multi-user.target
SYSTEMD_UNIT

    log_info "重载 Systemd 并启动服务..."
    if [ "$USE_USER_SYSTEMD" = true ]; then
      systemctl --user daemon-reload
      if [ "$AUTOSTART" = true ]; then
        systemctl --user enable "${SERVICE_NAME}"
      else
        systemctl --user disable "${SERVICE_NAME}" 2>/dev/null || true
      fi
      systemctl --user restart "${SERVICE_NAME}"
      sleep 1
      if systemctl --user is-active --quiet "${SERVICE_NAME}"; then
        log_success "User Systemd 服务已激活 (${SERVICE_NAME})"
      else
        log_error "Systemd 服务启动失败"
        exit 1
      fi
    else
      sudo systemctl daemon-reload
      if [ "$AUTOSTART" = true ]; then
        sudo systemctl enable "${SERVICE_NAME}"
      else
        sudo systemctl disable "${SERVICE_NAME}" 2>/dev/null || true
      fi
      sudo systemctl restart "${SERVICE_NAME}"
      sleep 1
      if sudo systemctl is-active --quiet "${SERVICE_NAME}"; then
        log_success "Systemd 服务已激活并正在运行 (${SERVICE_NAME})"
        if [ "$AUTOSTART" = true ]; then
          log_success "已配置 Linux 开机自启动 (systemctl enable)"
        fi
      else
        log_error "Systemd 服务启动失败，请检查 journalctl -u ${SERVICE_NAME}"
        exit 1
      fi
    fi
    ;;

  # ----------------- Windows 任务计划程序 (Task Scheduler) -----------------
  task)
    log_info "配置 Windows 任务计划程序静默守护服务..."

    # 生成静默执行脚本 run_silent.vbs
    cat <<VBS_EOF > "${APP_DIR}/run_silent.vbs"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${APP_DIR}"
WshShell.Environment("PROCESS")("PORT") = "${PORT}"
WshShell.Environment("PROCESS")("NODE_ENV") = "production"
WshShell.Environment("PROCESS")("LIGHTDROP_CONFIG_PATH") = "${CONFIG_FILE_PATH}"
WshShell.Run """${NODE_BIN}"" dist/server/index.js", 0, False
VBS_EOF

    # 停止已有任务
    schtasks //End //TN "${TASK_NAME}" 2>/dev/null || true
    schtasks //Delete //TN "${TASK_NAME}" //F 2>/dev/null || true

    # 注册计划任务
    if [ "$AUTOSTART" = true ]; then
      log_info "创建开机/登录自启计划任务: ${TASK_NAME}..."
      schtasks //Create //TN "${TASK_NAME}" //TR "wscript.exe \"${APP_DIR}/run_silent.vbs\"" //SC ONLOGON //F
    else
      log_info "创建手动计划任务: ${TASK_NAME}..."
      schtasks //Create //TN "${TASK_NAME}" //TR "wscript.exe \"${APP_DIR}/run_silent.vbs\"" //SC ONCE //ST 00:00 //F
    fi

    # 立即触发运行
    schtasks //Run //TN "${TASK_NAME}" 2>/dev/null || true
    log_success "Windows 任务计划程序已成功注册并运行 (${TASK_NAME})"
    ;;

  # ----------------- Windows 开机自启文件夹 (Startup) -----------------
  startup)
    log_info "配置 Windows 用户启动项..."
    STARTUP_DIR="${APPDATA}/Microsoft/Windows/Start Menu/Programs/Startup"
    STARTUP_VBS="${STARTUP_DIR}/LightDrop.vbs"

    cat <<VBS_EOF > "${APP_DIR}/run_silent.vbs"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${APP_DIR}"
WshShell.Environment("PROCESS")("PORT") = "${PORT}"
WshShell.Environment("PROCESS")("NODE_ENV") = "production"
WshShell.Environment("PROCESS")("LIGHTDROP_CONFIG_PATH") = "${CONFIG_FILE_PATH}"
WshShell.Run """${NODE_BIN}"" dist/server/index.js", 0, False
VBS_EOF

    if [ "$AUTOSTART" = true ] && [ -d "${STARTUP_DIR}" ]; then
      cp "${APP_DIR}/run_silent.vbs" "${STARTUP_VBS}"
      log_success "已写入 Windows 开机自启动文件夹: ${STARTUP_VBS}"
    fi

    # 启动后台服务
    if command -v wscript.exe >/dev/null 2>&1; then
      wscript.exe "${APP_DIR}/run_silent.vbs"
    elif command -v cscript.exe >/dev/null 2>&1; then
      cscript.exe //nologo "${APP_DIR}/run_silent.vbs" &
    else
      nohup "${NODE_BIN}" dist/server/index.js </dev/null > "${LOG_DIR}/app.log" 2>&1 &
    fi
    log_success "Windows 服务实例已静默启动"
    ;;

  # ----------------- Docker 容器化部署 -----------------
  docker)
    if ! command -v docker >/dev/null 2>&1; then
      log_error "系统未安装 docker 工具，无法使用容器化部署模式"
      exit 1
    fi
    if ! docker info >/dev/null 2>&1; then
      log_error "Docker 守护进程未启动，请先启动 Docker 服务"
      exit 1
    fi

    if [ -n "$IMAGE_TAR" ] && [ -f "$IMAGE_TAR" ]; then
      log_info "正在从本地 TAR 包载入 Docker 镜像: ${IMAGE_TAR}..."
      docker load -i "${IMAGE_TAR}"
    else
      if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
        log_info "本地未检索到镜像 ${IMAGE_NAME}，正在执行构建..."
        docker build -t "${IMAGE_NAME}" -f "${REPO_ROOT}/Dockerfile" "${REPO_ROOT}"
      fi
    fi

    if docker ps -a --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
      log_info "发现已有容器 ${CONTAINER_NAME}，正在停止并清理..."
      docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    fi

    RESTART_POLICY="no"
    if [ "$AUTOSTART" = true ]; then
      RESTART_POLICY="unless-stopped"
    fi

    log_info "正在启动 Docker 容器: ${CONTAINER_NAME} (重启策略: ${RESTART_POLICY}, 端口: ${PORT})..."
    docker run -d \
      --name "${CONTAINER_NAME}" \
      --restart "${RESTART_POLICY}" \
      -p "${PORT}:8080" \
      -v "${DATA_DIR}:/app/data" \
      -v "${CONFIG_DIR}:/app/config" \
      -e LIGHTDROP_CONFIG_PATH=/app/config/lightdrop.config.json \
      -e PORT=8080 \
      -e NODE_ENV=production \
      "${IMAGE_NAME}" >/dev/null

    sleep 2
    if docker ps --filter "name=^${CONTAINER_NAME}\$" --format '{{.Status}}' | grep -qi "Up"; then
      log_success "Docker 容器启动成功并正在稳定运行"
    else
      log_error "Docker 容器状态异常，错误日志:"
      docker logs --tail 20 "${CONTAINER_NAME}" || true
      exit 1
    fi
    ;;

  # ----------------- PM2 进程守护管理 -----------------
  pm2)
    if ! command -v pm2 >/dev/null 2>&1; then
      log_error "未检测到 pm2 命令行工具。请运行 npm install -g pm2 或选择 standalone 模式"
      exit 1
    fi

    cd "${APP_DIR}"
    pm2 delete "${PM2_NAME}" >/dev/null 2>&1 || true
    LIGHTDROP_CONFIG_PATH="${CONFIG_FILE_PATH}" PORT="${PORT}" pm2 start ecosystem.config.cjs --name "${PM2_NAME}" --env production --update-env
    pm2 save >/dev/null 2>&1 || true

    if [ "$AUTOSTART" = true ]; then
      log_info "正在配置 PM2 开机自启动..."
      pm2 startup 2>/dev/null || log_info "提示: 如需系统级持久开机自启，请按终端提示运行 sudo env PATH... 指令"
      pm2 save >/dev/null 2>&1 || true
    fi
    log_success "PM2 服务进程托管成功: ${PM2_NAME}"
    ;;

  # ----------------- Standalone 原生独立后台进程 -----------------
  standalone)
    log_info "准备原生后台常驻进程..."

    if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
      NODE_BIN="$(get_node_bin)"
    fi
    if [ -z "$NODE_BIN" ]; then
      log_error "未找到支持的 Node.js (>= 18.0.0)。请先安装 Node.js 18+ 或使用 NVM。"
      exit 1
    fi

    if [ -f "${PID_FILE}" ]; then
      OLD_PID=$(cat "${PID_FILE}" 2>/dev/null || true)
      if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        log_info "停止已存在的旧实例 (PID: ${OLD_PID})..."
        kill -15 "$OLD_PID" 2>/dev/null || true
        sleep 1
      fi
    fi

    cd "${APP_DIR}"
    export NODE_ENV=production
    export PORT="${PORT}"
    export LIGHTDROP_CONFIG_PATH="${CONFIG_FILE_PATH}"

    nohup "${NODE_BIN}" dist/server/index.js </dev/null > "${LOG_DIR}/app.log" 2>&1 &
    APP_PID=$!
    disown "$APP_PID" 2>/dev/null || true
    echo "$APP_PID" > "${PID_FILE}"

    sleep 1.5
    if kill -0 "$APP_PID" 2>/dev/null; then
      log_success "LightDrop 独立后台进程已成功启动 (PID: ${APP_PID})"
    else
      log_error "独立进程启动失败，错误日志如下:"
      cat "${LOG_DIR}/app.log" || true
      exit 1
    fi
    ;;

  *)
    log_error "不支持的部署模式: ${DEPLOY_MODE}"
    exit 1
    ;;
esac

# ----------------- 步骤 5: 写入运行记录与状态持久化 -----------------
if [ "$LANG_OPT" = "en" ]; then
  log_step "5/5" "Persisting deployment metadata to runinfo directory..."
else
  log_step "5/5" "记录运行信息至 ${RUNINFO_DIR} 持久化归档..."
fi

LOCAL_IP=$(get_local_ip)
ACCESS_URL="http://${LOCAL_IP}:${PORT}"
LOCAL_URL="http://localhost:${PORT}"
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

AUTOSTART_TARGET=""
case "$DEPLOY_MODE" in
  launchd)  AUTOSTART_TARGET="${PLIST_PATH}" ;;
  systemd)  AUTOSTART_TARGET="/etc/systemd/system/${SERVICE_NAME}" ;;
  task)     AUTOSTART_TARGET="${TASK_NAME}" ;;
  startup)  AUTOSTART_TARGET="${APPDATA:-}/Microsoft/Windows/Start Menu/Programs/Startup/LightDrop.vbs" ;;
  docker)   AUTOSTART_TARGET="${CONTAINER_NAME}" ;;
  pm2)      AUTOSTART_TARGET="${PM2_NAME}" ;;
esac

cat <<EOF > "${RUNINFO_FILE}"
{
  "appName": "lightdrop",
  "version": "${VERSION}",
  "os": "${CURRENT_OS}",
  "osPretty": "${OS_PRETTY}",
  "deployMode": "${DEPLOY_MODE}",
  "autostart": ${AUTOSTART},
  "autostartTarget": "${AUTOSTART_TARGET}",
  "language": "${LANG_OPT}",
  "workDir": "${WORK_DIR}",
  "dataDir": "${DATA_DIR}",
  "runInfoDir": "${RUNINFO_DIR}",
  "runInfoFile": "${RUNINFO_FILE}",
  "configFilePath": "${CONFIG_FILE_PATH}",
  "adminIps": ${ADMIN_IPS_JSON:-[]},
  "port": ${PORT},
  "containerName": "${CONTAINER_NAME}",
  "imageName": "${IMAGE_NAME}",
  "serviceName": "${SERVICE_NAME}",
  "pm2Name": "${PM2_NAME}",
  "taskName": "${TASK_NAME}",
  "plistPath": "${PLIST_PATH}",
  "pidFile": "${PID_FILE}",
  "pid": ${APP_PID:-0},
  "installedAt": "${CURRENT_TIME}",
  "sourceDir": "${REPO_ROOT}",
  "accessUrl": "${ACCESS_URL}",
  "status": "running"
}
EOF

cp -f "${RUNINFO_FILE}" "${RUNINFO_DIR}/runinfo.json"
log_success "运行记录已写入: ${RUNINFO_FILE}"

# ----------------- 最终状态展示看板 -----------------
echo -e "\n${GREEN}${BOLD}════════════════════════════════════════════════════════════════${RESET}"
if [ "$LANG_OPT" = "en" ]; then
  echo -e " ${BOLD}${GREEN}✔ LIGHTDROP DEPLOYED SUCCESSFULLY ON ${OS_PRETTY}${RESET}"
else
  echo -e " ${BOLD}${GREEN}✔ LightDrop 已成功在 ${OS_PRETTY} 完成构建与部署${RESET}"
fi
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════${RESET}"

print_card_row "操作系统 (OS)" "${BOLD}${OS_PRETTY}${RESET}"
print_card_row "部署方式 (Mode)" "${CYAN}${DEPLOY_MODE}${RESET}"
if [ "$AUTOSTART" = true ]; then
  print_card_row "开机自启 (AutoStart)" "${GREEN}● 已开启 (Enabled)${RESET}"
else
  print_card_row "开机自启 (AutoStart)" "${YELLOW}○ 未开启 (Disabled)${RESET}"
fi
print_card_row "运行状态 (Status)" "${GREEN}● 活跃运行中 (Active / Running)${RESET}"
print_card_row "本机访问 (Local)" "${BOLD}${LOCAL_URL}${RESET}"
print_card_row "局域网访问 (LAN)" "${BOLD}${GREEN}${ACCESS_URL}${RESET}"
print_card_row "工作路径 (WorkDir)" "${WORK_DIR}"
print_card_row "配置文件 (Config)" "${CONFIG_FILE_PATH} (支持免重启热更新)"
print_card_row "数据存储 (DataDir)" "${DATA_DIR}"
print_card_row "运行记录 (RunInfo)" "${RUNINFO_FILE}"
print_card_row "服务端口 (Port)" "${PORT}"

echo -e "\n${BOLD}针对当前系统的运维指令:${RESET}"
echo -e "  • 配置文件热修改: ${DIM}编辑 \"${CONFIG_FILE_PATH}\" 保存即自动生效 (免重启)${RESET}"
case "$DEPLOY_MODE" in
  launchd)
    echo -e "  • 查看实时日志: ${DIM}tail -f \"${LOG_DIR}/app.log\"${RESET}"
    echo -e "  • 重启服务:     ${DIM}launchctl unload -w \"${PLIST_PATH}\" && launchctl load -w \"${PLIST_PATH}\"${RESET}"
    echo -e "  • 停止服务:     ${DIM}launchctl unload -w \"${PLIST_PATH}\"${RESET}"
    ;;
  systemd)
    echo -e "  • 查看实时日志: ${DIM}journalctl -u ${SERVICE_NAME} -f${RESET}"
    echo -e "  • 重启服务:     ${DIM}sudo systemctl restart ${SERVICE_NAME}${RESET}"
    echo -e "  • 停止服务:     ${DIM}sudo systemctl stop ${SERVICE_NAME}${RESET}"
    ;;
  task)
    echo -e "  • 触发运行任务: ${DIM}schtasks /Run /TN \"${TASK_NAME}\"${RESET}"
    echo -e "  • 终止任务:     ${DIM}schtasks /End /TN \"${TASK_NAME}\"${RESET}"
    ;;
  docker)
    echo -e "  • 查看实时日志: ${DIM}docker logs -f ${CONTAINER_NAME}${RESET}"
    echo -e "  • 重启容器:     ${DIM}docker restart ${CONTAINER_NAME}${RESET}"
    echo -e "  • 停止容器:     ${DIM}docker stop ${CONTAINER_NAME}${RESET}"
    ;;
  pm2)
    echo -e "  • 查看实时日志: ${DIM}pm2 logs ${PM2_NAME}${RESET}"
    echo -e "  • 重启服务:     ${DIM}pm2 restart ${PM2_NAME}${RESET}"
    echo -e "  • 停止服务:     ${DIM}pm2 stop ${PM2_NAME}${RESET}"
    ;;
  standalone)
    echo -e "  • 查看实时日志: ${DIM}tail -f \"${LOG_DIR}/app.log\"${RESET}"
    echo -e "  • 停止服务:     ${DIM}kill -15 \$(cat \"${PID_FILE}\")${RESET}"
    ;;
esac

echo -e "  • 一键安全卸载: ${YELLOW}./uninstall.sh -w \"${WORK_DIR}\"${RESET}\n"
