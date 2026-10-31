/**
 * 客户端半边（`client/index.js`）的离线校验。
 *
 * 这个文件是手写 bundle，格式错了不会在 `dune`/`node --check` 里报，只会在
 * dsh 启动后表现为「工具行没变化」，排查成本极高。所以这里用假的
 * `window.__ModuleLoader__` + 假的 react 把 bundle 真的加载一遍，断言三件事：
 *   1. 注册的 id 与包名一致（加载器按包名认领 factory，写错就静默不生效）；
 *   2. `apply` 把接管的工具名登记进 keyed slot；
 *   3. `parseState` 能吃下 junimo-mcp 的真实输出格式，包括背包条目。
 *
 * 不依赖 dsh 运行时，也不联网、不进游戏。
 */

import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/* ---------- 1. 加载 bundle，抓注册信息 ---------- */

const registrations = []
globalThis.window = {
  __ModuleLoader__: {
    load(registration) { registrations.push(registration) },
  },
}

/**
 * 假 react：只实现 bundle 真正用到的那两个导出，但实现得足以把组件树渲染成
 * 一棵可遍历的普通对象树（不重渲染、不调度，只求「组件跑得通、文本出得来」）。
 */
const reactStub = {
  createElement(type, props, ...children) {
    const merged = { ...(props ?? {}) }
    if (children.length === 1) merged.children = children[0]
    else if (children.length > 1) merged.children = children
    return { type, props: merged }
  },
  useState(initial) { return [initial, () => {}] },
}

/** 把组件树摊平成文本，用来断言卡片里真的出现了这些内容。 */
function textOfTree(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) textOfTree(child, out)
    return out
  }
  if (typeof node.type === 'function') return textOfTree(node.type(node.props), out)
  textOfTree(node.props.children, out)
  return out
}

/** 找到「文案匹配且带 onClick」的那个节点，用来直接触发按钮。 */
function findByText(node, text) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByText(child, text)
      if (hit !== null) return hit
    }
    return null
  }
  if (typeof node.type === 'function') return findByText(node.type(node.props), text)
  if (typeof node.props.onClick === 'function' && textOfTree(node).join('').includes(text)) return node
  return findByText(node.props.children, text)
}

const bundlePath = path.join(repoRoot, 'client', 'index.js')

function pathToFileUrl(file) {
  return new URL(`file:///${file.replaceAll('\\', '/').replace(/^\/+/, '')}`).href
}

await import(pathToFileUrl(bundlePath))

assert.equal(registrations.length, 1, 'bundle 必须只注册一个 factory')

const [registration] = registrations
const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))

assert.equal(
  registration.id,
  pkg.name,
  'factory 的 id 必须等于包名：加载器只按包名认领 factory，写错会静默不生效',
)
assert.equal(
  pkg.exports['./client'],
  './client/index.js',
  'package.json 的 exports["./client"] 必须指向本 bundle',
)
assert.equal(pkg.dsh.client.platform, 'web', 'dsh.client.platform 必须是 web')

/* ---------- 2. 物化模块并检查 apply ---------- */

const requested = []
const mod = registration.factory((spec) => {
  requested.push(spec)
  if (spec === 'react') return reactStub
  throw new Error(`测试没有提供模块 ${spec}`)
})

assert.ok(requested.includes('react'), 'bundle 应该通过注入的 require 拿 react')

/**
 * bundle 纯净性：模块表只认「平台种子词」和本行声明的 external，别的 require
 * 一律在浏览器里抛 "missed the module table"。这条规则 dsh 侧的构建期检查我们
 * 用不上（手写），所以在这里自己守。
 */
const PLATFORM_MODULES = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
])
const allowed = new Set([...PLATFORM_MODULES, ...(pkg.dsh.client.external ?? [])])
for (const spec of requested) {
  assert.ok(allowed.has(spec), `bundle 只能 require 平台种子模块，越界了：${spec}`)
}

/** exports["./client"] 指向的文件必须真的存在，否则宿主报 "client bundle not found"。 */
const bundleExists = await readFile(path.join(repoRoot, pkg.exports['./client']), 'utf8')
assert.ok(bundleExists.length > 0)

/**
 * 风景带是程序生成的，规则和手写图元不一样：
 * 必须**逐行等宽**（PixelArt 按第一行算 viewBox），必须**可复现**
 * （同一个季节两次生成要一模一样，否则每次轮询画面都在抖），
 * 不同季节必须真的不同（别把 key 拼错了却看不出来）。
 */
