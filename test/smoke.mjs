/**
 * 离线冒烟：不需要游戏、不需要 dsh 宿主，验证插件能加载、注册了哪些能力。
 *
 * 跑法：node test/smoke.mjs
 * （node_modules/@deepseek-ai/dsh-tools 里放的是本地 stub，只为让裸 node 能 import。）
 */

import { apply } from '../src/index.js'
import { resolvePaths } from '../src/paths.js'
import { findPosixShell, shellLaunchCommand } from '../src/game.js'

const registered = []
const sections = []
const services = new Map()

const ctx = {
  provide: (name, value) => services.set(name, value),
  tools: { register: tool => registered.push(tool) },
  systemPrompt: { section: segment => sections.push(segment) },
}

apply(ctx)

const paths = resolvePaths()

console.log('=== 服务 ===')
for (const [key, value] of services) {
  console.log(`  ${key}: exe=${value.exe}`)
  console.log(`         skillDir=${value.skillDir}`)
  console.log(`         gameDir=${value.gameDir ?? '(未探测到)'}`)
}

console.log('\n=== 提示词段 ===')
for (const segment of sections) {
  console.log(`  ${segment.name} (order=${segment.order}, ${segment.text.length} 字符)`)
  const firstLine = segment.text.split('\n').slice(0, 3).join(' / ')
  console.log(`  ${firstLine}`)
}

console.log('\n=== 工具 ===')
for (const tool of registered) {
  console.log(`  ${tool.name}`)
  console.log(`    params: ${Object.keys(tool.parameters).join(', ') || '(无)'}`)
  console.log(`    desc: ${tool.description.slice(0, 60)}…`)
}

console.log('\n=== 启动命令（SMAPI 是控制台程序，必须经 shell 拉起）===')
const posixShell = findPosixShell()
console.log(`  POSIX shell: ${posixShell ?? '(没找到 → 将退回 cmd 兜底，会多一个控制台窗)'}`)
const launchCmd = shellLaunchCommand('D:\\SteamLibrary\\steamapps\\common\\Stardew Valley')
console.log(`  启动命令: ${launchCmd}`)
console.log(`  含撇号的路径: ${shellLaunchCommand("C:\\it's here\\game")}`)

const problems = []
if (services.get('junimoPaths')?.exe === undefined) problems.push('junimoPaths 服务未提供')
if (sections.length !== 1) problems.push(`提示词段数量异常: ${sections.length}`)
if (registered.length !== 4) problems.push(`工具数量异常: ${registered.length}`)
if (!launchCmd.includes("cd '") || !launchCmd.endsWith('&& exec ./StardewModdingAPI.exe')) {
  problems.push(`启动命令格式异常: ${launchCmd}`)
}
if (launchCmd.includes('\\\\')) problems.push('启动命令里残留反斜杠（Git Bash 只认正斜杠）')
if (!shellLaunchCommand("C:\\it's here\\game").includes("'\\''")) problems.push('撇号没有被正确转义')

// paths 必须自报平台：doctor 靠 platformSupported 区分「文件缺失」与「平台无产物」，
// 缺了它就会在 macOS/Linux 上把随包的 PE 当成可用二进制（假绿）。
if (typeof paths.platform !== 'string') problems.push('paths.platform 缺失')
if (typeof paths.platformSupported !== 'boolean') problems.push('paths.platformSupported 缺失')
if (process.platform !== 'win32' && paths.platformSupported) problems.push('非 Windows 上 platformSupported 不应为 true')

const expected = ['junimo_doctor', 'junimo_focus', 'junimo_game_launch', 'junimo_load_save']
for (const name of expected) {
  if (!registered.some(t => t.name === name)) problems.push(`缺工具: ${name}`)
}

console.log('\n=== doctor 实跑 ===')
const doctor = registered.find(t => t.name === 'junimo_doctor')
console.log(await doctor.execute({}))

console.log('\n=== 结论 ===')
if (problems.length > 0) {
  for (const p of problems) console.log(`  ✗ ${p}`)
  process.exitCode = 1
} else {
  console.log('  ✓ 服务、提示词段、4 个工具全部就位')
  if (!paths.exeExists) console.log('  ! junimo-mcp.exe 未找到（doctor 已如实报告，链路功能需装好 exe 才可验证）')
}
