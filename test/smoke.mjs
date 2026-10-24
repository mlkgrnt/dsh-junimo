/**
 * 离线冒烟：不需要游戏、不需要 dsh 宿主，验证插件能加载、注册了哪些能力。
 *
 * 跑法：node test/smoke.mjs
 * （node_modules/@deepseek-ai/dsh-tools 里放的是本地 stub，只为让裸 node 能 import。）
 */

import { apply } from '../src/index.js'
import { resolvePaths } from '../src/paths.js'

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

const problems = []
if (services.get('junimoPaths')?.exe === undefined) problems.push('junimoPaths 服务未提供')
if (sections.length !== 1) problems.push(`提示词段数量异常: ${sections.length}`)
if (registered.length !== 4) problems.push(`工具数量异常: ${registered.length}`)

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
