# 更新日志

体例参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号跟 `package.json` 走。

## [0.4.2] - 2026-11-05

### 文档维护：工具速查表对齐 v3.3.1 / JunimoBridge 0.3.2

结论：**不新增第二份工具说明**。参数定义由 MCP `tools/list` 自动提供，
`systemPrompt` 只放 9 条纪律 + 一个路径指针，长查表按需读 —— 这个分层是对的，
README 新增「模型怎么查工具」把分工写清楚了。

- 工具数 **37 → 41**：package.json / 四语 README / skill / 常驻提示词 / 长文档 / 测试注释全部对齐。
- 速查表补 4 个新工具：`fishing` / `cast` / `fish` / `minigame`，并写明 `fish`
  回执只认 `delivered`（`won` 是打赢小游戏、`directCatch` 是垃圾类直接入包）。
- **修掉一处自相矛盾**：常驻纪律第 5 条还写「失焦会暂停，驱动 UI 前先 `junimo_focus`」，
  而附录 A.3.2 已写「最小化也能操控」。现在统一为 JunimoBridge ≥0.3.0 默认开后台操控、
  日常不用 focus，但最小化时时间照常流逝、长挂机仍要 `pause_time`。
- 数据流 `NagiBridge mod` → `JunimoBridge mod（7850）`（默认执行器早换了）。
- 附录 A.3.1 更新：收线交付（0.3.1）与连续钓（0.3.2）都已修；**产出垃圾是游戏特性，不用排查**。
- 四语 README 的 `junimo_focus` 说明同步。

## [0.3.2] - 2026-11-04

### 修复
- **`sleep` 不再「谎报写盘」**：内置 exe 升到 **v3.2.4**。原来只等「日期变了」就回
  「进度已写盘」，但白天强行触发睡觉时游戏会推进日期却**跳过存盘**（实测：回执说写了，
  重开游戏还是前一天）。现在 exe 会比对存档目录里最新 `SaveGameInfo` 的 mtime，
  写不进去就明确报错并提示「再睡一觉」。

### 变更
- 四语言 README 加上 **powered by dsh** 徽章。

## [0.3.1] - 2026-11-04

### 变更
- 内置 exe 升到 v3.2.3；`reference/game-semantics.md` 订正过时结论（方向键绑定 / `CanMove` / 事件期间按键被吃）。

## [0.3.0] - 2026-11-04


### 变更
- **执行器换成自研 [JunimoBridge](https://github.com/mlkgrnt/junimo-bridge)**，端口 **7842 → 7850**；内置 exe 升到 v3.2.2（默认后端 7850，NagiBridge 降为兼容路径）。
  - ⚠️ **破坏性**：若环境里把 `STARDEW_API_URL` 写死成 `http://localhost:7842`，升级后会连不上 —— 删掉这个变量（默认 7850）或改指 7850。
  - 两个执行器可以**并存**（7850 / 7842 各听各的），本机实测同时加载 4 个 mod 无冲突。

### 修复
- `junimo_doctor`：执行器文件检查此前只认 `Mods\NagiBridge`，导致**只装 JunimoBridge 的人被误报「目录不完整」**。现在两种执行器都识别，并在输出里并列显示。
- `junimo_doctor`：/status 的标题改为跟 `server` 字段走（不再硬编码 NagiBridge），并兼容没有 `build` 字段的新 mod（改显 `tick`）。
- `junimo_doctor`：SMAPI 日志不再把**执行器启动横幅**（mod 用 ALERT 级打 "已启动，HTTP 监听 …"）和**非 Steam 启动的成就警告**当成错误。

### 文档
- `reference/game-semantics.md` 新增「附录 A · 原始端点逃生通道」：`/input/hold`（蓄力/抛竿）、`/screen`（物理像素视口 + 焦点 + 菜单结构）、`/probe/active_menu`，以及 0.1.0 的实测边界。

## [0.2.0] - 2026-11-01

### 新增
- 右侧边栏「季历面板」：季节卡 / 4×7 季历（标节日）/ 状态卡，5 秒轮询自动刷新，游戏没开时降级为「未连接」。
  宿主路由 `GET /junimo/panel`（浏览器跑在 `dsh-app://` 下，打不通游戏端口，只能由宿主代理），客户端 bundle 由 `dsh.client` 声明。
- 面板测试：`test/panel-dto.mjs`、`test/client-bundle.mjs`、`test/render-panel.mjs`（三态静态预览）。
- README 四语言同步新增「季历面板」章节 + 实机截图 `docs/panel.jpg`。

## [0.1.0] - 2026-10-25

### 新增
- 首个可用版本：37 个 `mcp__junimo__*` 工具桥接、4 个原生工具（`junimo_doctor` / `junimo_focus` / `junimo_game_launch` / `junimo_load_save`）、提示词纪律、随包 exe、`junimo` skill。

### 修复
- `junimo_game_launch`：「进程启动后立刻消失」——**SMAPI 是控制台程序**，直接 `spawn` 时父进程没有可继承的控制台就会秒退；改为优先经 bash 启动，找不到 bash 再退回 `shell: true`。