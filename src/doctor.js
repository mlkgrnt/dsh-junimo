/**
 * `junimo_doctor`：一条命令看清「到底是哪一环没接上」。
 *
 * 覆盖从磁盘到游戏的整条链路：exe → 端口 7850 → mod 响应 → 存档就绪 → mod 文件与日志。
 * 只读，不做任何修复动作；修法写进输出，由模型转述或自行执行。
 *
 * @module dsh-junimo/doctor
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { apiGet, probePort, splitApiUrl } from './api.js'

const ICON = { ok: '✓', warn: '!', fail: '✗' }

/**
 * 读 SMAPI 最近日志，只挑**真的出错**的行。
 *
 * 坑：日志里大量 `TRACE ... completed without exceptions` 字面含 "exception"，
 * 按关键词粗筛会天天误报，所以必须看级别字段。另外两类已知噪声单独排除，
 * 见下方 BENIGN 判断（执行器启动横幅、非 Steam 启动的成就警告）。
 */
function smapiLogIssues(appData) {
  if (!appData) return []
  const logPath = join(appData, 'StardewValley', 'ErrorLogs', 'SMAPI-latest.txt')
  if (!existsSync(logPath)) return []
  try {
    const lines = readFileSync(logPath, 'utf8').split(/\r?\n/)
    return lines
      .filter(line => {
        // 已知良性、但级别不低的噪声，先排掉，否则天天误报：
        //   1) 执行器 mod 用 ALERT 打自己的启动横幅（"已启动，HTTP 监听 …"）
        //   2) 非 Steam 启动时的成就警告（对自动化无影响）
        if (/ALERT (JunimoBridge|NagiBridge)\]/.test(line)) return false
        if (/Steam achievements won't work/.test(line)) return false
        const level = line.match(/^\[[^\]]*?\s(TRACE|DEBUG|INFO|WARN|ALERT|ERROR|CRITICAL)[^\]]*\]/)
        if (level) return level[1] === 'ERROR' || level[1] === 'ALERT' || level[1] === 'CRITICAL'
        // 非标准行（多行堆栈、SMAPI 自己贴的异常）才退回关键词。
        return /Unhandled exception|System\.[A-Za-z.]+Exception:/.test(line)
      })
      .slice(-5)
      .map(line => line.trim())
  } catch {
    return []
  }
}

/**
 * 跑完整诊断并返回可直接给人看的文本。
 * @param {object} paths resolvePaths() 的返回值
 */
