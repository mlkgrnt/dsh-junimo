/**
 * 路径解析：本插件是「exe 在哪、游戏在哪、包里的资源在哪」的唯一真源。
 *
 * 原因：cordis patch 里的 `!!js` 表达式只能读环境变量和已注册的服务，
 * 没法自己算包内相对路径。把这件事集中在插件里，patch 只写
 * `ctx.junimoPaths.exe` / `ctx.junimoPaths.skillDir` 即可。
 *
 * @module dsh-junimo/paths
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
/** 包根目录（src/ 的上一级）。 */
export const packageRoot = resolve(here, '..')

/** mod 的 HTTP 端点。**必须**用 localhost，127.0.0.1 会被 Windows HTTP.sys 拒。 */
export const DEFAULT_API_URL = 'http://localhost:7842'

function firstExisting(candidates) {
  const list = candidates.filter(x => typeof x === 'string' && x.length > 0)
  return { hit: list.find(p => existsSync(p)), list }
}

/** 解析 Steam 的 libraryfolders.vdf，拿到所有库根目录。 */
function steamLibraries() {
  const roots = []
  const vdfPlaces = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf',
    'C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf',
  ]
  for (const vdf of vdfPlaces) {
    if (!existsSync(vdf)) continue
    try {
      const text = readFileSync(vdf, 'utf8')
      // 只认 "path" 行：够用，且不依赖完整 VDF 解析。
      for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) roots.push(m[1].replace(/\\\\/g, '\\'))
    } catch {
      // 读不到就当没有，不影响其它探测路径。
    }
  }
  return roots
}

/** 常见盘符下的 Steam 库（Steam 可能装在任意盘）。 */
function guessGameDirs() {
  const dirs = []
  if (process.env.STARDEW_GAME_DIR) dirs.push(process.env.STARDEW_GAME_DIR)

  for (const lib of steamLibraries()) dirs.push(join(lib, 'steamapps', 'common', 'Stardew Valley'))
  for (const drive of ['C:', 'D:', 'E:', 'F:']) {
    dirs.push(`${drive}\\SteamLibrary\\steamapps\\common\\Stardew Valley`)
    dirs.push(`${drive}\\Steam\\steamapps\\common\\Stardew Valley`)
  }
  dirs.push('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Stardew Valley')
  return dirs
}

/** exe 的候选位置：环境变量优先，其次**随包内置**，最后是本机其它副本。 */
function exeCandidates() {
  return [
    process.env.JUNIMO_MCP_BIN,
    join(packageRoot, 'bin', 'junimo-mcp.exe'),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'junimo-mcp', 'junimo-mcp.exe') : undefined,
    'E:\\junimo-mcp\\release\\v3\\junimo-mcp.exe',
    'E:\\junimo-mcp\\release\\junimo-mcp.exe',
  ]
}

/** 随包内置的 exe 版本记号（`bin/BUNDLED_VERSION`）。 */
function readBundledVersion() {
  try {
    return readFileSync(join(packageRoot, 'bin', 'BUNDLED_VERSION'), 'utf8').trim()
  } catch {
    return undefined
  }
}

/** 命中的 exe 是从哪来的：环境变量 / 随包 / 本机其它位置。 */
function sourceOf(exe) {
  if (process.env.JUNIMO_MCP_BIN && exe === process.env.JUNIMO_MCP_BIN) return 'env'
  if (exe === join(packageRoot, 'bin', 'junimo-mcp.exe')) return 'bundled'
  return 'external'
}

/** 兼容 `release/vN/` 这种带版本子目录的开发副本：取 N 最大的一个。 */
function newestReleaseExe() {
  const base = 'E:\\junimo-mcp\\release'
  if (!existsSync(base)) return undefined
  try {
    const versions = readdirSync(base)
      .filter(name => /^v\d+$/.test(name))
      .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))
    for (const v of versions) {
      const candidate = join(base, v, 'junimo-mcp.exe')
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // 目录不可读时当作没有。
  }
  return undefined
}

/**
 * 解析全部路径。
 *
 * 返回的字段见 README 的「junimoPaths 服务」一节；插件内部与 patch 的
 * `!!js` 表达式都消费同一个对象。
 */
export function resolvePaths() {
  const exeProbe = firstExisting([...exeCandidates(), newestReleaseExe()])
  const gameProbe = firstExisting(guessGameDirs())
  const gameDir = gameProbe.hit
  const exe = exeProbe.hit ?? exeProbe.list[0] ?? join(packageRoot, 'bin', 'junimo-mcp.exe')

  return {
    exe,
    exeExists: exeProbe.hit !== undefined,
    exeSource: sourceOf(exe),
    exeVersion: readBundledVersion(),
    exeCandidates: exeProbe.list,
    packageRoot,
    skillDir: join(packageRoot, 'skills'),
    referenceDir: join(packageRoot, 'reference'),
    gameDir,
    gameDirCandidates: gameProbe.list,
    smapiPath: gameDir ? join(gameDir, 'StardewModdingAPI.exe') : undefined,
    apiUrl: process.env.STARDEW_API_URL ?? DEFAULT_API_URL,
  }
}
