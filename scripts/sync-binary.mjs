/**
 * 同步随包内置的 junimo-mcp.exe 到最新版。
 *
 * 跑法：node scripts/sync-binary.mjs [vX.Y.Z]
 *   - 省略 tag 时取 Junimo-MCP 的 latest release
 *   - 下载 exe + 官方 sha256，本地校验通过后才覆盖 bin/
 *   - 同时更新 bin/BUNDLED_VERSION
 *
 * 为什么内置而不是让用户自己下：exe 只有 6MB，进 git 毫无压力，
 * 换来「装完插件就能用」。需要固定/回退版本时仍可用 JUNIMO_MCP_BIN 覆盖。
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const binDir = join(root, 'bin')
const repo = 'mlkgrnt/Junimo-MCP'
const requested = process.argv[2]

async function resolveTag() {
  if (requested) return requested
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`取 latest release 失败：HTTP ${res.status}`)
  const info = await res.json()
  return info.tag_name
}

const tag = await resolveTag()
const base = `https://github.com/${repo}/releases/download/${tag}`

console.log(`下载 ${tag} …`)
const [exeRes, shaRes] = await Promise.all([
  fetch(`${base}/junimo-mcp.exe`),
  fetch(`${base}/junimo-mcp.exe.sha256`),
])
if (!exeRes.ok || !shaRes.ok) {
  throw new Error(`下载失败：exe=${exeRes.status} sha256=${shaRes.status}`)
}

const exe = Buffer.from(await exeRes.arrayBuffer())
const shaText = (await shaRes.text()).trim()
const expected = shaText.split(/\s+/)[0]
const actual = createHash('sha256').update(exe).digest('hex')

if (expected !== actual) {
  throw new Error(`校验失败：官方 sha256=${expected}，实际=${actual}。已中止，未写入任何文件。`)
}

mkdirSync(binDir, { recursive: true })
writeFileSync(join(binDir, 'junimo-mcp.exe'), exe)
writeFileSync(join(binDir, 'junimo-mcp.exe.sha256'), `${shaText}\n`)
writeFileSync(join(binDir, 'BUNDLED_VERSION'), `${tag}\n`)

console.log(`✓ ${tag} 已写入 bin/（sha256 ${actual.slice(0, 16)}…，${(exe.length / 1048576).toFixed(1)} MB）`)
console.log('  记得 git add bin/ 并提交。')
