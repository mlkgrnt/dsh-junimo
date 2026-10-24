/**
 * 游戏生命周期工具：这三件事 MCP 工具做不到，因为 mod 跑在游戏**里面**，
 * 没法自己启动自己、也没法把自己的窗口提到前台。
 *
 *   junimo_focus       —— 切前台（SDV 失焦会暂停，菜单点击不生效）
 *   junimo_game_launch —— 起 SMAPI 进程并等 7842 起来
 *   junimo_load_save   —— 聚焦 + 点 Load + 点存档格 + 等 worldReady
 *
 * 进档的难点是**时机**不是坐标：TitleMenu.receiveLeftClick 在淡入/转场期间
 * 会静默吞掉点击。所以策略是「先等够 → 点 → 用 worldReady 判定 → 整轮重试」，
 * 而不是靠猜时间点。
 *
 * @module dsh-junimo/game
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { apiGet, apiPost } from './api.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * powershell.exe 的绝对路径。
 *
 * 不能只写 'powershell.exe'：宿主进程的 PATH 未必含 System32（Git Bash、
 * 精简过的环境变量、某些服务里都会缺），实测直接 spawn 会 ENOENT。
 */
function powershellPath() {
  const sysRoot = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  const full = join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return existsSync(full) ? full : 'powershell.exe'
}

/** 只在 Windows 上有意义；其它平台直接给出明确拒绝。 */
export function requireWindows() {
  return process.platform === 'win32' ? null : `仅支持 Windows（当前 ${process.platform}）`
}

/** 跑一段 PowerShell 并收集输出；失败不抛，交给调用方渲染。 */
function runPowerShell(script, timeoutMs = 15000) {
  return new Promise(resolve => {
    const child = spawn(powershellPath(), ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    })
    let out = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, out: 'PowerShell 超时' })
    }, timeoutMs)
    child.stdout.on('data', chunk => (out += String(chunk)))
    child.stderr.on('data', chunk => (out += String(chunk)))
    child.once('error', err => {
      clearTimeout(timer)
      resolve({ ok: false, out: String(err) })
    })
    child.once('close', code => {
      clearTimeout(timer)
      resolve({ ok: code === 0, out: out.trim() })
    })
  })
}

