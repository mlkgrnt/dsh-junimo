# AGENTS.md — dsh-junimo 开发与维护指南

> 面向 AI Agent：改这个仓库前先读完。面向人类的完整说明在四语 `README*.md`，
> 逐版本变更在 `CHANGELOG.md`。本文件只写「动手时必须知道」和「容易翻车」的部分。

## 这是什么

把 [Junimo-MCP](https://github.com/mlkgrnt/Junimo-MCP) 接进 **DeepSeek Harness** 的插件（bundle）。
**桥接型，不改 MCP 仓库一行代码**：

```
dsh 宿主
 ├─ junimo-mcp     @deepseek-ai/dsh-mcp-client → 内置 bin/junimo-mcp.exe（stdio）
 │                  ⇒ 41 个 mcp__junimo__* 工具
 ├─ junimo        本插件：junimoPaths 服务、提示词纪律、4 个原生工具、季历面板
 └─ junimo-skills 独立的 skill provider，只暴露本包 skills/ 目录
```

- 4 个原生工具：`junimo_doctor` / `junimo_focus` / `junimo_game_launch` / `junimo_load_save`。
- 执行器默认是自研 [JunimoBridge](https://github.com/mlkgrnt/junimo-bridge)（**7850**），
  NagiBridge-Remix（7842）保留兼容。
- 纯 ESM JavaScript、**无构建步骤**，`src/*.js` 即发布产物；仓库 public / MIT。
- 目前只在 Windows 完整可用：OCaml 内核跨平台，但插件层的聚焦 / 启动 / 路径探测用 Win32。
  `JUNIMO_MCP_BIN` 可把非 Windows 用户指到对应平台的 exe。

## 开工前 30 秒自检

1. `package.json` 的 `version` 与 `CHANGELOG.md` 顶部一致；`dsh.engines.dsh` 别随手改。
2. `bin/BUNDLED_VERSION` 与 `bin/junimo-mcp.exe` 的实际版本一致，
   `.sha256` 与 GitHub Release 的 digest 一致。
3. 四语 README 里的三个版本串是否同步：内置 exe 版本、执行器 mod 版本、
   `sync-binary.mjs` 示例 tag。
4. 新增/改名工具后，`package.json` 描述、四语 README、`reference/game-semantics.md`、
   `skills/junimo/SKILL.md`、常驻提示词、测试注释里的**工具总数**是否都改了。

## 五条铁律

1. **工具参数 optional = 省略 `required`**。写 `required: false` 会让 entry **静默不激活**，
   启动时报 `entries did not activate`。这是 dsh 的规范，不是可选项。
2. **别新建第二份「各工具使用说明」**。文档分层已定（0.4.2）：
   | 层 | 内容 | 加载方式 |
   |---|---|---|
   | MCP `tools/list` | 参数定义与工具描述 | 自动 |
   | `systemPrompt.section` | 9 条纪律 + 一个路径指针（约 1KB） | 常驻 |
   | `reference/game-semantics.md` | 「我想… → 用哪个工具 → 关键说明」决策速查表 | **按需读** |
   | `skills/junimo/SKILL.md` | 一页最短流程 | 按需 |
   新增工具只需同步那张速查表；把参数再抄一遍纯加 token。
   改 `systemPrompt` / 工具 description 后**要重启 dsh 才生效**；长文档按需读，改完即时可用。
3. **季历面板别写死宽度**：右侧栏实测 **633px**（不是 392px），列数靠
   `ResizeObserver` 现算。数据走宿主路由 `/junimo/panel`，靠
   `src/index.js` 的 **`ctx.inject(['webServer'], …)` 按需注入**（headless 下只是这条不生效）。
   美术全是手写像素 SVG，无图片依赖。
4. **启动游戏必须经 bash/shell**：SMAPI 是控制台程序，直接 spawn 会秒退；
   系统 shell 用 System32 绝对路径（相对名会 ENOENT）。
5. **别把 `fish` 的 `won` / `progressPeak=1` 当成果**：只认 `delivered`。
   `directCatch` 是垃圾类直接入包；**产出垃圾是游戏特性，不用排查**。
   JunimoBridge ≥0.3.0 默认开后台操控，日常不用 `junimo_focus`；但最小化时游戏时间照走，
   长挂机仍要 `pause_time`。

## 测试

```bash
node test/smoke.mjs          # 离线冒烟：junimoPaths、提示词、4 工具注册、启动命令转义、面板路由、doctor
node test/client-bundle.mjs  # 客户端 bundle 结构与组件渲染断言
node test/panel-dto.mjs      # 面板 DTO：畸形输入都退化成「没连上」
node test/render-panel.mjs out.html dark   # 静态预览（light | dark | offline）
node test/verify-load-save.mjs            # 真机：启动游戏 + 读档
node test/verify-load-save.mjs --existing # 游戏已开，仅验证读档
```

- 离线冒烟依赖 `node_modules/@deepseek-ai/dsh-tools` 的本地 stub；实际部署由 dsh 宿主提供。
- 在 dsh 里验证：
  ```bash
  dsh plugin --profile <name> add link:/path/to/dsh-junimo
  dsh --profile <name> --dump-config | grep -A8 junimo
  dsh --profile <name> --no-open      # 出现 "entries did not activate" 即为异常
  ```

## 同步内置 exe

```bash
node scripts/sync-binary.mjs            # 取 Junimo-MCP 最新 release
node scripts/sync-binary.mjs v3.3.1     # 或锁定指定 tag
```

脚本下载 exe 与官方 SHA-256，本地校验通过才覆盖 `bin/`，并更新 `bin/BUNDLED_VERSION`。
下载 TLS 断开时（本机偶发）可从本地已校验的 `junimo-mcp/release/v3/` 复制，
再手动写 `.sha256` 与 `BUNDLED_VERSION`——**前提是 hash 与 Release digest 一致**。
完成后 `git add bin/` 并提交，同时更新四语 README 里写的版本号。

## 发版 / 提交

- 仓库默认 **public**，无 tag 流程：改 `package.json` 版本 + 写 `CHANGELOG.md` →
  跑三套离线测试 → `git add` / `commit` / `push`。
- 版本号与四语 README、CHANGELOG、内置 exe 版本是四个独立同步点，别只改一处。
- 引用执行器版本时写实际版本（当前 JunimoBridge **0.3.2**、Junimo-MCP **3.3.1**）。
- 文档里「平台支持」要区分清楚：JunimoBridge 的虚拟输入是进程内 Harmony 补丁（可移植），
  Win32 只用于 `/focus`；`keybd_event` / `mouse_event` 是 NagiBridge-Remix 的实现。
