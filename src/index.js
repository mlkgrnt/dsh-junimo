/**
 * dsh-junimo 插件入口。
 *
 * 它本身不实现任何游戏逻辑——37 个工具全部来自 junimo-mcp.exe，由
 * `@deepseek-ai/dsh-mcp-client` 桥接成 `mcp__junimo__*`。本插件负责三件
 * mcp-client 管不到的事：
 *
 *   1. 提供 `junimoPaths` 服务，让 patch 里的 `!!js` 能拿到 exe / skill 的绝对路径
 *   2. 往系统提示词注入「星露谷操作纪律」，防止模型重踩时序与存档的坑
 *   3. 注册 4 个原生工具：doctor、聚焦、启动、进档（mod 在游戏内，够不到这些）
 *
 * @module dsh-junimo
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { probePort, splitApiUrl } from './api.js'
import { runDoctor } from './doctor.js'
import { focusGameWindow, launchGame, loadSave, requireWindows } from './game.js'
import { readPanelState } from './panel.js'
import { resolvePaths } from './paths.js'

export const name = 'junimo'

/** 提示词纪律要落进 systemPrompt，工具要落进 tools。 */
export const inject = ['tools', 'systemPrompt']

/** 文本工具结果的统一渲染。 */
const textOutput = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: value }],
}

function rulesText(exeExists, apiUrl, referenceDir) {
  const bridge = exeExists
    ? '星露谷工具已挂载：调用名为 `mcp__junimo__<工具名>`（如 mcp__junimo__get_state）。'
    : '星露谷工具**未挂载**：找不到 junimo-mcp.exe。先调 `junimo_doctor` 看缺什么，别假装能操作游戏。'

  return `## 星露谷物语操作

${bridge} 数据流：工具 → junimo-mcp.exe → HTTP(${apiUrl}) → NagiBridge mod → 游戏。翻译时序、游戏侧校验、失败回滚都在服务器里，你只管调工具。

先跑 \`junimo_doctor\` 再动手（一次看清 exe / 端口 / 存档 / SMAPI 哪一环没接上）。

纪律（违反会丢进度）：

1. **收尾必睡**。只有 \`sleep\` 会存档；干完活不睡就结束 = 当天全部回滚。要么 sleep，要么明确告诉用户「尚未存档」。
2. **别自己加延时、别连发动作**。每次调用会阻塞到动作真正发生（含 ~550ms 的生效帧回读）。报成功 = 游戏里真发生了，报错 = 真没发生，按文案处理，不要"再多试几下"。
3. **动作被挡先看报错**。带选项的问题框 / 商店 / 箱子会直接把原文和带序号选项写进报错，一步 \`menu_click {"option":N}\` 即可；无选项对话已自动按掉，不用管。
4. **剧情永不自动跳过**。想看就用 \`story\`（read/next/choose/skip）；\`choose\` 内部是两段式（先登记再真实点击），不用你补第二发。
5. **失焦会暂停**。窗口在后台时点击不生效——驱动 UI 前先 \`junimo_focus\`。
6. **长时间挂机先 \`pause_time\`**，收尾 \`resume_time\`；现实约 12 分钟游戏内就走到凌晨 2:00 晕倒扣钱。
7. **移动失败别硬刚**：\`go_to\` 报寻路失败就是真到不了（不会给你穿墙）；报「已到达目标附近」= 目标格站不住，视为到达。
8. **批量农活用 \`till\`/\`plant\`/\`water\`/\`harvest\` 的区域参数**，不要一格一格调；动手前 \`get_inventory\` 确认背包有空位。
9. 多数工具的返回末尾都带 \`── [..]\` 状态速报，日常查询可以省掉一次 \`get_state\`。

完整语义（37 个工具速查表、部署步骤、踩过的坑）在 \`${referenceDir}\\game-semantics.md\`，需要时直接读。`
}

