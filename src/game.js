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
 * @module junimo-dsh/game
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { apiGet, apiPost } from './api.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 只在 Windows 上有意义；其它平台直接给出明确拒绝。 */
export function requireWindows() {
  return process.platform === 'win32' ? null : `仅支持 Windows（当前 ${process.platform}）`
}

/** 跑一段 PowerShell 并收集输出；失败不抛，交给调用方渲染。 */
function runPowerShell(script, timeoutMs = 15000) {
  return new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
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

/**
 * 启动游戏。必须是**分离进程**：宿主退出/回收进程树时游戏要能继续活着，
 * 否则用户刚读档就被连坐杀掉。
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

  try {
    const child = spawn(paths.smapiPath, [], {
      cwd: dirname(paths.smapiPath),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
  } catch (error) {
    return { ok: false, detail: `启动失败：${error instanceof Error ? error.message : String(error)}` }
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
