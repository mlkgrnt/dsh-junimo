/**
 * 把真实的 `PanelView` 渲染成静态 HTML，用于设计评审与视觉回归。
 *
 * 为什么值得单独写一个：这个面板是手写在 client bundle 里的，没有 JSX、没有构建、
 * 也没法在 Node 里跑真 React（宿主不给我们装依赖）。但「看起来对不对」只能靠眼睛，
 * 所以这里用极小假 React 把组件树摊平成 HTML —— 渲染的是**真实组件**，不是另抄一份
 * 样式，改坏了立刻能看出来。
 *
 * 用法：node test/render-panel.mjs <输出.html>
 */

import { strict as assert } from 'node:assert'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const out = process.argv[2]
assert.ok(out !== undefined, '用法：node test/render-panel.mjs <输出.html> [light|dark|offline]')
/** 只渲染一列（配合无头截图放大看细节）；不传则三列并排。 */
const only = process.argv[3]

/* ---------- 假 React：建树即可，不调度 ---------- */

const reactStub = {
  createElement(type, props, ...children) {
    const merged = { ...(props ?? {}) }
    if (children.length === 1) merged.children = children[0]
    else if (children.length > 1) merged.children = children
    return { type, props: merged }
  },
  useState(initial) { return [initial, () => {}] },
  useEffect() {},
  useRef(value) { return { current: value } },
}

globalThis.window = { __ModuleLoader__: { load(registration) { globalThis.__reg = registration } } }
await import(new URL(`file:///${path.join(repoRoot, 'client', 'index.js').replaceAll('\\', '/')}`).href)

const mod = globalThis.__reg.factory(spec => {
  if (spec === 'react') return reactStub
  throw new Error(`没有提供模块 ${spec}`)
})

/* ---------- 树 → HTML ---------- */

/** 行内样式：驼峰转短横线，数值补 px（这几个属性例外，必须是纯数字）。 */
const UNITLESS = new Set(['opacity', 'fontWeight', 'flex', 'zIndex', 'aspectRatio', 'lineHeight', 'flexGrow', 'flexShrink', 'order'])