export async function runDoctor(paths) {
  /** @type {{verdict: 'ok'|'warn'|'fail', title: string, detail: string, fix?: string}[]} */
  const checks = []
  const { host, port } = splitApiUrl(paths.apiUrl)

  // 1. 平台与二进制
  //
  // 非 Windows 必须单独判，不能落到下面的「找不到 exe」分支：那条提示会让人
  // 去下载 junimo-mcp.exe，而下载下来也执行不了。真正缺的是平台产物，不是文件。
  if (!paths.platformSupported && !paths.exeExists) {
    const asset = paths.platformAsset
    const arch = `${paths.platform}/${paths.arch}`
    checks.push({
      verdict: 'fail',
      title: `本平台暂无可用二进制（${arch}）`,
      detail: asset
        ? '插件随包只带 Windows 的 junimo-mcp.exe，在本平台无法执行。\n' +
          `   Junimo-MCP 已发布本平台产物：${asset}`
        : '插件随包只带 Windows 的 junimo-mcp.exe，在本平台无法执行。\n' +
          `   Junimo-MCP 尚未发布 ${arch} 的产物。`,
      fix: asset
        ? `下载 https://github.com/mlkgrnt/Junimo-MCP/releases/latest/download/${asset}\n` +
          '   然后设 JUNIMO_MCP_BIN 指向它。\n' +
          '   注意：即使二进制就位，端到端仍会缺两个端点——mod 的 /press_key 与 /click_tile ' +
          '走 user32 的 keybd_event / mouse_event，非 Windows 无实现。'
        : '自行构建：`dune build` 后设 JUNIMO_MCP_BIN 指向 _build/default/bin/main.exe。\n' +
          '   注意：/press_key 与 /click_tile 走 user32，非 Windows 无实现。',
    })
  } else if (paths.exeExists) {
    const origin =
      paths.exeSource === 'bundled'
        ? `随包内置${paths.exeVersion ? ` ${paths.exeVersion}` : ''}`
        : paths.exeSource === 'env'
          ? '来自环境变量 JUNIMO_MCP_BIN'
          : '本机其它副本'
    checks.push({ verdict: 'ok', title: 'junimo-mcp.exe', detail: `${paths.exe}\n   来源：${origin}` })
  } else {
    checks.push({
      verdict: 'fail',
      title: 'junimo-mcp.exe 找不到',
      detail: `找过这些位置：\n  ${paths.exeCandidates.slice(0, 5).join('\n  ')}`,
      fix:
        '下载：https://github.com/mlkgrnt/Junimo-MCP/releases/latest/download/junimo-mcp.exe\n' +
        '放到上面任一位置，或设环境变量 JUNIMO_MCP_BIN 指向它。',
    })
  }

  // 2. 端口
  const portOpen = await probePort(host, port)
  checks.push(
    portOpen
      ? { verdict: 'ok', title: `端口 ${port}`, detail: '有进程在监听' }
      : {
          verdict: 'fail',
          title: `端口 ${port} 没人监听`,
          detail: 'mod 没加载，或游戏没启动',
          fix:
            '用 StardewModdingAPI.exe 启动游戏（**别走 Steam**，那样不加载 mod）。\n' +
            '若游戏已在跑：检查 Mods\\JunimoBridge\\ 里有 JunimoBridge.dll + manifest.json。\n' +
            '用 NagiBridge-Remix 当执行器时端口是 7842，需设 STARDEW_API_URL=http://localhost:7842。',
        },
  )

  // 3. mod 响应
  if (portOpen) {
    const status = await apiGet(paths.apiUrl, '/status', 4000)
    if (status.ok && status.data && typeof status.data === 'object') {
      const info = status.data
      // 标题跟 /status 的 server 字段走：JunimoBridge / NagiBridge 都能自报家门，
      // 硬编码其中一个名字会在换执行器时误导人。
      const serverName = typeof info.server === 'string' && info.server ? info.server : '执行器 mod'
      // NagiBridge 有 build，JunimoBridge 有 tick；有就显示，没有不占位。
      const detail = [
        `version=${String(info.version ?? '?')}`,
        info.build ? `build=${String(info.build)}` : undefined,
        `worldReady=${String(info.worldReady)}`,
        info.tick !== undefined ? `tick=${String(info.tick)}` : undefined,
      ].filter(Boolean).join(' ')
      checks.push({ verdict: 'ok', title: `${serverName} 响应`, detail })
      checks.push(
        info.worldReady === true
          ? { verdict: 'ok', title: '存档已就绪', detail: '可以直接调 mcp__junimo__* 工具' }
          : {
              verdict: 'warn',
              title: '还没进档',
              detail: 'mod 活着，但停在标题/读档界面',
              fix: '用 junimo_load_save 进档（先聚焦窗口、点 Load、再点存档格），或让用户自己点进去。',
            },
      )
    } else {
      checks.push({
        verdict: 'fail',
        title: '执行器 mod 无响应',
        detail: status.error ?? '请求超时',
        fix: '端口开着但 mod 不答：多半是模态界面卡住，或加载了与当前端口不匹配的执行器。看 SMAPI 控制台。',
      })
    }
  }

  // 4. 游戏目录与 SMAPI
  if (paths.gameDir && paths.smapiPath) {
    checks.push({ verdict: 'ok', title: '游戏目录', detail: paths.gameDir })
    checks.push(
      existsSync(paths.smapiPath)
        ? { verdict: 'ok', title: 'SMAPI', detail: paths.smapiPath }
        : {
            verdict: 'fail',
            title: 'SMAPI 未安装',
            detail: paths.gameDir,
            fix: '从 https://github.com/Pathoschild/SMAPI/releases 装 4.x（install.dat 改名为 install.zip 可免 GUI 解包）。',
          },
    )

    // 支持两种执行器：JunimoBridge（默认，7850）与 NagiBridge-Remix（兼容路径，7842）。
    // 两者任一就位即可 —— 早先这里只查 NagiBridge，导致按文档只装 JunimoBridge 的人
    // 反而被报「目录不完整」，是假警报。
    const executors = [
      { dir: 'JunimoBridge', dll: 'JunimoBridge.dll', title: 'JunimoBridge（默认执行器，7850）', url: 'https://github.com/mlkgrnt/junimo-bridge/releases' },
      { dir: 'NagiBridge', dll: 'NagiBridge.dll', title: 'NagiBridge-Remix（兼容路径，7842）', url: 'https://github.com/pendel001/NagiBridge-Remix' },
    ]
    let foundExecutor = false
    for (const ex of executors) {
      const modDir = join(paths.gameDir, 'Mods', ex.dir)
      if (!existsSync(modDir)) continue
      foundExecutor = true
      checks.push(
        existsSync(join(modDir, ex.dll))
          ? { verdict: 'ok', title: ex.title, detail: modDir }
          : {
              verdict: 'fail',
              title: `${ex.dir} 目录不完整`,
              detail: `${modDir} 缺 ${ex.dll}`,
              fix: `重新下载 ${ex.url} 的压缩包，把 ${ex.dir}\\ 整个文件夹放进 Mods\\。`,
            },
      )
    }
    if (!foundExecutor) {
      checks.push({
        verdict: 'warn',
        title: '没找到执行器 mod',
        detail: 'Mods\\ 下既没有 JunimoBridge\\ 也没有 NagiBridge\\',
        fix: '下载 https://github.com/mlkgrnt/junimo-bridge/releases 的 zip，解压到 <游戏目录>\\Mods\\（得到 Mods\\JunimoBridge\\）。',
      })
    }
  } else {
    checks.push({
      verdict: 'warn',
      title: '游戏目录未探测到',
      detail: `找过 ${paths.gameDirCandidates.length} 个候选位置`,
      fix: '设环境变量 STARDEW_GAME_DIR 指向含 Stardew Valley.exe 的目录，再跑一次。',
    })
  }

  // 5. SMAPI 日志
  const issues = smapiLogIssues(process.env.APPDATA)
  if (issues.length > 0) {
    checks.push({
      verdict: 'warn',
      title: 'SMAPI 日志有报错',
      detail: issues.join('\n  '),
      fix: `完整日志：${join(process.env.APPDATA ?? '', 'StardewValley', 'ErrorLogs', 'SMAPI-latest.txt')}`,
    })
  }

  const failed = checks.filter(c => c.verdict === 'fail').length
  const warned = checks.filter(c => c.verdict === 'warn').length
  const headline =
    failed > 0
      ? `junimo 诊断：${failed} 项失败，链路未通`
      : warned > 0
        ? `junimo 诊断：链路基本通，${warned} 项需要注意`
        : 'junimo 诊断：全部就绪'

  const body = checks
    .map(c => `${ICON[c.verdict]} ${c.title}\n   ${c.detail}${c.fix ? `\n   → ${c.fix}` : ''}`)
    .join('\n\n')

  return `${headline}\n\n${body}`
}