for (const season of ['spring', 'summer', 'fall', 'winter', 'unknown']) {
  const a = mod.sceneGrid(season)
  const b = mod.sceneGrid(season)
  assert.deepEqual(a, b, `风景带 ${season} 两次生成不一致（不确定的话画面会抖）`)
  const width = a.grid[0].length
  assert.ok(width > 0)
  a.grid.forEach((line, index) => assert.equal(line.length, width, `风景带 ${season} 第 ${index} 行宽度不一致`))
  assert.ok(a.grid.join('').includes('g'), `风景带 ${season} 没有地面`)
  for (const ch of a.grid.join('')) {
    assert.ok(ch === '.' || a.palette[ch] !== undefined, `风景带 ${season} 用了没有颜色的字符 "${ch}"`)
  }
}
assert.notDeepEqual(mod.sceneGrid('spring').grid, mod.sceneGrid('winter').grid, '春秋风景带不应相同')
assert.notDeepEqual(mod.sceneGrid('summer').palette, mod.sceneGrid('fall').palette, '夏秋配色不应相同')

/**
 * 像素图元必须逐行等宽 —— `PixelArt` 按 `grid[0].length` 算 viewBox，
 * 某行短一截不会报错，只会在画面上缺一块。这是唯一能静态抓住的手误。
 */
for (const [name, art] of Object.entries(mod.ART)) {
  const width = art.grid[0].length
  art.grid.forEach((line, index) => {
    assert.equal(line.length, width, `ART.${name} 第 ${index} 行宽度 ${line.length} ≠ ${width}`)
    for (const ch of line) {
      assert.ok(
        ch === '.' || art.palette[ch] !== undefined,
        `ART.${name} 第 ${index} 行用了调色板里没有的字符 "${ch}"`,
      )
    }
  })
}

