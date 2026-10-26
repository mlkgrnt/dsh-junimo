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

/**
 * 当前平台能否使用**随包/官方渠道**的二进制。
 *
 * 随包的 `bin/junimo-mcp.exe` 是 Windows PE。在 macOS/Linux 上它"存在但跑不起来"，
 * 所以不能只看文件是否存在——否则 doctor 会报一节绿灯，直到 spawn 才炸（假绿）。
 * 内核本身是跨平台的（CI 在 Linux/macOS 上跑通全部免游戏断言），只是没有发布
 * 非 Windows 产物。用户若自己 `dune build` 过，可用 JUNIMO_MCP_BIN 指过去。
 */
export const bundledBinaryUsable = process.platform === 'win32'

/**
 * 本平台对应的 Junimo-MCP **发布产物**名；没有对应产物时返回 undefined。
 *
 * 命名必须与 `.github/workflows/release-binaries.yml` 里的 `asset` 一致——
 * 那是产物唯一的生产者，这里只是把它翻译成给用户看的下载地址。
 * 随包的内置二进制仍然只有 Windows（`bin/junimo-mcp.exe`），
 * 其它平台要用户自己下载后经 JUNIMO_MCP_BIN 指过来。
 */
export function platformAssetName(platform = process.platform, arch = process.arch) {
  if (platform === 'win32') return 'junimo-mcp.exe'
  if (platform === 'darwin' && arch === 'arm64') return 'junimo-mcp-macos-arm64'
  if (platform === 'linux' && arch === 'x64') return 'junimo-mcp-linux-x86_64'
  return undefined
}

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
  // 非 Windows：随包与硬编码的那些都是 PE，列进来只会伪造"找到了"。
  // 唯一有意义的来源是用户自己构建并显式指定的二进制。
  if (!bundledBinaryUsable) return [process.env.JUNIMO_MCP_BIN]
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
  const exeProbe = firstExisting([...exeCandidates(), bundledBinaryUsable ? newestReleaseExe() : undefined])
  const gameProbe = firstExisting(guessGameDirs())
  const gameDir = gameProbe.hit
  // 非 Windows 且没人指定自定义二进制时，这个字段只作展示用途（真实值见 exeExists）。
  const exe = exeProbe.hit ?? exeProbe.list[0] ?? join(packageRoot, 'bin', 'junimo-mcp.exe')

  return {
    exe,
    exeExists: exeProbe.hit !== undefined,
    exeSource: sourceOf(exe),
    exeVersion: readBundledVersion(),
    exeCandidates: exeProbe.list,
    platform: process.platform,
    arch: process.arch,
    /** 随包二进制在本平台是否可用；false 时 doctor 会给出专门的说明。 */
    platformSupported: bundledBinaryUsable,
    /** 本平台可下载的发布产物名（undefined = 上游没为该平台出产物）。 */
    platformAsset: platformAssetName(),
    packageRoot,
    skillDir: join(packageRoot, 'skills'),
    referenceDir: join(packageRoot, 'reference'),
    gameDir,
    gameDirCandidates: gameProbe.list,
    smapiPath: gameDir ? join(gameDir, 'StardewModdingAPI.exe') : undefined,
    apiUrl: process.env.STARDEW_API_URL ?? DEFAULT_API_URL,
  }
}