export function apply(ctx) {
  const paths = resolvePaths()

  // patch 里的 mcp-client 行与 skill provider 行都 inject 了这个服务，
  // 所以 exe / skill 目录只在这里算一次。
  ctx.provide('junimoPaths', paths)

  // 季历面板的数据入口。**不放进顶层 inject**：headless / tui profile 没有
  // webServer，那样整个插件（含 37 个工具的提示词）都会激活不了。按需注入时
  // 缺服务只是这一条不起作用。
  ctx.inject(['webServer'], scoped => {
    scoped.effect(
      () =>
        scoped.webServer.register({
          kind: 'exact',
          path: '/junimo/panel',
          async handler(req, res) {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              res.statusCode = 405
              res.setHeader('allow', 'GET, HEAD')
              res.end()
              return
            }
            let body
            try {
              body = JSON.stringify(await readPanelState(paths))
            } catch (error) {
              // 面板是只读观测面，任何异常都要让浏览器拿到可渲染的 JSON，
              // 而不是一个握手失败的空响应。
              body = JSON.stringify({
                ok: false,
                mod: false,
                ready: false,
                error: error instanceof Error ? error.message : String(error),
              })
            }
            res.statusCode = 200
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.setHeader('cache-control', 'no-store')
            res.end(body)
          },
        }),
      'junimo: panel route',
    )
  })

  ctx.systemPrompt.section({
    name: 'junimo:rules',
    order: 9000,
    text: rulesText(paths.exeExists, paths.apiUrl, paths.referenceDir),
  })

  ctx.tools.register(
    defineTool({
      name: 'junimo_doctor',
      description:
        '诊断星露谷链路：exe 是否存在、7842 端口是否在听、mod 是否响应、是否已进档、游戏目录/SMAPI/mod 文件是否就位、SMAPI 日志有无报错。只读，不修任何东西。开始操作游戏前先跑这个。',
      parameters: {},
      output: textOutput,
      async execute() {
        return await runDoctor(paths)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'junimo_focus',
      description:
        '把星露谷窗口切到前台。SDV 失焦会自动暂停，导致点击/菜单操作静默失效——驱动 UI 前先调用。',
      parameters: {},
      output: textOutput,
      async execute() {
        const blocked = requireWindows()
        if (blocked) return blocked
        const res = await focusGameWindow()
        return res.ok ? `已聚焦：${res.detail}` : `聚焦失败：${res.detail}`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'junimo_game_launch',
      description:
        '启动游戏（用 StardewModdingAPI.exe，不是 Steam——走 Steam 加载不到 mod），然后等 7842 响应。游戏已在跑时不会重复启动。',
      parameters: {
        waitSeconds: {
          type: 'number',
          description: '等待 mod 响应的上限秒数，默认 90',
        },
      },
      output: textOutput,
      async execute(args) {
        const blocked = requireWindows()
        if (blocked) return blocked

        const { host, port } = splitApiUrl(paths.apiUrl)
        if (await probePort(host, port)) {
          return '7842 已经在监听，游戏应该已经在跑了（worldReady 用 junimo_doctor 看）。不重复启动。'
        }
        const seconds = typeof args?.waitSeconds === 'number' ? args.waitSeconds : 90
        const res = await launchGame(paths, seconds * 1000)
        return res.ok ? `启动成功：${res.detail}` : `启动失败：${res.detail}`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'junimo_load_save',
      description:
        '进入存档：聚焦窗口 → 在标题界面点 Load → 点存档格 → 轮询直到 worldReady。已进档时直接返回。失败会整轮重试（点击的难点是淡入时机，不是坐标）。',
      parameters: {
        slot: {
          type: 'number',
          description: '存档格序号，0 = 第一个存档，默认 0',
        },
        timeoutSeconds: {
          type: 'number',
          description: '每次尝试等待 worldReady 的秒数，默认 40',
        },
      },
      output: textOutput,
      async execute(args) {
        const blocked = requireWindows()
        if (blocked) return blocked
        const slot = typeof args?.slot === 'number' ? args.slot : 0
        const timeout = (typeof args?.timeoutSeconds === 'number' ? args.timeoutSeconds : 40) * 1000
        const res = await loadSave(paths, slot, timeout)
        return res.ok ? res.detail : `进档失败：${res.detail}`
      },
    }),
  )
}