/** 把星露谷窗口切到前台。 */
export async function focusGameWindow() {
  const blocked = requireWindows()
  if (blocked) return { ok: false, detail: blocked }

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class JunimoWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
}
"@
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like '*Stardew*') } | Select-Object -First 1
if (-not $p) { Write-Output 'NO_WINDOW'; exit 0 }
$h = $p.MainWindowHandle
[void][JunimoWin32]::ShowWindow($h, 9)
[void][JunimoWin32]::BringWindowToTop($h)
[void][JunimoWin32]::SetForegroundWindow($h)
Write-Output ("OK " + $p.ProcessName + " | " + $p.MainWindowTitle)
`.trim()

  const res = await runPowerShell(script)
  if (!res.ok) return { ok: false, detail: res.out || 'PowerShell 执行失败' }
  if (res.out.startsWith('NO_WINDOW')) {
    return { ok: false, detail: '没找到星露谷窗口——游戏可能没启动' }
  }
  return { ok: res.out.startsWith('OK'), detail: res.out.replace(/^OK\s*/, '') }
}

/** 等 mod 的 /status 可达。 */
export async function waitForMod(apiUrl, timeoutMs) {
  const started = Date.now()
  let worldReady = false
  while (Date.now() - started < timeoutMs) {
    const res = await apiGet(apiUrl, '/status', 2000)
    if (res.ok && res.data && typeof res.data === 'object') {
      worldReady = res.data.worldReady === true
      return { ready: true, worldReady, waitedMs: Date.now() - started }
    }
    await sleep(700)
  }
  return { ready: false, worldReady, waitedMs: Date.now() - started }
}

/** 有没有星露谷相关进程在跑（SMAPI 与游戏本体两个进程名都算）。 */
async function anyStardewProcess() {
  const res = await runPowerShell(
    `$p = Get-Process | Where-Object { $_.ProcessName -like '*Stardew*' }; ` +
      `if ($p) { Write-Output ($p | ForEach-Object { $_.ProcessName } | Sort-Object -Unique) } else { Write-Output 'NONE' }`,
    8000,
  )
  return !res.out.includes('NONE')
}

/**
 * 找一个 POSIX shell（Git Bash / WSL 的 bash），找不到返回 null。
 */
export function findPosixShell() {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const candidates = [
    join(pf, 'Git', 'bin', 'bash.exe'),
    join(pf86, 'Git', 'bin', 'bash.exe'),
    join(pf, 'Git', 'usr', 'bin', 'bash.exe'),
    'C:\\Windows\\System32\\bash.exe',
  ]
  return candidates.find(p => existsSync(p)) ?? null
}

/**
 * 把 Windows 路径包成 shell 里安全的单引号字符串（反斜杠转正斜杠，Git Bash 认）。
 */
function quotePosix(p) {
  const forward = String(p).split('\\').join('/')
  return "'" + forward.split("'").join("'\\''") + "'"
}

/**
 * bash 用的启动命令（导出以便离线单测）。
 */
export function shellLaunchCommand(gameDir) {
  return 'cd ' + quotePosix(gameDir) + ' && exec ./StardewModdingAPI.exe'
}

/**
 * 启动游戏。必须是**分离进程**：宿主退出/回收进程树时游戏要能继续活着，
 * 否则用户刚读档就被连坐杀掉。
 *
 * ⚠️ 关键：SMAPI 是**控制台程序**，直接 spawn 它会秒退。2026-10-25 在本机做过对照
 * 实验（同一台机器、同一时刻，每次先杀干净再试，4~8 秒后看进程还在不在）：
 *
 *   spawn(exe, { detached, stdio: ignore, windowsHide: false })          → 死
 *   spawn(exe, { detached, stdio: ignore, windowsHide: true  })          → 死
 *   spawn(exe, { detached, stdio: [ignore, pipe, pipe] })                → 死
 *   spawn(bash, ['-lc', 切入游戏目录并 exec ./StardewModdingAPI.exe])   → 活，且**不出现控制台窗**
 *   spawn(带引号的 exe 路径, { shell: true })                            → 活，但**会多一个 PseudoConsoleWindow**
 *
 * 所以顺序是：**优先 bash**（活且干净），其次 shell:true（活但多一个窗），都不行才报错。
 * 之前把这现象归因成「dsh 宿主的 Job 对象回收子进程」是误判——同一个 Job 里 bash 明明活得好好的。
 */
export async function launchGame(paths, timeoutMs = 90_000) {
  const blocked = requireWindows()
  if (blocked) return { ok: false, detail: blocked }
  if (!paths.gameDir || !paths.smapiPath) {
    return {
      ok: false,
      detail: `没探测到游戏目录。设 STARDEW_GAME_DIR 指向含 Stardew Valley.exe 的目录（当前候选：${paths.gameDirCandidates.slice(0, 3).join(' | ')}）`,
    }
  }
  if (!existsSync(paths.smapiPath)) {
    return {
      ok: false,
      detail: `SMAPI 未安装：${paths.smapiPath} 不存在。走 Steam 启动会加载不到 mod，必须先装 SMAPI。`,
    }
  }

  let via
  try {
    const shell = findPosixShell()
    if (shell) {
      // 首选：经 bash。SMAPI 复用 bash 的控制台，既起得来又不会多一个窗口。
      via = 'bash'
      spawn(shell, ['-lc', shellLaunchCommand(paths.gameDir)], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref()
    } else {
      // 兜底：经 cmd 一层（shell: true）。起得来，但会多一个 SMAPI 控制台窗。
      via = 'shell'
      spawn('"' + paths.smapiPath + '"', [], {
        cwd: dirname(paths.smapiPath),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: true,
      }).unref()
    }
  } catch (error) {
    return { ok: false, detail: `启动失败：${error instanceof Error ? error.message : String(error)}` }
  }

  // 等它真正活下来再等端口：被宿主 Job 回收的情况通常 1~2 秒内就没了，
  // 不校验的话会白等满整个超时，还报成"7842 没响应"，误导排查方向。
  await sleep(2500)
  if (!(await anyStardewProcess())) {
    return {
      ok: false,
      detail:
        '进程启动后立刻消失（不是没装 SMAPI，也不是端口问题）。' +
        'SMAPI 是控制台程序：直接 spawn 且父进程没有可继承的控制台时它会秒退。' +
        `已尝试经 ${via} 启动；连它都拉不住时，请手动双击 StardewModdingAPI.exe，然后再跑 junimo_load_save。` +
        (via === 'shell' ? '（本次走的是 cmd 兜底，正常情况下会多一个 SMAPI 控制台窗）' : ''),
    }
  }

  const waited = await waitForMod(paths.apiUrl, timeoutMs)
  if (!waited.ready) {
    return {
      ok: false,
      detail: `进程已拉起，但 ${Math.round(waited.waitedMs / 1000)}s 内 7842 没响应。看 SMAPI 控制台是否报 mod 冲突。`,
    }
  }
  return {
    ok: true,
    detail: `mod 已响应（${Math.round(waited.waitedMs / 1000)}s）；worldReady=${waited.worldReady}${waited.worldReady ? '' : '，还需要进档'}`,
  }
}

/**
 * 进档。坐标基于 1280×720 的标题界面（窗口模式）：
 * Load 按钮 ≈ (517,609)，存档格 i 中心 ≈ (640, 129 + i*166)。
 *
 * 用 /click 而不是 /menu/click：前者会先把光标挪过去，后者不挪，
 * 在 TitleMenu 这种自己读光标的界面上点不动。
 */
export async function loadSave(paths, slot, timeoutMs) {
  const blocked = requireWindows()
  if (blocked) return { ok: false, detail: blocked }

  const initial = await apiGet(paths.apiUrl, '/status', 3000)
  if (!initial.ok) {
    return { ok: false, detail: 'mod 不可达，先跑 junimo_doctor 或 junimo_game_launch' }
  }
  if (initial.data?.worldReady === true) {
    return { ok: true, detail: '已经在存档里，无需进档' }
  }

  const focus = await focusGameWindow()
  if (!focus.ok) return { ok: false, detail: `聚焦失败：${focus.detail}` }

  // 淡入/转场期间 TitleMenu 会吞点击，先让界面稳定下来。
  await sleep(1500)

  const attempts = 3
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await apiPost(paths.apiUrl, '/click', { x: 517, y: 609 }, 6000) // Load
    await sleep(3500)

    // 只点一次存档格；若界面没开，这一发会落在空白处，无副作用。
    await apiPost(paths.apiUrl, '/click', { x: 640, y: 129 + slot * 166 }, 6000)
    await sleep(1200)

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const res = await apiGet(paths.apiUrl, '/status', 2500)
      if (res.ok && res.data?.worldReady === true) {
        return { ok: true, detail: `已进档（槽位 ${slot}，第 ${attempt} 次尝试）` }
      }
      await sleep(900)
    }

    // 整轮重试前重新聚焦：读档界面会抢焦点。
    await focusGameWindow()
    await sleep(1200)
  }

  return {
    ok: false,
    detail:
      `尝试 ${attempts} 次仍未进档。常见原因：` +
      '① 存档格坐标与当前 UI 缩放不符（窗口 1280×720 之外的分辨率需要换算）；' +
      '② 界面卡在转场动画；③ 该槽位是空的。请让用户手动进档一次，或改用 /click 坐标微调。',
  }
}
