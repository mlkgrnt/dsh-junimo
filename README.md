# dsh-junimo

把 [Junimo-MCP](https://github.com/mlkgrnt/Junimo-MCP) 的 **37 个星露谷工具**接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，并补上 dsh 侧才做得了的三件事：部署自检、游戏生命周期、提示词纪律。

这是一个 **dsh 组合包（bundle）**，不是又一个 MCP 服务器——游戏逻辑仍然全部在 `junimo-mcp.exe` 里，本仓库一行不改它。

## 它做了什么

```
模型 ──mcp__junimo__*──▶ dsh-mcp-client ──stdio──▶ junimo-mcp.exe ──HTTP──▶ NagiBridge mod ──▶ 游戏
                              ▲                          ▲
                        dsh-junimo 装配             原样复用，不改一行
                        + 4 个原生工具
```

| 层 | 提供方 | 作用 |
|---|---|---|
| 37 个工具 | `@deepseek-ai/dsh-mcp-client` + `junimo-mcp.exe` | 感知、移动、农活、社交、节日、生计，全部原样复用 |
| 4 个原生工具 | 本插件 | `junimo_doctor` / `junimo_focus` / `junimo_game_launch` / `junimo_load_save` |
| 提示词纪律 | 本插件 | 把「收尾必睡」「别自己加延时」「失焦会暂停」这些坑写进系统提示词 |
| 随包 skill | `@deepseek-ai/dsh-skill-filesystem` | `skills/junimo/SKILL.md`，按需加载，不占常驻 token |
| 长文档 | `reference/game-semantics.md` | 37 工具速查表 + 十条铁律 + 已知边界，需要时直接读 |

为什么这 4 个工具必须由插件提供，而不是 MCP 工具：mod 跑在游戏**进程里面**，没法自己启动自己、也没法把自己的窗口提到前台。

## 安装

前置：Windows + 已装《星露谷物语》、SMAPI 4.x、[NagiBridge-Remix](https://github.com/pendel001/NagiBridge-Remix)（详细步骤见 [Junimo-MCP 的 AGENTS.md](https://github.com/mlkgrnt/Junimo-MCP/blob/main/AGENTS.md)），以及 `junimo-mcp.exe`：

```bash
curl -L -o junimo-mcp.exe https://github.com/mlkgrnt/Junimo-MCP/releases/latest/download/junimo-mcp.exe
```

把它放在下列任一位置（插件会自动探测，按顺序）：

1. 环境变量 `JUNIMO_MCP_BIN`
2. 本包内的 `bin/junimo-mcp.exe`
3. `%LOCALAPPDATA%\junimo-mcp\junimo-mcp.exe`

然后装进 profile：

```bash
# 本地 checkout（开发）
dsh plugin --profile web add link:/path/to/dsh-junimo

# 或从 GitHub（需要 pnpm 允许 prepare；本包不需要 prepare，纯 ESM 源码直出）
dsh plugin --profile web add github:mlkgrnt/dsh-junimo
```

第一次 `dsh plugin add` 会初始化 profile 并在 `dsh.profile.bundles` 里追加本包。重启 dsh 后生效。

> 从 GitHub 安装若报「构建脚本未授权」，把 pnpm 提示的包键写进 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`。本包不含构建步骤，通常不会触发。

## 配置

全部有默认值，按需用环境变量覆盖：

| 变量 | 默认 | 说明 |
|---|---|---|
| `JUNIMO_MCP_BIN` | 自动探测 | `junimo-mcp.exe` 的绝对路径 |
| `STARDEW_GAME_DIR` | 自动探测（Steam 库 + 常见路径） | 含 `Stardew Valley.exe` 的目录，`junimo_game_launch` 用 |
| `STARDEW_API_URL` | `http://localhost:7842` | mod 端点。**必须用 localhost**，不要写 127.0.0.1 |
| `STARDEW_AUTO_MENU` | 开 | 透传给 exe：无选项对话自动按 confirm |
| `STARDEW_AUTO_EVENT` | 关 | 透传给 exe：自动跳过剧本事件（默认不跳） |

## 四个原生工具

| 工具 | 什么时候用 |
|---|---|
| `junimo_doctor` | 每次开始操作前的第一条命令。检查 exe / 7842 端口 / mod 响应 / 存档就绪 / SMAPI / NagiBridge 文件 / 日志报错，一次性说清哪一环没接上 |
| `junimo_focus` | 驱动 UI 之前。SDV 失焦会自动暂停，点击会静默失效 |
| `junimo_game_launch` | 游戏没开时。用 `StardewModdingAPI.exe` 启动（走 Steam 加载不到 mod），然后等 7842 响应；已在跑则不重复启动 |
| `junimo_load_save` | 停在标题界面时。聚焦 → 点 Load → 点存档格 → 轮询 `worldReady`，失败整轮重试 |

`junimo_load_save` 的难点是**时机不是坐标**：`TitleMenu.receiveLeftClick` 在淡入/转场期间会静默吞掉点击。所以实现是「先等够 → 点 → 用 `worldReady` 判定 → 整轮重试」，坐标基于 1280×720 窗口模式的标题界面。

## 覆盖默认配置

profile 自己的 `cordis.patch.yml` 按 `id` 覆盖，注意 patch 会**整体替换** `config`，要把需要的键全部重述：

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

## 开发

纯 ESM JS，**没有构建步骤**——`src/*.js` 就是发布产物，clone 下来即可被 dsh 加载。

```bash
node test/smoke.mjs     # 离线冒烟：不需要游戏、不需要 dsh 宿主
```

冒烟会验证 `junimoPaths` 服务、提示词段、4 个工具都注册成功，并真跑一次 `junimo_doctor`。它靠 `node_modules/@deepseek-ai/dsh-tools` 里的本地 stub 让裸 node 能 import（真机上这个包由 dsh 宿主提供）。

装进 dsh 验证：

```bash
dsh plugin --profile <name> add link:/path/to/dsh-junimo
dsh --profile <name> --dump-config | grep -A8 junimo    # 确认三层都进来了
dsh --profile <name> --no-open                          # 启动，看有没有 "entries did not activate"
```

## 已知限制

- **仅 Windows**：聚焦/启动/进档依赖 PowerShell 与 user32；非 Windows 会明确报错而不是静默失败。
- **进档坐标绑定 1280×720**：其它窗口分辨率需要换算（见 `src/game.js` 的注释）。
- **剧情里的问题框选不了**：mod 侧把提问者推断成「玩家面前一格的角色」，宠物领养这类事件全场没 NPC ⇒ 答案被游戏静默丢弃。这是上游 mod 的缺陷，本插件不掩盖它。
- 本插件不打包 NagiBridge-Remix（PolyForm Noncommercial），也不打包 `junimo-mcp.exe`（走 Releases 分发）。

## 许可

MIT。`junimo-mcp.exe` 与 NagiBridge-Remix 各自遵循其原许可。