function css(style) {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([key, value]) => {
      const name = key.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`)
      const raw = typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : String(value)
      return `${name}:${raw}`
    })
    .join(';')
}

function escapeHtml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** SVG 里这些属性名是短横线形态，React 的驼峰写法要转回去。 */
const ATTRS = { shapeRendering: 'shape-rendering', viewBox: 'viewBox', 'aria-hidden': 'aria-hidden' }

function toHtml(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string') return escapeHtml(node)
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(toHtml).join('')
  if (typeof node.type === 'function') return toHtml(node.type(node.props))

  const { props } = node
  const attrs = []
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children' || key === 'ref') continue
    if (value === undefined || value === null || value === false) continue
    if (key === 'style') { attrs.push(`style="${css(value)}"`); continue }
    if (typeof value === 'function') continue
    const name = ATTRS[key] ?? key
    attrs.push(`${name}="${escapeHtml(String(value))}"`)
  }
  const open = attrs.length > 0 ? `<${node.type} ${attrs.join(' ')}>` : `<${node.type}>`
  return `${open}${toHtml(props.children)}</${node.type}>`
}

/* ---------- fixtures：三种真实状态 ---------- */

const spring = {
  ok: true, mod: true, ready: true,
  time: { season: 'spring', day: 20, year: 1, timeOfDay: 640, weather: 0 },
  player: { name: 'DeepSeek', x: 12, y: 34, facing: 2, health: 100, maxHealth: 100, stamina: 140, maxStamina: 270, money: 500, tool: '锄头', moving: false },
  location: { name: '农场', width: 80, height: 65 },
  inventory: [
    { name: '锄头', count: 1, category: '工具' },
    { name: '防风草种子', count: 15, category: '种子' },
    { name: '浇水壶', count: 1, category: '工具', water: { left: 40, max: 40 } },
    { name: '石头', count: 48, category: '资源' },
    { name: '木材', count: 32, category: '资源' },
  ],
  menu: null,
  event: null,
}

const autumn = {
  ok: true, mod: true, ready: true,
  time: { season: 'fall', day: 26, year: 2, timeOfDay: 2140, weather: 1 },
  player: { name: 'DeepSeek', x: 41, y: 7, facing: 1, health: 9, maxHealth: 100, stamina: 64, maxStamina: 270, money: 12480, tool: '铁剑', moving: true },
  location: { name: '矿洞 20 层', width: 40, height: 25 },
  inventory: [
    { name: '铁剑', count: 1, category: '武器' },
    { name: '石头', count: 48, category: '资源' },
    { name: '铜矿石', count: 7, category: '资源' },
    { name: '樱桃炸弹', count: 3, category: '消耗品' },
    { name: '香蒜酱', count: 2, category: '料理' },
    { name: '咖啡', count: 1, category: '料理' },
    { name: '大蒜种子', count: 9, category: '种子' },
    { name: '煤炭', count: 4, category: '资源' },
    { name: '生命药水', count: 2, category: '消耗品' },
    { name: '木箱', count: 1, category: '杂物' },
    { name: '铜锭', count: 5, category: '资源' },
    { name: '地晶', count: 1, category: '矿物' },
    { name: '石英', count: 3, category: '矿物' },
    { name: '发光戒指', count: 1, category: '戒指' },
  ],
  menu: 'Chest',
  event: { id: '13', skippable: true, message: '…这东西是从哪儿来的？' },
}

const offline = { ok: false, mod: false, ready: false, error: 'connect ECONNREFUSED 127.0.0.1:7842' }

/** 另外两季只为了看节日角标和风景带：夏黄、冬蓝各一条。 */
const summer = {
  ...spring,
  time: { season: 'summer', day: 11, year: 1, timeOfDay: 1520, weather: 0 },
  player: { ...spring.player, stamina: 200 },
}

const winter = {
  ...spring,
  time: { season: 'winter', day: 8, year: 1, timeOfDay: 930, weather: 5 },
}

/* get_state 的真实原文（与 client-bundle.mjs 的样例同构），用来喂工具卡。 */
const stateText = [
  '【玩家】DeepSeek · 位置 农场(12,34) · 朝向 下',
  '【状态】HP 100/100 · 体力 270/270 · 500g · 手持 锄头',
  '【时间】春 20日 · 第 1 年 · 06:00',
  '【天气】晴',
  '【地图】农场（80x65）',
  '【菜单】无',
  '【背包】3 格：',
  '  1. 锄头 x1（工具）',
  '  2. 防风草种子 x15（种子）',
  '  3. 浇水壶 x1（工具，水 40/40）',
].join('\n')

const cardBlock = {
  callTime: 0,
  time: 840,
  isError: false,
  subCalls: [],
  content: [{ type: 'text', text: stateText }],
}

/**
 * 跑一次真实的 `apply()`，只为把 `openPanelFn` 装上 —— 工具卡上的「看季历」
 * 按钮是否出现取决于它，不跑 apply 就截图会漏掉这个交互点。
 */
{
  const fakeCtx = {
    slots: { inject() {}, register() {} },
    inject(_services, cb) { cb(fakeCtx) },
    effect(factory) { return factory() },
    sidebarRightTabs: { register() {} },
    sidebarRight: { openTab() {} },
  }
  mod.apply(fakeCtx)
}

/* ---------- 组装页面 ---------- */

const darkVars = `
  --dsw-alias-label-primary:#e8eaed; --dsw-alias-label-secondary:#a9b1bb;
  --dsw-alias-label-tertiary:#8b939e; --dsw-alias-label-caption:#7d858f;
  --dsw-alias-border-l1:rgba(255,255,255,.09); --dsw-alias-border-l2:rgba(255,255,255,.16);
  --dsw-alias-bg-layer-1:rgba(255,255,255,.03); --dsw-alias-bg-layer-2:rgba(255,255,255,.07);
  --dsw-alias-state-business-primary:#7c8cff; --dsw-alias-state-success-primary:#3ecf7f;
  --dsw-alias-state-warn-label:#e0a53c; --dsw-alias-state-error-primary:#ff6b60;
`
const lightVars = `
  --dsw-alias-label-primary:#1f2329; --dsw-alias-label-secondary:#55606d;
  --dsw-alias-label-tertiary:#8b939e; --dsw-alias-label-caption:#9aa2ac;
  --dsw-alias-border-l1:rgba(127,127,127,.12); --dsw-alias-border-l2:rgba(127,127,127,.20);
  --dsw-alias-bg-layer-1:rgba(127,127,127,.03); --dsw-alias-bg-layer-2:rgba(127,127,127,.08);
  --dsw-alias-state-business-primary:#4d6bfe; --dsw-alias-state-success-primary:#1a9d5a;
  --dsw-alias-state-warn-label:#b7791f; --dsw-alias-state-error-primary:#d93025;
`

const cols = [
  { id: 'light', cls: '', cap: '浅色 · 春 20 日', body: () => toHtml(mod.PanelView({ data: spring })) },
  { id: 'summer', cls: '', cap: '浅色 · 夏 11 日', body: () => toHtml(mod.PanelView({ data: summer })) },
  { id: 'winter', cls: '', cap: '浅色 · 冬 8 日', body: () => toHtml(mod.PanelView({ data: winter })) },
  { id: 'dark', cls: ' dark', cap: '深色 · 秋 26 日 · 矿洞', body: () => toHtml(mod.PanelView({ data: autumn })) },
  { id: 'offline', cls: '', cap: '未连接', body: () => toHtml(mod.PanelView({ data: offline })) },
  { id: 'card', cls: '', cap: '工具卡 · 正常', body: () => toHtml(mod.JunimoStateCard({ phase: 'result', block: cardBlock })) },
  { id: 'carderr', cls: '', cap: '工具卡 · 未进档', body: () => toHtml(mod.JunimoStateCard({
    phase: 'result',
    block: { callTime: 0, time: 120, isError: false, subCalls: [], content: [{ type: 'text', text: '游戏还没有进入存档，请先进档再操作。' }] },
  })) },
].filter(c => only === undefined || only === 'seasons' ? (only === undefined || ['light', 'dark', 'summer', 'winter'].includes(c.id)) : c.id === only)

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>季历面板 · 真实组件渲染</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:#eceef2; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; display:flex; flex-wrap:wrap; gap:20px; align-items:flex-start; justify-content:center; }
  .col { display:flex; flex-direction:column; gap:8px; }
  .cap { font-size:12px; letter-spacing:.05em; color:#8b939e; text-transform:uppercase; padding-left:2px; }
  .board { width:392px; border-radius:12px; overflow:hidden; border:1px solid rgba(127,127,127,.18); background:#f7f8fa; ${lightVars} }
  .board.dark { ${darkVars} background:#191b1f; border-color:rgba(255,255,255,.10); }
  .board.pad { padding:10px; }
</style></head>
<body>
${cols.map(c => `  <div class="col"><div class="cap">${c.cap}</div><div class="board${c.cls}${c.id.startsWith('card') ? ' pad' : ''}">${c.body()}</div></div>`).join('\n')}
</body></html>`

await writeFile(out, html, 'utf8')
console.log(`panel preview → ${out}`)