for (const dep of pkg.dsh.client.inject ?? []) {
  assert.match(dep, /^@deepseek-ai\//, `dsh.client.inject 里应是 dsh 自身的包名，收到 ${dep}`)
}
assert.equal(typeof mod.apply, 'function', 'client 半边必须导出 apply')
assert.deepEqual(mod.inject, ['slots'], 'client 半边必须声明 slots 依赖')

const registered = []
const injectedServices = []
const tabTypes = []
const opened = []

/** 假 ctx：只实现 bundle 真正碰到的五个成员，其余故意不给（越界立刻炸）。 */
const ctx = {
  slots: {
    inject(_name, factory) {
      return factory()
    },
    register(spec, component) {
      registered.push({ spec, component })
      return () => {}
    },
  },
  inject(services, callback) {
    injectedServices.push(services)
    callback(ctx)
  },
  effect(factory) {
    return factory()
  },
  sidebarRightTabs: {
    register(definition) {
      tabTypes.push(definition)
      return () => {}
    },
  },
  sidebarRight: {
    openTab(kind) {
      opened.push(kind)
    },
  },
}
mod.apply(ctx)

const toolviews = registered.filter(entry => entry.spec.name === 'tool.call.toolview')
assert.ok(toolviews.length > 0, '至少要接管一个工具名')
for (const { spec, component } of toolviews) {
  assert.match(spec.key, /^mcp__junimo__[a-z_]+$/, `key 必须是 wire 工具名，收到 ${spec.key}`)
  assert.equal(typeof component, 'function', '登记值必须是组件')
}

/* ---------- 2b. 右栏季历页的注册面 ---------- */

assert.deepEqual(injectedServices, [['sidebarRightTabs', 'sidebarRight']], '右栏服务必须按需注入，不能进顶层 inject')
assert.equal(tabTypes.length, 1, '只注册一个标签类型')

const tabType = tabTypes[0]
assert.equal(typeof tabType.id, 'string')
assert.equal(typeof tabType.kind, 'string')
assert.equal(
  tabType.patterns,
  undefined,
  '省略 patterns 才是「页面类型」——按 kind 打开，不做地址路由',
)
assert.equal(typeof tabType.title(), 'string')
assert.ok(Array.isArray(tabType.guide) && tabType.guide.length > 0, '要有引导页入口，否则用户找不到这页')
assert.equal(typeof tabType.guide[0].icon, 'function', '入口胶囊要带像素图标')

const panelBody = registered.find(entry => entry.spec.name === 'sidebar.right.pane.tab')
const panelTitle = registered.find(entry => entry.spec.name === 'sidebar.right.pane.tab.title')
assert.ok(panelBody !== undefined, '要注册标签正文')
assert.ok(panelTitle !== undefined, '要注册标签标题')
for (const entry of [panelBody, panelTitle]) {
  assert.equal(entry.spec.key, tabType.id, '正文/标题的 slot key 必须等于标签类型的 id')
  assert.equal(typeof entry.component, 'function')
}

/* ---------- 2c. 卡片上的「看季历」真的能打开右栏 ---------- */

const card = {
  phase: 'result',
  block: {
    kind: 'tool-result', seq: 1, time: 2, callId: 'c', call: { name: 'mcp__junimo__get_state', argsRaw: '{}' },
    callTime: 1, content: [{ type: 'text', text: '【时间】春 1日 · 第 1 年 · 06:00' }], isError: false, subCalls: [],
  },
}
const cardTree = mod.JunimoStateCard({ toolName: 'mcp__junimo__get_state', callId: 'c', ...card })
const openButton = findByText(cardTree, '看季历')
assert.ok(openButton !== null, '卡片上应该有「看季历」按钮')
openButton.props.onClick()
assert.deepEqual(opened, [tabType.kind], '按钮应打开这个标签类型')


/* ---------- 3. parseState 吃真实输出格式 ---------- */

const sample = [
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

const rows = mod.parseState(sample)
const byTag = new Map(rows.filter(r => r.tag !== null).map(r => [r.tag, r]))

assert.deepEqual(
  [...byTag.keys()],
  ['玩家', '状态', '时间', '天气', '地图', '菜单', '背包'],
  '每个【标签】行都应识别出来，顺序保持原文顺序',
)

const bag = byTag.get('背包')
assert.equal(bag.count, 3)
assert.equal(bag.items.length, 3, '背包条目应从后续缩进行解析')
assert.deepEqual(
  bag.items.map(i => [i.index, i.name, i.count, i.note]),
  [
    [1, '锄头', 1, '工具'],
    [2, '防风草种子', 15, '种子'],
    [3, '浇水壶', 1, '工具，水 40/40'],
  ],
)
assert.equal(byTag.get('天气').body, '晴')

// 未进档时是一句整话，没有【标签】，必须落成单条无标签行而不是空数组。
const notReady = mod.parseState('游戏还没有进入存档（当前在标题界面或加载中）。请先在游戏里载入存档后再操作。')
assert.equal(notReady.length, 1)
assert.equal(notReady[0].tag, null)

// 空背包：只有标题行没有条目。
const emptyBag = mod.parseState('【背包】0 格：')
assert.equal(emptyBag.length, 1)
assert.equal(emptyBag[0].count, 0)
assert.equal(emptyBag[0].items.length, 0)

console.log('client bundle: 结构断言通过')

/* ---------- 4. 组件真渲染：三个 phase 都不能抛，结算后文本要出得来 ---------- */

const Card = mod.JunimoStateCard
assert.equal(typeof Card, 'function')

/** 直接以组件身份调用（我们的假 react 不做调度）。 */
function renderCard(props) {
  return textOfTree(Card({ toolName: 'mcp__junimo__get_state', callId: 'c1', ...props }))
}

const preparing = renderCard({ phase: 'preparing', block: { phase: 'preparing', callId: 'c1' } }).join('')
assert.ok(preparing.includes('正在读取状态'), 'preparing 阶段应给占位而不是空洞')

const started = renderCard({ phase: 'start', block: { phase: 'start', callId: 'c1', name: 'mcp__junimo__get_state', argsRaw: '{}' } }).join('')
assert.ok(started.includes('正在读取状态'), 'start 阶段还没结果，也走占位')

const settled = renderCard({
  phase: 'result',
  block: {
    kind: 'tool-result',
    seq: 2,
    time: 4000,
    callId: 'c1',
    call: { name: 'mcp__junimo__get_state', argsRaw: '{}' },
    callTime: 1000,
    content: [{ type: 'text', text: sample }],
    isError: false,
    subCalls: [],
  },
})
const settledText = settled.join('')
for (const expected of ['星露谷 · 状态', '春 20日 · 第 1 年 · 06:00', '3.0s', '500g', '锄头', '防风草种子', '×15', '晴']) {
  assert.ok(settledText.includes(expected), `结算卡片应包含「${expected}」，实际输出：${settledText}`)
}

// 错误结果走红框分支，且原文仍可读。
const failed = renderCard({
  phase: 'result',
  block: {
    kind: 'tool-result', seq: 2, time: 1200, callId: 'c1',
    call: { name: 'mcp__junimo__get_state', argsRaw: '{}' }, callTime: 1000,
    content: [{ type: 'text', text: '连接被拒绝：7842' }], isError: true, subCalls: [],
  },
})
assert.ok(failed.join('').includes('状态读取失败'))

// 未进档是警告色分支，不是错误分支。
const notReadyCard = renderCard({
  phase: 'result',
  block: {
    kind: 'tool-result', seq: 2, time: 1200, callId: 'c1',
    call: { name: 'mcp__junimo__get_state', argsRaw: '{}' }, callTime: 1000,
    content: [{ type: 'text', text: '游戏还没有进入存档（当前在标题界面或加载中）。' }], isError: false, subCalls: [],
  },
})
assert.ok(notReadyCard.join('').includes('未进档'))

console.log('client bundle: 组件渲染断言通过')

