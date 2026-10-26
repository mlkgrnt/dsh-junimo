# dsh-junimo

DeepSeek Harness 插件，为《星露谷物语》提供 37 个操控工具，并补充 MCP 层无法覆盖的部署自检与游戏生命周期管理。

## 概述

本仓库是一个 **dsh 组合包（bundle）**，作用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 profile 层。

游戏逻辑不在此实现。全部 37 个工具由 [Junimo-MCP](https://github.com/mlkgrnt/Junimo-MCP) 的 `junimo-mcp.exe`（OCaml，单文件）提供，经官方 `@deepseek-ai/dsh-mcp-client` 以 stdio MCP 协议桥接，模型侧呈现为 `mcp__junimo__<工具名>`。**本仓库不修改 Junimo-MCP 的任何代码。**

插件自身承担三项职责：

1. 装配 MCP 桥接，并提供 `junimoPaths` 服务作为 exe、skill 目录的唯一真源
2. 向系统提示词注入星露谷操作纪律，规避时序与存档类常见错误
3. 注册 4 个原生工具：诊断、窗口聚焦、游戏启动、读档

第 3 项无法由 MCP 工具实现——mod 运行于游戏进程内部，不能启动自身进程，也不能将自身窗口置前。

`junimo-mcp.exe` 已随包内置（`bin/`，v3.2.1，6 MB），安装插件后无需另行获取二进制。

## 架构

```
模型 ──mcp__junimo__*──▶ dsh-mcp-client ──stdio──▶ junimo-mcp.exe ──HTTP──▶ NagiBridge-Remix ──▶ 游戏
                              ▲                          ▲
                        dsh-junimo 装配             原样复用，未修改
                        + 4 个原生工具
```

| 组成 | 提供方 | 说明 |
|---|---|---|
| 37 个游戏工具 | `@deepseek-ai/dsh-mcp-client` + 内置 exe | 感知、移动、交互、界面、农活、箱子、社交、节日、生计 |
| 4 个原生工具 | 本插件 | `junimo_doctor` / `junimo_focus` / `junimo_game_launch` / `junimo_load_save` |
| 提示词纪律 | 本插件 | 系统提示词段落 `junimo:rules`，约 1000 字符 |
| 随包 skill | `@deepseek-ai/dsh-skill-filesystem` | `skills/junimo/`，按需加载，不占常驻上下文 |
| 参考文档 | 本插件 | `reference/game-semantics.md`，含工具速查表与已知边界 |

## 前置要求

| 项 | 要求 |
|---|---|
| 操作系统 | Windows |
| dsh | `>= 0.2.1-rc.2`（声明于 `package.json` 的 `dsh.engines`） |
| 游戏 | Stardew Valley 1.6.x |
| SMAPI | 4.x（`junimo_game_launch` 依赖它启动） |
| POSIX shell | Git for Windows 或 WSL 的 bash，用于启动游戏。缺失时退回 `cmd`，可正常启动，但会多出一个 SMAPI 控制台窗口 |
| 执行器 mod | [NagiBridge-Remix](https://github.com/pendel001/NagiBridge-Remix)，安装至 `Mods/NagiBridge/` |

SMAPI 与 mod 的安装步骤见 [Junimo-MCP 的 AGENTS.md](https://github.com/mlkgrnt/Junimo-MCP/blob/main/AGENTS.md)。

> NagiBridge-Remix 采用 PolyForm Noncommercial 1.0.0 许可，个人与非商业用途免费。本项目不打包其代码。原版 NagiBridge 与 Remix 的 UniqueID 不同，同时安装会争用 7842 端口，切换时需先移出旧目录。

## 安装

```bash
# 本地 checkout
dsh plugin --profile web add link:/path/to/dsh-junimo

# 或直接从 GitHub 安装（纯 ESM 源码，无构建步骤）
dsh plugin --profile web add github:mlkgrnt/dsh-junimo
```

`dsh plugin add` 会初始化 profile，并将本包追加至 `dsh.profile.bundles`。重启 dsh 后生效。

安装后执行 `junimo_doctor` 完成链路检查。该工具输出 exe 路径与版本、7842 端口状态、mod 响应、存档就绪状态、SMAPI 与 NagiBridge 文件完整性，以及 SMAPI 日志中的错误行。

> 从 GitHub 安装时若提示构建脚本未授权，将 pnpm 给出的包键加入 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`。本包不含构建步骤，通常不会触发。

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `JUNIMO_MCP_BIN` | 内置 `bin/junimo-mcp.exe` | 覆盖内置 exe，用于升级、回退或使用自编译版本 |
| `STARDEW_GAME_DIR` | 自动探测 | 含 `Stardew Valley.exe` 的目录；未设置时依次尝试 Steam 库与常见安装路径 |
| `STARDEW_API_URL` | `http://localhost:7842` | mod 端点。必须使用 `localhost`，`127.0.0.1` 会被系统拒绝 |
| `STARDEW_AUTO_MENU` | `1` | 透传给 exe：自动应答无选项对话 |
| `STARDEW_AUTO_EVENT` | 未设置 | 透传给 exe：自动跳过剧本事件，默认关闭 |

exe 自身的其余变量（`STARDEW_HTTP`、`STARDEW_SETTLE` 等）见 Junimo-MCP 的 README，同样可通过 `cordis.patch.yml` 中的 `env` 透传。

### 覆盖插件默认配置

profile 的 `cordis.patch.yml` 按 `id` 覆盖插件行。patch 会整体替换 `config`，需完整重述所有键：

```yaml
- insert:
    - id: junimo-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      inject: [junimoPaths]
      config:
        serverName: junimo
        transport: stdio
        command: 'D:\tools\junimo-mcp.exe'
        args: []
        env: { STARDEW_API_URL: 'http://localhost:7842' }
        cwd: 'D:\tools'
        toolCallTimeoutMs: 180000
        failOnStartupError: true
```

## 工具

### 原生工具

| 工具 | 用途 |
|---|---|
| `junimo_doctor` | 链路诊断。只读，不执行修复。操作游戏前应首先调用 |
| `junimo_focus` | 将游戏窗口置前。SDV 失焦会自动暂停，此时点击与菜单操作均不生效 |
| `junimo_game_launch` | 通过 `StardewModdingAPI.exe` 启动游戏并等待 7842 响应；已在运行时不会重复启动。SMAPI 是控制台程序，直接 spawn 会秒退，因此优先经 bash 启动，找不到 bash 才退回 `cmd` |
| `junimo_load_save` | 聚焦窗口 → 点击 Load → 点击存档格 → 轮询至 `worldReady`，失败时整轮重试 |

`junimo_load_save` 的难点在于时机而非坐标。`TitleMenu.receiveLeftClick` 在淡入与转场期间会静默丢弃点击，因此实现采用「等待界面稳定 → 点击 → 以 `worldReady` 判定 → 整轮重试」。坐标基于 1280×720 窗口模式的标题界面。

### 桥接工具

37 个 `mcp__junimo__*` 工具的完整清单、参数与注意事项见 [`reference/game-semantics.md`](./reference/game-semantics.md)。

其中 `story` 的 `choose` 在 `junimo-mcp.exe` 内部采用两段式：默认路径先向游戏登记答案，若界面未推进则自动补发一次真实点击。实机验证（宠物领养事件）选完即推进到下一幕。调用方不需要、也不应再补第二发点击。

## 维护

### 同步内置 exe

```bash
node scripts/sync-binary.mjs          # 取 Junimo-MCP 的最新 release
node scripts/sync-binary.mjs v3.2.1   # 或锁定指定 tag
```

脚本下载 exe 与官方 SHA-256，本地校验通过后才覆盖 `bin/`，并同步更新 `bin/BUNDLED_VERSION`。完成后需 `git add bin/` 并提交。

当前内置版本见 `bin/BUNDLED_VERSION`。

## 开发

### 目录结构

```
src/index.js    插件入口：junimoPaths 服务、提示词段落、4 个工具注册
src/paths.js    exe / 游戏目录 / 包内资源的解析与探测
src/api.js      NagiBridge 的最小 HTTP 客户端（探活与时序兜底）
src/doctor.js   junimo_doctor 的检查项与渲染
src/game.js     聚焦、启动、读档
skills/         随包 skill
reference/      按需读取的长文档
scripts/        维护脚本
test/           冒烟与真机验证脚本
```

源码为纯 ESM JavaScript，无构建步骤，`src/*.js` 即发布产物。

### 测试

```bash
node test/smoke.mjs                    # 离线冒烟，不需要游戏与 dsh 宿主
node test/verify-load-save.mjs         # 真机：启动游戏、读档，校验 worldReady
node test/verify-load-save.mjs --existing   # 游戏已手动启动时，仅验证读档
```

离线冒烟校验 `junimoPaths` 服务、提示词段落、4 个工具的注册结果，并执行一次 `junimo_doctor`。它依赖 `node_modules/@deepseek-ai/dsh-tools` 的本地 stub 以支持直接以 Node 运行；实际部署中该包由 dsh 宿主提供。

### 在 dsh 中验证

```bash
dsh plugin --profile <name> add link:/path/to/dsh-junimo
dsh --profile <name> --dump-config | grep -A8 junimo   # 确认三层均已进入组合
dsh --profile <name> --no-open                          # 启动；出现 "entries did not activate" 即为异常
```

## 已知限制

- **仅支持 Windows**。窗口聚焦、进程启动与读档依赖 PowerShell 与 user32；其它平台会返回明确错误。
- **读档坐标绑定 1280×720 标题界面**。已在窗口模式实机验证；其它分辨率需换算，参见 `src/game.js` 注释。
- **内置的 `junimo-mcp.exe` 为 Junimo-MCP 的发布产物**（MIT）。本项目不打包 NagiBridge-Remix。

## 许可

MIT，见 [LICENSE](./LICENSE)。内置的 `junimo-mcp.exe` 与 NagiBridge-Remix 各自遵循其原许可。
