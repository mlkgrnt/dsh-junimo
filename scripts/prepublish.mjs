/**
 * npm publish 前的守门人（由 package.json 的 `prepublishOnly` 调用）。
 *
 * 为什么需要：本包把 6 MB 的 `junimo-mcp.exe` 一起发出去，而 exe、`.sha256`、`BUNDLED_VERSION`
 * 是三个要手工保持同步的文件。一次「换了 exe 忘了更新 sha256」，或者「发了没同步的旧 exe」，
 * 用户装到的就是一个校验不过、或行为与 README 不一致的包 —— 而 **npm 版本发出去就不能撤回**。
 *
 * 检查项：
 *   1. `bin/junimo-mcp.exe` 的 SHA-256 必须等于 `bin/junimo-mcp.exe.sha256` 里写的值
 *   2. `bin/BUNDLED_VERSION` 必须是 `vX.Y.Z`
 *   3. 包必须带的文件都在（client bundle / cordis patch / skill / reference / LICENSE）
 *   4. Windows 上顺手跑一遍 smoke（会真的 spawn exe，验证 MCP 握手与工具数）
 *
 * 跳过 smoke：`SKIP_SMOKE=1 npm publish`（仅在你明确知道 exe 没问题时用）。
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const problems = []
const ok = (msg) => console.log(`  ✓ ${msg}`)
const bad = (msg) => {
  problems.push(msg)
  console.log(`  ✗ ${msg}`)
}

console.log(`\n发布前检查 ${pkg.name}@${pkg.version}\n`)

// 1. exe 与 sha256 必须一致
const exePath = join(root, 'bin', 'junimo-mcp.exe')
const shaPath = join(root, 'bin', 'junimo-mcp.exe.sha256')
if (!existsSync(exePath) || !existsSync(shaPath)) {
  bad('bin/junimo-mcp.exe 或 .sha256 缺失')
} else {
  const actual = createHash('sha256').update(readFileSync(exePath)).digest('hex')
  const expected = readFileSync(shaPath, 'utf8').trim().split(/\s+/)[0].toLowerCase()
  if (actual === expected) ok(`exe SHA-256 一致（${actual.slice(0, 12)}…）`)
  else bad(`exe SHA-256 不匹配：文件是 ${actual.slice(0, 12)}…，sha256 文件写的是 ${expected.slice(0, 12)}…`)
}

// 2. BUNDLED_VERSION 形状
const bundledPath = join(root, 'bin', 'BUNDLED_VERSION')
if (!existsSync(bundledPath)) {
  bad('bin/BUNDLED_VERSION 缺失')
} else {
  const bundled = readFileSync(bundledPath, 'utf8').trim()
  if (/^v\d+\.\d+\.\d+$/.test(bundled)) ok(`BUNDLED_VERSION = ${bundled}`)
  else bad(`BUNDLED_VERSION 形状不对：${JSON.stringify(bundled)}（应为 vX.Y.Z）`)
}

// 3. 必须随包发布的东西都在
const required = [
  'src/index.js',
  'src/game.js',
  'src/panel.js',
  'src/doctor.js',
  'client/index.js',
  'cordis.patch.yml',
  'skills/junimo/SKILL.md',
  'reference/game-semantics.md',
  'LICENSE',
  'README.md',
]
const missing = required.filter((rel) => !existsSync(join(root, rel)))
if (missing.length === 0) ok(`${required.length} 个必需文件都在`)
else bad(`缺少必需文件：${missing.join(', ')}`)

// 4. files 白名单要覆盖到这些路径（否则 npm 不会把它们打进 tarball）
const files = Array.isArray(pkg.files) ? pkg.files : []
const covered = (rel) => files.some((f) => rel === f || rel.startsWith(f.replace(/\/$/, '') + '/'))
const uncovered = required.filter((rel) => !covered(rel))
if (uncovered.length === 0) ok('package.json 的 files 白名单覆盖了必需文件')
else bad(`files 白名单漏了：${uncovered.join(', ')}`)

// 5. registry：本机默认是镜像源，发布必须显式指向 npmjs
const publishRegistry = pkg.publishConfig?.registry
if (publishRegistry === 'https://registry.npmjs.org' || publishRegistry === 'https://registry.npmjs.org/') {
  ok('publishConfig.registry 指向 npmjs（不会被本机镜像源劫走）')
} else {
  bad(`publishConfig.registry 应为 https://registry.npmjs.org（现在是 ${publishRegistry ?? '未设置'}）`)
}

// 6. Windows 上跑一遍 smoke
const smokePath = join(root, 'test', 'smoke.mjs')
if (process.platform === 'win32' && process.env.SKIP_SMOKE !== '1' && !existsSync(smokePath)) {
  // 从 npm 装下来的副本不会带 test/（files 白名单里没有），这时跳过而不是硬报错。
  console.log('  - 没有 test/（未随包发布）：跳过 smoke')
} else if (process.platform === 'win32' && process.env.SKIP_SMOKE !== '1') {
  console.log('\n  跑 smoke（会 spawn exe）…')
  const res = spawnSync(process.execPath, ['test/smoke.mjs'], { cwd: root, encoding: 'utf8' })
  const tail = (res.stdout ?? '').trim().split('\n').slice(-3).join('\n')
  if (res.status === 0) ok('smoke 通过')
  else {
    bad(`smoke 失败（exit ${res.status}）`)
    if (tail) console.log(tail.split('\n').map((l) => '    ' + l).join('\n'))
  }
} else if (process.platform !== 'win32') {
  console.log('  - 非 Windows：跳过 smoke（exe 跑不起来，属预期）')
}

console.log('')
if (problems.length > 0) {
  console.error(`发布中止：${problems.length} 项检查未通过。`)
  process.exit(1)
}
console.log('全部通过，可以发布。')
