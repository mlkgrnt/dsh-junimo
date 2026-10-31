/**
 * dsh-junimo 客户端半边（浏览器）。
 *
 * 手写 bundle，不引入构建链：本文件就是最终产物，按 dsh 的 client 模块格式包成
 * 一个「注册工厂」的闭包。加载器执行本文件时只做一件事——把 factory 登记进模块表，
 * 模块体（所有副作用）留到首次 require 时才跑。
 *
 * 三个落点，共用一套像素图元：
 *
 *   1. `tool.call.toolview` —— 把 `mcp__junimo__get_state` 的工具行换成一屏状态卡；
 *   2. `sidebar.right.pane.tab` —— 右侧栏的「季历」页：季历 + 状态两块；
 *   3. 卡片上的「看季历」—— 从对话里一键把右栏那页打开。
 *
 * 美术一律 SVG：所有图标都是「字符串网格 + 调色板」现画的像素图，一格一个字符，
 * `shape-rendering: crispEdges` 保硬边。为什么不用图片：bundle 的 require 只认平台
 * 种子模块，`import './x.png'` 这条路根本不存在；矢量图顺带还随缩放不失真。
 * 这些图形全部自绘，不含游戏原始素材。
 */

window.__ModuleLoader__.load({
  id: 'dsh-junimo',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const h = React.createElement
    const { useState, useEffect, useRef } = React

    /** 本插件在浏览器侧要求的服务：只有 slot 调度器（右栏那两个按需注入）。 */
    const inject = ['slots']

    /* ================================================================== *
     * 主题变量
     *
     * 面板底色/文字/描边一律走 dsh 的 alias token，第二参数是兜底——token 改名
     * 或主题没覆盖时至少不是透明或纯黑。像素图元是固定色，不跟主题走（这正是
     * 像素画该有的样子）。
     * ================================================================== */

    const C = {
      text: 'var(--dsw-alias-label-primary, #1f2329)',
      dim: 'var(--dsw-alias-label-secondary, #55606d)',
      faint: 'var(--dsw-alias-label-tertiary, #8b939e)',
      caption: 'var(--dsw-alias-label-caption, #9aa2ac)',
      border: 'var(--dsw-alias-border-l2, rgba(127,127,127,.20))',
      borderSoft: 'var(--dsw-alias-border-l1, rgba(127,127,127,.12))',
      bg: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.03))',
      chipBg: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,.08))',
      accent: 'var(--dsw-alias-state-business-primary, #4d6bfe)',
      ok: 'var(--dsw-alias-state-success-primary, #1a9d5a)',
      warn: 'var(--dsw-alias-state-warn-label, #b7791f)',
      err: 'var(--dsw-alias-state-error-primary, #d93025)',
      mono: 'var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
      sans: 'var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif)',
      radius: 'var(--dsw-radius-md, 8px)',
      radiusSm: 'var(--dsw-radius-sm, 6px)',
      xs: 'var(--dsw-font-xs-13, 12px)',
    }

    /* ================================================================== *
     * 像素图元库
     *
     * 一格一个字符，'.' 透明；每个字符查调色板。逐行等宽是这类图唯一的硬约束。
     * ================================================================== */

    const ART = {
      sun: {
        palette: { y: '#f5c542' },
        grid: [
          '.....yy.....',
          '..y..yy..y..',
          '...yyyyyy...',
          '..yyyyyyyy..',
          'y..yyyyyy..y',
          'y..yyyyyy..y',
          '..yyyyyyyy..',
          '...yyyyyy...',
          '..y..yy..y..',
          '.....yy.....',
        ],
      },
      // 天气图元只出现在深色胶囊里（压在季节渐变上），所以云与雨滴都提亮过一档。
      rain: {
        palette: { c: '#cfdae7', d: '#7fc4ff' },
        grid: [
          '....ccc.....',
          '..ccccccc...',
          '.ccccccccc..',
          'ccccccccccc.',
          '.ccccccccc..',
          '..d...d...d.',
          '...d...d....',
          '..d...d...d.',
        ],
      },
      storm: {
        palette: { c: '#c6d2df', b: '#ffd75e' },
        grid: [
          '....ccc.....',
          '..ccccccc...',
          '.ccccccccc..',
          'ccccccccccc.',
          '.cccbbcccc..',
          '.....bb.....',
          '....bb......',
          '....bbb.....',
          '.....b......',
        ],
      },
      wind: {
        palette: { c: '#d3deea' },
        grid: [
          '....cccc....',
          '..cccccccc..',
          '.cccccccccc.',
          '........cc..',
          '..cccccccc..',
          '.cccccccc...',
          '........cc..',
          '..cccccc....',
        ],
      },
      snow: {
        palette: { w: '#dfeeff' },
        grid: [
          '.....w.....',
          '..w..w..w..',
          '...w.w.w...',
          '....www....',
          'ww..www..ww',
          'ww..www..ww',
          '....www....',
          '...w.w.w...',
          '..w..w..w..',
          '.....w.....',
        ],
      },
      flower: {
        palette: { p: '#e8799b', y: '#f5c542', g: '#4f9e3f' },
        grid: [
          '....p.p....',
          '...pp.pp...',
          '....ppp....',
          '..pp.y.pp..',
          '...p.y.p...',
          '....yyy....',
          '.....g.....',
          '....gg.....',
          '.....g.....',
          '...ggg.....',
        ],
      },
      maple: {
        palette: { r: '#e07a3c', o: '#a8431a', b: '#7a4a22', s: '#a8743c' },
        grid: [
          '....r.r....',
          '...rrrrr...',
          '..rrrrrrr..',
          '.rrrorrrrr.',
          'rrrroorrrrr',
          '.rrrorrrrr.',
          '..rrrrrrr..',
          '...rrrrr...',
          '....bs.....',
          '....bs.....',
        ],
      },
      coin: {
        palette: { c: '#8a6a2b', y: '#f2c14e', C: '#b8860b' },
        grid: [
          '..ccccc..',
          '.cyyyyyc.',
          'cyyCCyyyc',
          'cyyCCyyyc',
          'cyyCCyyyc',
          'cyyyyyyyc',
          'cyyyyyyyc',
          '.cyyyyyc.',
          '..ccccc..',
        ],
      },
      /* 下面三个是「区块小标题」用的图标，只会出现在 14–17px，
       * 所以刻意画得粗：1px 的细线在这个尺寸下会糊成一团色块。 */
      bag: {
        palette: { d: '#7a5426', b: '#b07c3c', B: '#f0d49a' },
        grid: [
          '..dd...dd..',
          '.d..d.d..d.',
          '.ddddddddd.',
          '.dbbbbbbbd.',
          '.dbBBBBbbd.',
          '.dbbbbbbbd.',
          '.dbbbbbbbd.',
          '.ddddddddd.',
        ],
      },
      cal: {
        palette: { d: '#c0504d', w: '#fbf6ea', k: '#c0504d' },
        grid: [
          '..d.....d..',
          'ddddddddddd',
          'ddddddddddd',
          'dwwwwwwwwwd',
          'dwkkwwkkwwd',
          'dwwwwwwwwwd',
          'dwkkwwkkwwd',
          'dwwwwwwwwwd',
          'ddddddddddd',
        ],
      },
      pin: {
        palette: { p: '#c0504d', d: '#ffffff' },
        grid: [
          '..ppppp..',
          '.p.....p.',
          'p...d...p',
          'p...d...p',
          'p...d...p',
          '.p.....p.',
          '..ppppp..',
          '....p....',
          '....p....',
          '....p....',
        ],
      },
      /* 节日角标：格子只有 ~44px，旗子必须「旗面大、旗杆清楚」，否则就是一抹粉点。 */
      flag: {
        palette: { t: '#b08a55', f: '#e2574f', h: '#ffb3a6' },
        grid: [
          't........',
          'tfffffff.',
          'tfhhhhff.',
          'tfhhhhff.',
          'tfffffff.',
          't........',
          't........',
          't........',
        ],
      },
      junimo: {
        palette: { g: '#8ed07a', G: '#4f9e3f', w: '#ffffff', d: '#12310f' },
        grid: [
          '..............',
          '.....g..g.....',
          '....gG..Gg....',
          '.....gggg.....',
          '...gggggggg...',
          '..gggggggggg..',
          '.gggggggggggg.',
          '.ggwwggggwwgg.',
          '.ggwdggggwdgg.',
          '.gggggggggggg.',
          '.gggggggggggg.',
          '..gggggggggg..',
          '...gggggggg...',
          '....gg..gg....',
          '.....g..g.....',
          '..............',
        ],
      },

      /* ---------- 状态区语义图标 ----------
       * 这些只会出现在 9–13px，所以一律「粗、少细节、有高光」：
       * 在 12px 上画超过 7 列的细节等于自杀。 */

      cloud: {
        palette: { w: '#ffffff', s: '#dbe7f2' },
        grid: [
          '....wwww.....',
          '..wwwwwww.ww.',
          '.wwwwwwwwwww.',
          'wwwwwwwwwwwww',
          '.sssssssssss.',
        ],
      },
      moon: {
        palette: { m: '#f4e7b8', d: '#d8c58a' },
        grid: [
          '..mmm..',
          '.mmmm..',
          'mmmm...',
          'mmmm...',
          'mmmm...',
          '.mmmm..',
          '..mmm..',
        ],
      },
      heart: {
        palette: { r: '#e5484d', h: '#ff9aa0' },
        grid: [
          '..rr.rr..',
          '.rrrrrrr.',
          'rrrhhrrrr',
          'rrrhhrrrr',
          '.rrrrrrr.',
          '..rrrrr..',
          '...rrr...',
          '....r....',
        ],
      },
      bolt: {
        palette: { y: '#f5b73c' },
        grid: [
          '...yyy.',
          '..yyy..',
          '.yyy...',
          'yyyyyy.',
          '.yyyy..',
          '..yyy..',
          '.yyy...',
          'yy.....',
        ],
      },
      person: {
        palette: { s: '#c8a07a', b: '#6b8cbe' },
        grid: [
          '..sss..',
          '.sssss.',
          '.sssss.',
          '..sss..',
          '.bbbbb.',
          'bbbbbbb',
          'bbbbbbb',
          '.bb.bb.',
          '.bb.bb.',
        ],
      },
      chest: {
        palette: { d: '#8a5f2c', m: '#d9a961', k: '#ffe08a' },
        grid: [
          'ddddddddd',
          'dmmmmmmmd',
          'dmmmmmmmd',
          'ddddddddd',
          'dmmmkmmmd',
          'dmmmkmmmd',
          'dmmmmmmmd',
          'ddddddddd',
        ],
      },
      chat: {
        palette: { d: '#5b7fb5', w: '#eef4fb', k: '#5b7fb5' },
        grid: [
          '.ddddddd.',
          'dwwwwwwwd',
          'dwkwwkwwd',
          'dwwwwwwwd',
          'dwwwwwwwd',
          'dwwwwwwwd',
          '.ddddddd.',
          '...dd....',
        ],
      },
      hoe: {
        palette: { b: '#d9a961', h: '#a8763c' },
        grid: [
          '.....bbbb',
          '.....bbbb',
          '.....h...',
          '....h....',
          '...h.....',
          '..h......',
          '.h.......',
          'h........',
        ],
      },
      sword: {
        palette: { s: '#d7e0ea', g: '#a8763c' },
        grid: [
          '.......ss',
          '......sss',
          '.....sss.',
          '....sss..',
          '...sss...',
          '..sss....',
          '.gs......',
          'ggg......',
          '.g.......',
        ],
      },
      pick: {
        palette: { b: '#b8c4d2', h: '#a8763c' },
        grid: [
          'b.......b',
          'bb.....bb',
          '.bbbbbbb.',
          '....h....',
          '....h....',
          '...h.....',
          '..h......',
          '.h.......',
        ],
      },
      axe: {
        palette: { b: '#b8c4d2', h: '#a8763c' },
        grid: [
          '..bbbbbb.',
          '..bbbbbbb',
          '..bbbbbb.',
          '...bbb...',
          '....h....',
          '....h....',
          '....h....',
          '...h.....',
        ],
      },
      can: {
        palette: { s: '#9fb3c8', d: '#5f7488' },
        grid: [
          '..sssss..',
          '.s.sss.s.',
          's..sss..s',
          's..sss..s',
          'sssssssss',
          'sssssssss',
          '.sssssss.',
        ],
      },

      /* ---------- 背包分类字形（7×7，只会挂在 chip 里） ---------- */

      seed: {
        palette: { g: '#5aa350', t: '#3d7d3a' },
        grid: [
          '..g.g..',
          '.gg.gg.',
          '..ggg..',
          '...t...',
          '...t...',
          '...t...',
        ],
      },
      stone: {
        palette: { d: '#8b93a1', l: '#c8ced8' },
        grid: [
          '..lll..',
          '.ldddd.',
          'ldddddd',
          'ddddddd',
          '.ddddd.',
        ],
      },
      potion: {
        palette: { g: '#b9c6d8', l: '#5bb5e8' },
        grid: [
          '..ggg..',
          '..ggg..',
          '.ggggg.',
          '.glllg.',
          '.glllg.',
          '.ggggg.',
        ],
      },
      food: {
        palette: { d: '#c0504d', h: '#f2e0a8' },
        grid: [
          '.ddddd.',
          'dhhhhhd',
          'dhhhhhd',
          '.dhhhd.',
          '..ddd..',
        ],
      },
      gem: {
        palette: { g: '#6bb7e0', l: '#d6f0ff' },
        grid: [
          '..ggg..',
          '.ggggg.',
          'ggllggg',
          '.ggggg.',
          '..ggg..',
        ],
      },
      ring: {
        palette: { g: '#f2c14e', y: '#e2574f' },
        grid: [
          '..yyy..',
          '..ggg..',
          '.g...g.',
          '.g...g.',
          '..ggg..',
        ],
      },
      /* ---------- 节日字形（7×7 / 7×9） ----------
       * 八个节日各画一个：日历上「13」和「24」不再是同一个旗子，
       * 光看格子就知道是什么节日。统一 1.4 倍缩放 ≈ 10px。 */

      egg: {
        // 蛋壳用琥珀色而不是奶白：奶白在浅色面板的周末底色上只剩一圈描边，
        // 远看像颗土豆。琥珀底 + 深红条纹才读得出「彩蛋」。
        palette: { w: '#e8b44a', p: '#c0504d' },
        grid: [
          '..www..',
          '.wwwww.',
          'wwwwwww',
          'wwpppww',
          'wwwwwww',
          '.wwwww.',
          '..www..',
        ],
      },
      flowerS: {
        palette: { p: '#d9557a', y: '#d99b1f', g: '#3f8a35' },
        grid: [
          '..p.p..',
          '.pp.pp.',
          '..ppp..',
          '...y...',
          '...y...',
          '..ggg..',
          '...g...',
        ],
      },
      pineapple: {
        palette: { g: '#3f8a35', y: '#d99b1f' },
        grid: [
          '..g.g..',
          '.ggggg.',
          '..yyy..',
          '.yyyyy.',
          'yyyyyyy',
          '.yyyyy.',
          'yyyyyyy',
          '.yyyyy.',
          '..yyy..',
        ],
      },
      jelly: {
        palette: { p: '#4f9ec4', h: '#bfe6f2' },
        grid: [
          '..ppp..',
          '.ppppp.',
          'pphhppp',
          'ppppppp',
          '.p.p.p.',
          '.p.p.p.',
          '.p.p.p.',
        ],
      },
      star: {
        palette: { y: '#d99b1f' },
        grid: [
          '...y...',
          '...y...',
          '.yyyyy.',
          '..yyy..',
          '.yyyyy.',
          '.y.y.y.',
          '.y...y.',
        ],
      },
      pumpkin: {
        palette: { o: '#cc6a1f', g: '#3f8a35' },
        grid: [
          '...g...',
          '..ooo..',
          '.ooooo.',
          'ooooooo',
          'ooooooo',
          '.ooooo.',
          '..ooo..',
        ],
      },
      snowS: {
        palette: { w: '#8fbcd8' },
        grid: [
          '...w...',
          '.w.w.w.',
          '..www..',
          'wwwwwww',
          '..www..',
          '.w.w.w.',
          '...w...',
        ],
      },
      gift: {
        palette: { r: '#e2574f', k: '#ffe08a' },
        grid: [
          '.r...r.',
          '.rrrrr.',
          'rrrrrrr',
          'rrkkkrr',
          'rrkkkrr',
          '.rrrrr.',
          '.rrrrr.',
        ],
      },
      box: {
        palette: { d: '#9c7448', m: '#d9a961' },
        grid: [
          'ddddddd',
          'dmmmmmd',
          'dmmmmmd',
          'ddddddd',
          'dmmmmmd',
          'ddddddd',
        ],
      },
    }

    /**
     * 任意「字符网格 + 调色板」→ SVG。一个字符一个 1×1 rect，靠 viewBox 缩放。
     *
     * 拆出来是因为图元不只是手写的：季历底下那条风景带是**程序生成**的网格，
     * 宽度由可用像素决定，没法写成 ART 里的常量。
     *
     * @param props.grid - 等宽字符串数组，'.' 为透明。
     * @param props.palette - 字符 → 颜色。
     * @param props.scale - 每个像素的边长（px），默认 2。
     */
    function PixelArt(props) {
      const grid = props.grid
      if (!Array.isArray(grid) || grid.length === 0) return null
      const art = props.palette
      const scale = props.scale === undefined ? 2 : props.scale
      const rows = grid.length
      const cols = grid[0].length
      const rects = []
      for (let y = 0; y < rows; y += 1) {
        const line = grid[y]
        for (let x = 0; x < line.length; x += 1) {
          const ch = line[x]
          if (ch === '.') continue
          const fill = art[ch]
          if (fill === undefined) continue
          rects.push(h('rect', { key: `${x},${y}`, x, y, width: 1, height: 1, fill }))
        }
      }
      return h(
        'svg',
        {
          width: cols * scale,
          height: rows * scale,
          viewBox: `0 0 ${cols} ${rows}`,
          shapeRendering: 'crispEdges',
          style: { display: 'block', flex: '0 0 auto', opacity: props.opacity },
          'aria-hidden': 'true',
        },
        rects,
      )
    }

    /**
     * 具名图元 → React 元素。
     * @param props.name - 图元名（ART 的键）。
     * @param props.scale - 每个像素的边长（px），默认 2。
     */
    function Pixel(props) {
      const art = ART[props.name]
      if (art === undefined) return null
      return h(PixelArt, { grid: art.grid, palette: art.palette, scale: props.scale, opacity: props.opacity })
    }

    /* ================================================================== *
     * 季历静态数据
     *
     * 星露谷每季 **28 天 = 正好 4 周**，且 **1 号固定是周一** —— 所以季历永远
     * 是整齐的 4 行 7 列，不做任何偏移计算，也不会出现半空行。
     * ================================================================== */

    const WEEK = ['一', '二', '三', '四', '五', '六', '日']

    const SEASONS = {
      spring: {
        label: '春',
        art: 'flower',
        days: 28,
        /** 渐变的亮端 → 暗端。两端都够深，白字在浅色和深色主题下都读得清。 */
        grad: 'linear-gradient(135deg, #79c268 0%, #4e9b47 55%, #3d7d3a 100%)',
        /** 「今天」格子的实色填充：必须与季帯同色系，否则整块撞色。 */
        accent: '#3d7d3a',
        /** 节日格子的底色：同色系低透明度，浅色主题下也看得出「这天有活动」。 */
        tint: 'rgba(78,155,71,.16)',
        festivals: { 13: '彩蛋节', 24: '花之舞' },
      },
      summer: {
        label: '夏',
        art: 'sun',
        days: 28,
        grad: 'linear-gradient(135deg, #f0c14a 0%, #d99b1f 55%, #a86f0c 100%)',
        accent: '#a86f0c',
        tint: 'rgba(217,155,31,.18)',
        festivals: { 11: '夏威夷宴会', 28: '月光水母之舞' },
      },
      fall: {
        label: '秋',
        art: 'maple',
        days: 28,
        grad: 'linear-gradient(135deg, #e8944f 0%, #cc6a28 55%, #8f4211 100%)',
        accent: '#8f4211',
        tint: 'rgba(204,106,40,.18)',
        festivals: { 16: '星露谷集市', 27: '灵魂之夜' },
      },
      winter: {
        label: '冬',
        art: 'snow',
        days: 28,
        grad: 'linear-gradient(135deg, #7fb2dc 0%, #4e86b5 55%, #2f6389 100%)',
        accent: '#2f6389',
        tint: 'rgba(78,134,181,.18)',
        festivals: { 8: '冰雪节', 25: '冬星盛宴' },
      },
    }

    /** 未知季节的兜底，避免面板整块消失。 */
    const UNKNOWN_SEASON = {
      label: '?',
      art: 'sun',
      days: 28,
      grad: 'linear-gradient(135deg, #8d97a6 0%, #6b7483 55%, #4b525e 100%)',
      accent: '#4b525e',
      tint: 'rgba(107,116,131,.16)',
      festivals: {},
    }

    /* ================================================================== *
     * 季历底部的像素风景带
     *
     * 手写 87 列的网格不现实，逐列复制又会看出平铺痕迹，所以按季**程序生成**：
     * 远山/近坡用正弦叠出来，树和地面点缀走确定性伪随机（同一个季节每次渲染
     * 必须一模一样，否则轮询一次画面就抖一次）。
     * ================================================================== */

    const SCENES = {
      spring: { far: '#b3dcaa', near: '#7cc46a', ground: '#4e9b47', deep: '#3d7d3a', canopy: '#f0a8bf', leaf: '#5aa350', trunk: '#8a6a4a', dot: '#f7e6a8', shape: 'round' },
      summer: { far: '#d5e394', near: '#9cc85a', ground: '#6aa03c', deep: '#4d7a26', canopy: '#f5c542', leaf: '#7fbf4a', trunk: '#8a6a4a', dot: '#fff0b8', shape: 'round' },
      fall: { far: '#eec79a', near: '#d98a4a', ground: '#a85c28', deep: '#7f421a', canopy: '#e2574f', leaf: '#c96a2a', trunk: '#7a4a22', dot: '#f2c14e', shape: 'round' },
      winter: { far: '#e2edf8', near: '#f4f9ff', ground: '#c6dcee', deep: '#a9c6dc', canopy: '#5d8296', leaf: '#7fa8bd', trunk: '#5a4632', dot: '#ffffff', shape: 'pine' },
      unknown: { far: '#b9c0ca', near: '#9aa3af', ground: '#7b838f', deep: '#5f6672', canopy: '#6e7783', leaf: '#8b94a0', trunk: '#5b6270', dot: '#dfe3ea', shape: 'round' },
    }

    /** 32 位 LCG。只要确定性，不需要统计学质量。 */
    function seeded(seed) {
      let state = seed >>> 0
      return () => {
        state = (state * 1664525 + 1013904223) >>> 0
        return state / 4294967296
      }
    }

    const SCENE_W = 116
    /** 画布高度。8 行给远景/树冠，1 行地面，1 行深土 —— 9 行时树冠压到 3 行，看起来像一根竖条。 */
    const SCENE_H = 10
    /** 地面顶行的行号：树站这一行上。 */
    const SCENE_HORIZON = 8
    const SCENE_SCALE = 3

    /**
     * @param key - 季节名。
     * @param columns - 画布列数。**必须跟着容器宽度走**：右侧栏实测 633px，
     *   按固定 116 列画会只剩中间一小条，两边全是空白。
     */
    function sceneGrid(key, columns) {
      const S = SCENES[key] === undefined ? SCENES.unknown : SCENES[key]
      const W = Math.max(40, Math.round(columns === undefined ? SCENE_W : columns))
      const H = SCENE_HORIZON
      const grid = []
      for (let y = 0; y < SCENE_H; y += 1) grid.push(new Array(W).fill('.'))
      const put = (x, y, ch) => {
        if (x >= 0 && x < W && y >= 0 && y < SCENE_H) grid[y][x] = ch
      }

      // 远山：两条不同周期的正弦叠加 —— 单条正弦会看出规律的波浪，像心电图。
      for (let x = 0; x < W; x += 1) {
        const top = Math.max(1, Math.min(H - 2, 3 + Math.round(1.7 + 1.7 * Math.sin(x / 12.7 + 0.5) + 0.7 * Math.sin(x / 4.1))))
        for (let y = top; y <= H - 1; y += 1) put(x, y, 'f')
      }
      // 近坡：压在前一层下面，只露出一截起伏
      for (let x = 0; x < W; x += 1) {
        const top = Math.max(H - 3, Math.min(H - 1, H - 2 + Math.round(1.1 * Math.sin(x / 7.3 + 2.1))))
        for (let y = top; y <= H - 1; y += 1) put(x, y, 'n')
      }
      // 地面：顶行浅、底行深。底行撒几粒浅色土块，不然整条是纯色板，像木条。
      for (let x = 0; x < W; x += 1) {
        put(x, H, 'g')
        put(x, H + 1, 'd')
      }

      const rand = seeded(key.length * 977 + 31)
      // 树的间距按画布宽度缩放：固定 17 列在 197 列的宽画布上会挤成一道栅栏。
      const gap = Math.max(14, Math.round(W / 7))
      let last = -99
      for (let x = 6; x < W - 6; x += 1) {
        if (x - last < gap * (0.7 + rand() * 0.6) || rand() > 0.55) continue
        last = x
        if (S.shape === 'pine') {
          // 针叶树：越往下越宽，1/3/3/5/5 五层，树干露出两行
          put(x, 1, 'c')
          for (let dx = -1; dx <= 1; dx += 1) put(x + dx, 2, 'c')
          for (let dx = -1; dx <= 1; dx += 1) put(x + dx, 3, 'c')
          for (let dx = -2; dx <= 2; dx += 1) put(x + dx, 4, 'c')
          for (let dx = -2; dx <= 2; dx += 1) put(x + dx, 5, 'c')
          put(x, 6, 't')
          put(x, 7, 't')
          continue
        }
        // 阔叶树：3/5/5 三层树冠 + 一行暗色下缘，树干两行
        for (let dx = -1; dx <= 1; dx += 1) put(x + dx, 2, 'c')
        for (let dx = -2; dx <= 2; dx += 1) put(x + dx, 3, 'c')
        for (let dx = -2; dx <= 2; dx += 1) put(x + dx, 4, 'c')
        for (let dx = -1; dx <= 1; dx += 1) put(x + dx, 5, 'l')
        put(x, 6, 't')
        put(x, 7, 't')
      }

      // 地面点缀：花 / 穗 / 落叶 / 雪，压在地面顶行上；
      // 再撒几丛 3 格宽的草丛贴在地平线，让那条直线不至于太死板。
      for (let x = 0; x < W; x += 1) {
        if (rand() > 0.18) continue
        put(x, H, 'a')
        if (rand() > 0.7) put(x, H - 1, 'a')
      }
      for (let x = 2; x < W - 2; x += 1) {
        if (rand() > 0.07) continue
        const h = 1 + Math.round(rand())
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let k = 0; k < h; k += 1) put(x + dx, H - 1 - k, k === h - 1 && dx === 0 ? 'a' : 'l')
        }
      }
      // 深土行的浅色土块：给下半条一点颗粒感
      for (let x = 0; x < W; x += 1) {
        if (rand() > 0.10) continue
        put(x, H + 1, 'g')
      }

      return {
        grid: grid.map(row => row.join('')),
        palette: { f: S.far, n: S.near, g: S.ground, d: S.deep, c: S.canopy, l: S.leaf, t: S.trunk, a: S.dot },
      }
    }

    /**
     * 风景带：**按容器宽度现算列数**。
     *
     * 右侧栏不是固定宽度（实测能到 633px，窄的时候 300 出头），
     * 一开始按 116 列写死，结果宽栏下只剩中间一小条、两边大空白。
     * 这里用 ResizeObserver 量一次真实宽度，再按 `列数 = 宽度 / 3` 重生成网格。
     */
    function Scenery(props) {
      const [width, setWidth] = useState(0)
      const box = useRef(null)
      useEffect(() => {
        const el = box.current
        if (el === null || el === undefined) return undefined
        const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
        measure()
        if (typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
      }, [])
      const columns = width > 0 ? Math.max(40, Math.round(width / SCENE_SCALE)) : SCENE_W
      const scene = sceneGrid(props.season, columns)
      return h(
        'div',
        { ref: box, style: { marginTop: '3px', display: 'flex', borderRadius: '4px', overflow: 'hidden' } },
        h(PixelArt, { grid: scene.grid, palette: scene.palette, scale: SCENE_SCALE }),
      )
    }

    const WEATHERS = {
      0: { label: '晴', art: 'sun' },
      1: { label: '雨', art: 'rain' },
      2: { label: '雷雨', art: 'storm' },
      3: { label: '大风', art: 'wind' },
      5: { label: '雪', art: 'snow' },
      7: { label: '绿雨', art: 'rain' },
    }

    const FACING = ['上', '右', '下', '左']

    /** 周末两列压一层极淡的底，让 4×7 的网格有「周」的结构感。 */
    const WEEKEND_TINT = 'rgba(127,127,127,.08)'

    /** 节日名 → 格子角标字形。对不上的（例如以后加的新节日）退回旗子。 */
    const FESTIVAL_ART = {
      彩蛋节: 'egg',
      花之舞: 'flowerS',
      夏威夷宴会: 'pineapple',
      月光水母之舞: 'jelly',
      星露谷集市: 'star',
      灵魂之夜: 'pumpkin',
      冰雪节: 'snowS',
      冬星盛宴: 'gift',
    }

    /** 背包物品分类 → chip 前面的小字形。没对上的分类就不挂图标，别硬凑。 */
    const CATEGORY_ART = {
      工具: 'hoe',
      种子: 'seed',
      资源: 'stone',
      武器: 'sword',
      消耗品: 'potion',
      料理: 'food',
      矿物: 'gem',
      戒指: 'ring',
      杂物: 'box',
    }

    /** 手上拿的东西 → 图标。星露谷的工具就那么几类，认关键字比列表可靠。 */
    function toolIcon(name) {
      const text = typeof name === 'string' ? name : ''
      if (/剑|刀/.test(text)) return 'sword'
      if (/壶|罐|can/i.test(text)) return 'can'
      if (/镐/.test(text)) return 'pick'
      if (/斧/.test(text)) return 'axe'
      return 'hoe'
    }

    /* ================================================================== *
     * 小工具
     * ================================================================== */

    /** 游戏原始 timeOfDay（600 = 06:00）→ "HH:MM"。 */
    function clockText(timeOfDay) {
      const v = typeof timeOfDay === 'number' && Number.isFinite(timeOfDay) ? timeOfDay : 0
      return `${String(Math.floor(v / 100)).padStart(2, '0')}:${String(v % 100).padStart(2, '0')}`
    }

    /** 一天 06:00 起床 → 次日 02:00 晕倒，共 20 小时。 */
    function dayRatio(timeOfDay) {
      const v = typeof timeOfDay === 'number' && Number.isFinite(timeOfDay) ? timeOfDay : 0
      const minutes = Math.floor(v / 100) * 60 + (v % 100)
      return Math.min(1, Math.max(0, (minutes - 360) / 1200))
    }

    function num(value, fallback) {
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback
    }

    function seasonOf(name) {
      return SEASONS[name] === undefined ? UNKNOWN_SEASON : SEASONS[name]
    }

    /** 风景带按季名取调色板；未知季落到 grey 版，整块不会突然消失。 */
    function seasonKeyOf(name) {
      return SEASONS[name] === undefined ? 'unknown' : name
    }

    /* ================================================================== *
     * 展示原子件
     * ================================================================== */

    function Chip(props) {
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '1px 7px',
            borderRadius: C.radiusSm,
            background: C.chipBg,
            color: props.tone === undefined ? C.text : props.tone,
            fontSize: C.xs,
            lineHeight: '18px',
            whiteSpace: 'nowrap',
          },
        },
        props.children,
      )
    }

    /** 十格血条：比连续进度条更像游戏 HUD，也更适合 12px 的小尺寸。 */
    function SegBar(props) {
      const value = num(props.value, 0)
      const max = num(props.max, 0)
      const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
      const filled = Math.round(ratio * 10)
      const color = ratio <= 0.15 ? C.err : ratio <= 0.35 ? C.warn : props.tone
      const cells = []
      for (let i = 0; i < 10; i += 1) {
        cells.push(
          h('span', {
            key: i,
            style: {
              width: '6px',
              height: '9px',
              borderRadius: '1px',
              background: i < filled ? color : C.chipBg,
            },
          }),
        )
      }
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
        props.icon === undefined
          ? h('span', { style: { color: C.caption, fontSize: C.xs, width: '26px', flex: '0 0 auto' } }, props.label)
          // 图标替代文字：心/闪电在游戏语境里比 "HP"/"体力" 更快认
          : h('span', { style: { display: 'flex', justifyContent: 'center', width: '26px', flex: '0 0 auto' } },
              h(Pixel, { name: props.icon, scale: 1.2 })),
        h('span', { style: { display: 'flex', gap: '2px' } }, cells),
        h(
          'span',
          { style: { color: C.dim, fontSize: C.xs, fontFamily: C.mono } },
          `${Math.round(value)}/${Math.round(max)}`,
        ),
      )
    }

    /** 区块外壳：统一的小标题 + 内容，让「季历」与「状态」看起来是一套东西。 */
    function Block(props) {
      return h(
        'section',
        {
          style: {
            border: `1px solid ${C.borderSoft}`,
            borderRadius: C.radius,
            background: C.bg,
            padding: '8px 10px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
          },
        },
        h(
          'header',
          { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          props.art === undefined ? null : h(Pixel, { name: props.art, scale: 1.6 }),
          h('span', { style: { color: C.text, fontSize: C.xs, fontWeight: 600 } }, props.title),
          h('span', { style: { flex: '1 1 auto' } }),
          props.extra === undefined ? null : props.extra,
        ),
        props.children,
      )
    }

    /** 「标签 + 值」的一行，面板里所有文字信息都走这个骨架。 */
    function Field(props) {
      return h(
        'div',
        // 52px 是量出来的：「下个节日」四字 48px，40px 会溢进值列粘成「下个节日花之舞」；
        // 48px 在真实字体下也只剩两三像素，读起来还是连在一起，所以留到 52 再配 10px 间距。
        { style: { display: 'grid', gridTemplateColumns: '52px 1fr', gap: '10px', alignItems: 'baseline' } },
        h('span', { style: { color: C.caption, fontSize: C.xs, whiteSpace: 'nowrap' } }, props.label),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 6px', alignItems: 'center' } }, props.children),
      )
    }

    /* ================================================================== *
     * 一、季历区块
     * ================================================================== */

    function CalendarBlock(props) {
      const data = props.data
      const ready = data !== undefined && data.ready === true
      const season = ready ? seasonOf(data.time.season) : UNKNOWN_SEASON
      const today = ready ? num(data.time.day, 1) : 0
      const festivals = season.festivals

      const festDays = Object.keys(festivals).map(Number).sort((a, b) => a - b)
      const next = today === 0 ? undefined : festDays.find(day => day >= today)
      const countdown =
        next === undefined
          ? today === 0
            ? '进档后显示'
            : '本季已无节日'
          : next === today
            ? '就是今天'
            : `${next - today} 天后`

      const cells = []
      for (let day = 1; day <= season.days; day += 1) {
        const isToday = day === today
        const isFest = festivals[day] !== undefined
        // 1 号固定周一 ⇒ (day-1)%7 = 5/6 就是周六/周日
        const isWeekend = (day - 1) % 7 >= 5
        // 角标放右上角：数字居中，两者不会打架（双位数也不会压到）。
        // 「今天 + 节日」的格子是季色实底，彩色字形会跟底色同色系糊掉，
        // 所以那种情况下把字形滤成纯白（brightness(0)+invert(1)），
        // 底色都是深色 accent，白字形怎么都读得出。
        //
        // 其余格子的底色是极淡的季色 tint（秋 #d99b1f @14% 之类），
        // 而节日字形本来就是中调色 —— 星/菠萝那种黄字落在浅橙底上几乎看不见。
        // 一个方向的投影救不了，得给字形描一圈深棕描边（四向 1px shadow 叠出边框），
        // 这样任何中调字形在浅底/深底上都立得住。
        const markFilter = isToday
          ? 'brightness(0) invert(1) drop-shadow(0 1px 1px rgba(0,0,0,.35))'
          : 'drop-shadow(1px 0 0 rgba(58,34,14,.55)) drop-shadow(-1px 0 0 rgba(58,34,14,.55))'
            + ' drop-shadow(0 1px 0 rgba(58,34,14,.55)) drop-shadow(0 -1px 0 rgba(58,34,14,.55))'
        const marks = isFest
          ? [h('span', { key: 'mark', style: { position: 'absolute', right: '1px', top: '1px', lineHeight: 0, filter: markFilter } },
              h(Pixel, { name: FESTIVAL_ART[festivals[day]] === undefined ? 'flag' : FESTIVAL_ART[festivals[day]], scale: 2.1 }))]
          : []
        cells.push(
          h(
            'div',
            {
              key: day,
              title: isFest ? festivals[day] : undefined,
              style: {
                position: 'relative',
                // 固定行高，不要 aspect-ratio：宽栏下 1:1 会把格子撑成 90×90 的大方块；
                // 换成 max-height 更糟 —— 格子宽 40 而列宽 84，周末底色只剩号码周围一小块。
                height: '40px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: C.mono,
                fontSize: C.xs,
                background: isToday ? season.accent : isFest ? season.tint : isWeekend ? WEEKEND_TINT : 'transparent',
                color: isToday ? '#ffffff' : C.dim,
                boxShadow: isToday ? '0 0 0 1.5px rgba(255,255,255,.55) inset' : 'none',
                fontWeight: isToday ? 700 : 400,
                opacity: today > 0 && day < today ? 0.42 : 1,
              },
            },
            h('span', null, day),
            marks,
          ),
        )
      }

      return h(
        Block,
        { art: 'cal', title: '季历' },
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' } },
          WEEK.map(day => h('span', { key: day, style: { textAlign: 'center', fontSize: '10px', color: C.caption } }, day)),
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' } }, cells),
        h(Scenery, { season: ready ? seasonKeyOf(data.time.season) : 'unknown' }),
        h(
          Field,
          { label: '下个节日' },
          h('span', { style: { color: next === undefined ? C.faint : C.text, fontSize: C.xs } },
            next === undefined ? '—' : `${festivals[next]} · ${season.label} ${next} 日`),
          h(Chip, { tone: next === undefined ? C.faint : C.dim }, countdown),
        ),
      )
    }

    /* ================================================================== *
     * 二、状态区块
     * ================================================================== */

    function StatusBlock(props) {
      const data = props.data
      const [bagOpen, setBagOpen] = useState(false)

      if (data === undefined) {
        return h(Block, { art: 'bag', title: '状态' },
          h('span', { style: { color: C.faint, fontSize: C.xs } }, '正在读取…'))
      }
      if (data.ready !== true) {
        const message = data.mod === false
          ? '连不上游戏（mod 没起来，或游戏没开）'
          : data.error === undefined
            ? '还没进档'
            : data.error
        return h(
          Block,
          {
            art: 'bag',
            title: '状态',
            extra: h('span', { style: { color: C.warn, fontSize: C.xs } }, data.mod === false ? '未连接' : '未进档'),
          },
          h('span', { style: { color: C.faint, fontSize: C.xs } }, message),
        )
      }

      const player = data.player
      const location = data.location
      const inventory = Array.isArray(data.inventory) ? data.inventory : []
      const limit = 12
      const shown = bagOpen ? inventory : inventory.slice(0, limit)
      const hidden = inventory.length - shown.length

      const bagChips = shown.map((item, index) =>
        h(
          Chip,
          { key: `${index}:${item.name}` },
          CATEGORY_ART[item.category] === undefined
            ? null
            : h(Pixel, { key: 'k', name: CATEGORY_ART[item.category], scale: 1.5 }),
          item.name,
          item.count > 1 ? h('span', { style: { color: C.faint, fontFamily: C.mono } }, `×${item.count}`) : null,
          item.water === undefined
            ? null
            : h('span', { style: { color: C.faint, fontFamily: C.mono } }, `${item.water.left}/${item.water.max}`),
        ),
      )
      if (hidden > 0 || (bagOpen && inventory.length > limit)) {
        bagChips.push(
          h('button', {
            key: 'more',
            type: 'button',
            onClick: () => { setBagOpen(!bagOpen) },
            style: { border: 'none', background: 'none', padding: '0 4px', color: C.accent, font: 'inherit', fontSize: C.xs, cursor: 'pointer' },
          }, bagOpen ? '收起' : `展开其余 ${hidden} 格`),
        )
      }

      const alerts = []
      if (data.menu !== null && data.menu !== undefined) {
        alerts.push(h(Field, { key: 'menu', label: '菜单' },
          h(Pixel, { name: 'chest', scale: 1.2 }),
          h('span', { style: { color: C.warn, fontSize: C.xs } }, `打开中：${data.menu}`)))
      }
      if (data.event !== null && data.event !== undefined) {
        alerts.push(
          h(Field, { key: 'event', label: '剧情' },
            h(Pixel, { name: 'chat', scale: 1.2 }),
            h(Chip, { tone: C.warn }, `事件进行中${data.event.skippable ? '（可跳过）' : ''}`),
            data.event.message === ''
              ? null
              : h('span', { style: { color: C.dim, fontSize: C.xs } }, `「${data.event.message}」`)),
        )
      }

      return h(
        Block,
        {
          art: 'bag',
          title: '状态',
          extra: h('span', { style: { color: C.faint, fontSize: C.xs } }, `${inventory.length} 格背包`),
        },
        h(
          Field,
          { label: '玩家' },
          h(Pixel, { name: 'person', scale: 1.2 }),
          h('span', { style: { color: C.text, fontSize: C.xs, fontWeight: 600 } }, player.name),
          h(Pixel, { name: 'pin', scale: 1.2 }),
          h('span', { style: { color: C.dim, fontSize: C.xs } }, `${location.name || '未知地点'}(${player.x},${player.y})`),
          h('span', { style: { color: C.faint, fontSize: C.xs } }, `朝${FACING[player.facing] === undefined ? '?' : FACING[player.facing]}`),
        ),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '5px', padding: '1px 0' } },
          h(SegBar, { icon: 'heart', value: player.health, max: player.maxHealth, tone: C.ok }),
          h(SegBar, { icon: 'bolt', value: player.stamina, max: player.maxStamina, tone: C.accent }),
        ),
        h(
          Field,
          { label: '持有' },
          h(Pixel, { name: 'coin', scale: 1.5 }),
          h('span', { style: { color: C.warn, fontSize: C.xs, fontFamily: C.mono } }, `${player.money}g`),
          h('span', { style: { color: C.faint, fontSize: C.xs } }, '手持'),
          h(Pixel, { name: toolIcon(player.tool), scale: 1.2 }),
          h('span', { style: { color: C.text, fontSize: C.xs } }, player.tool),
          player.moving ? h('span', { style: { color: C.accent, fontSize: C.xs } }, '移动中') : null,
        ),
        alerts.length > 0 ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px' } }, alerts) : null,
        h(Field, { label: '背包' }, bagChips),
      )
    }

    /* ================================================================== *
     * 三、季节带（面板顶部）
     * ================================================================== */

    function SeasonStrip(props) {
      const data = props.data
      const ready = data !== undefined && data.ready === true
      const season = ready ? seasonOf(data.time.season) : UNKNOWN_SEASON
      const weather = ready && data.time.weather !== undefined ? WEATHERS[data.time.weather] : undefined
      const ratio = ready ? dayRatio(data.time.timeOfDay) : 0
      const day = ready ? num(data.time.day, 1) : 0

      return h(
        'div',
        {
          style: {
            position: 'relative',
            padding: '12px 14px 11px',
            background: season.grad,
            color: '#ffffff',
            overflow: 'hidden',
            // 顶部一条 1px 亮边：像游戏 UI 的玻璃高光，也把渐变和上面的卡片分开
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22)',
          },
        },
        // 像素抖动纹理。纯装饰，pointerEvents 关掉免得挡住点击。
        h('div', {
          style: {
            position: 'absolute',
            inset: '0',
            pointerEvents: 'none',
            backgroundImage: 'radial-gradient(rgba(255,255,255,.55) 1px, transparent 1px)',
            backgroundSize: '4px 4px',
            opacity: 0.10,
          },
        }),
        // ---- 第一行：季节徽章 / 年份 / 天气 / 时钟 ----
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '7px', position: 'relative', zIndex: 1 } },
          // 徽章：把像素图装进一个半透明格子，像游戏里的物品栏槽位
          h(
            'span',
            {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '7px',
                // 槽位用深色而不是白色：夏季的黄太阳放在浅色槽里会溶进琥珀渐变，
                // 深色槽 + 白色描边才能让四季的图元都立得住（和天气胶囊同一个道理）。
                background: 'rgba(0,0,0,.20)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.30)',
              },
            },
            // 白色描边（drop-shadow 四向叠不出来，用一圈 1px 就够）：
            // 让粉色花、黄太阳、红叶在深色槽里都有一道亮边，不至于糊进背景。
            h('span', { style: { display: 'flex', filter: 'drop-shadow(0 0 1px rgba(255,255,255,.85))' } },
              h(Pixel, { name: season.art, scale: 1.3 })),
          ),
          h('span', { style: { fontSize: C.xs, fontWeight: 700, letterSpacing: '.10em' } }, ready ? season.label : '星露谷'),
          h('span', { style: { width: '1px', height: '11px', background: 'rgba(255,255,255,.38)', flex: '0 0 auto' } }),
          h('span', { style: { fontSize: '11px', opacity: 0.86, fontFamily: C.mono } }, ready ? `第 ${data.time.year} 年` : '未连接'),
          h('span', { style: { flex: '1 1 auto' } }),
          // 天气挂在深色胶囊里：像素图的固定色放到季节渐变上会糊掉，
          // 压一层半透明黑底才能让黄色的太阳和灰白的云都立得住。
          weather === undefined
            ? null
            : h(
                'span',
                {
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '2px 7px 2px 4px',
                    borderRadius: '9px',
                    background: 'rgba(0,0,0,.30)',
                    fontSize: '11px',
                  },
                },
                h(Pixel, { name: weather.art, scale: 1.2 }),
                weather.label,
              ),
          h('span', { style: { fontSize: '15px', fontWeight: 700, fontFamily: C.mono, letterSpacing: '-.02em' } }, ready ? clockText(data.time.timeOfDay) : '--:--'),
        ),
        // ---- 第二行：大号日期 + 星期 / 第几周 ----
        h(
          'div',
          { style: { display: 'flex', alignItems: 'flex-end', gap: '10px', marginTop: '5px', position: 'relative', zIndex: 1 } },
          h(
            'span',
            {
              style: {
                fontSize: '42px', lineHeight: 0.88, fontWeight: 700, fontFamily: C.mono,
                letterSpacing: '-.04em', textShadow: '0 1px 3px rgba(0,0,0,.22)',
              },
            },
            ready ? day : '—',
          ),
          h(
            'span',
            { style: { display: 'flex', flexDirection: 'column', gap: '1px', paddingBottom: '2px' } },
            ready
              ? h('span', { style: { fontSize: C.xs, fontWeight: 600, opacity: 0.95 } }, `星期${WEEK[(day - 1) % 7]}`)
              : h('span', { style: { fontSize: C.xs, opacity: 0.8 } }, '未进档'),
            ready
              ? h('span', { style: { fontSize: '10px', opacity: 0.72, fontFamily: C.mono } }, `第 ${Math.ceil(day / 7)} 周`)
              : null,
          ),
          h('span', { style: { flex: '1 1 auto' } }),
        ),
        // 第二行右侧那块是空的，补两朵像素云把「天空」填上（冬季换雪花）。
        // 云是纯白的，压在暖色渐变上会被染成灰粉；给一点冷色调 + 稍高的不透明度才像云。
        ready
          ? h('div', { style: { position: 'absolute', right: '86px', top: '40px', lineHeight: 0, opacity: 0.55, zIndex: 0 } },
              h(Pixel, { name: data.time.season === 'winter' ? 'snowS' : 'cloud', scale: 2.4 }))
          : null,
        ready
          ? h('div', { style: { position: 'absolute', right: '44px', top: '60px', lineHeight: 0, opacity: 0.36, zIndex: 0 } },
              h(Pixel, { name: data.time.season === 'winter' ? 'snowS' : 'cloud', scale: 1.7 }))
          : null,
        // ---- 第三行：全天进度条（06:00 起床 → 次日 02:00 晕倒） ----
        // 右端留 40px 给吉祥物，所以条子在它左边收住。
        h(
          'div',
          {
            style: {
              display: 'flex', alignItems: 'center', gap: '6px',
              marginTop: '7px', marginRight: '40px', position: 'relative', zIndex: 1,
            },
          },
          // 两端固定：左=起床(06:00)的太阳，右=晕倒(02:00)的月亮。
          // 别让左端也按「现在几点」换月亮 —— 夜里会出现两个月亮，看着像画错了。
          h(Pixel, { name: 'sun', scale: 1.1 }),
          h(
            'span',
            {
              style: {
                position: 'relative', flex: '1 1 auto', height: '5px', borderRadius: '3px',
                background: 'rgba(0,0,0,.20)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.16)',
              },
              title: ready ? `今天已过 ${Math.round(ratio * 20 * 10) / 10} / 20 小时` : undefined,
            },
            h('span', {
              style: {
                position: 'absolute', top: 0, bottom: 0, left: 0,
                width: `${(ratio * 100).toFixed(1)}%`, borderRadius: '3px',
                background: 'rgba(255,255,255,.85)',
              },
            }),
            // 当前位置的小圆点：比纯进度条多一个「现在几点」的读法
            h('span', {
              style: {
                position: 'absolute', top: '50%', left: `calc(${(ratio * 100).toFixed(1)}% - 4px)`,
                width: '8px', height: '8px', marginTop: '-4px', borderRadius: '50%',
                background: '#ffffff', boxShadow: '0 0 0 1.5px rgba(0,0,0,.25)',
              },
            }),
          ),
          h(Pixel, { name: 'moon', scale: 1.6 }),
        ),
        // 吉祥物坐在右下角。**不能**给负 bottom：这一层 overflow:hidden，
        // 探出去的那截会被切掉，看起来像图裂了而不是「探身」。
        h('div', { style: { position: 'absolute', right: '8px', bottom: '2px', zIndex: 2, lineHeight: 0 } }, h(Pixel, { name: 'junimo', scale: 2 })),
      )
    }

    /* ================================================================== *
     * 四、面板（纯渲染，数据由外层喂）
     *
     * 拆成纯渲染是刻意的：离线预览脚本可以把 fixture 直接喂进 PanelView 截图，
     * 不用跑宿主，也不用真的开游戏。
     * ================================================================== */

    function PanelView(props) {
      const data = props.data
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBottom: '12px',
            fontFamily: C.sans,
            color: C.text,
          },
        },
        h(SeasonStrip, { data }),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 10px' } },
          h(CalendarBlock, { data }),
          h(StatusBlock, { data })),
      )
    }

    /** 拉一次面板数据。相对 URL：web 与桌面（dsh-app://app/）都会被宿主接住。 */
    async function fetchPanel(signal) {
      const res = await fetch('junimo/panel', { signal, cache: 'no-store', headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    }

    /**
     * 面板容器：轮询宿主路由，失败降级成「未连接」而不是白屏。
     *
     * 标签被隐藏（切走 / 折叠）时停轮询——每 5 秒打一次游戏 API 没有意义，而且
     * mod 在模态界面下本来就脆。`useTabInfo` 由 slot 注入，取不到时按「可见」处理。
     */
    function JunimoPanel(props) {
      const useTab = typeof props.useTabInfo === 'function' ? props.useTabInfo : () => null
      const tab = useTab()
      const visible = tab === null || tab === undefined || tab.tab === undefined ? true : tab.tab.visible !== false

      const [data, setData] = useState(undefined)
      const alive = useRef(true)

      useEffect(() => {
        alive.current = true
        if (!visible) {
          return () => { alive.current = false }
        }
        const controller = new AbortController()
        let timer
        let inflight = false
        const tick = async () => {
          if (inflight || !alive.current) return
          inflight = true
          try {
            const next = await fetchPanel(controller.signal)
            if (alive.current) setData(next)
          } catch (error) {
            if (alive.current && !controller.signal.aborted) {
              setData({ ok: false, mod: false, ready: false, error: error instanceof Error ? error.message : String(error) })
            }
          } finally {
            inflight = false
            if (alive.current) timer = setTimeout(tick, 5000)
          }
        }
        void tick()
        return () => {
          alive.current = false
          controller.abort()
          clearTimeout(timer)
        }
      }, [visible])

      return h(PanelView, { data })
    }

    /** 标签 chip 的内容：小日历图元 + 名字。 */
    function JunimoTabTitle() {
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
        h(Pixel, { name: 'cal', scale: 1.1 }),
        h('span', null, '季历'),
      )
    }

    /* ================================================================== *
     * 五、工具行卡片（get_state）
     *
     * get_state 的工具输出是给人看的中文长文本，按「【标签】」逐行解析成结构化块；
     * 解析不出来就原样退回文本，不会比默认工具行更差。
     * ================================================================== */

    /** 用内点分段是安全的字段；【剧情】的引号台词里可能出现内点，整段保留。 */
    const SEGMENTED_TAGS = new Set(['玩家', '状态', '时间', '地图'])

    const ITEM_LINE = /^\s*(\d+)\.\s*(.+?)\s*x(\d+)（(.+)）\s*$/
    const BAG_HEAD = /^(\d+)\s*格/
    const HP_SEGMENT = /^HP\s+([\d.]+)\s*\/\s*([\d.]+)$/
    const STAMINA_SEGMENT = /^体力\s+([\d.]+)\s*\/\s*([\d.]+)$/

    function parseState(text) {
      const rows = []
      let bag = null
      for (const raw of text.split('\n')) {
        const line = raw.replace(/\s+$/, '')
        if (line === '') continue
        const head = /^【([^】]+)】(.*)$/.exec(line)
        if (head !== null) {
          const tag = head[1]
          const body = head[2].trim()
          if (tag === '背包') {
            const count = BAG_HEAD.exec(body)
            bag = { tag, count: count === null ? null : Number(count[1]), items: [], note: body }
            rows.push(bag)
          } else {
            rows.push({ tag, body, items: null })
          }
          continue
        }
        const item = ITEM_LINE.exec(line)
        if (bag !== null && item !== null) {
          bag.items.push({ index: Number(item[1]), name: item[2].trim(), count: Number(item[3]), note: item[4].trim() })
          continue
        }
        rows.push({ tag: null, body: line.trim(), items: null })
      }
      return rows
    }

    function segmentsOf(row) {
      if (row.tag === null || !SEGMENTED_TAGS.has(row.tag)) return [row.body]
      return row.body.split('·').map(part => part.trim()).filter(part => part !== '')
    }

    function textOf(block) {
      const content = block === null || block === undefined ? null : block.content
      if (!Array.isArray(content)) return ''
      const parts = []
      for (const part of content) {
        if (part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string') parts.push(part.text)
      }
      return parts.join('\n')
    }

    function durationOf(block) {
      if (block === null || block === undefined) return null
      if (typeof block.time !== 'number' || typeof block.callTime !== 'number') return null
      const ms = block.time - block.callTime
      if (!(ms >= 0)) return null
      if (ms < 1000) return `${Math.round(ms)}ms`
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
      return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
    }

    function Meter(props) {
      const value = Number(props.value)
      const max = Number(props.max)
      const ratio = max > 0 && Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0
      const tone = ratio <= 0.15 ? C.err : ratio <= 0.35 ? C.warn : props.tone
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: C.xs, color: C.dim, whiteSpace: 'nowrap' } },
        props.icon === undefined
          ? h('span', { style: { color: C.faint } }, props.label)
          : h(Pixel, { name: props.icon, scale: 1.1 }),
        h('span', { style: { position: 'relative', width: '54px', height: '5px', borderRadius: '3px', background: C.chipBg, overflow: 'hidden' } },
          h('span', { style: { position: 'absolute', inset: '0 auto 0 0', width: `${ratio * 100}%`, borderRadius: '3px', background: tone } })),
        h('span', { style: { fontFamily: C.mono, color: C.text } }, `${props.text}`),
      )
    }

    function Segment(props) {
      const text = props.text
      const hp = HP_SEGMENT.exec(text)
      // 只显示数字：标签已经在条子左边了，再带上原文就成了「HP ▬▬ HP 100/100」。
      if (hp !== null) return h(Meter, { icon: 'heart', value: hp[1], max: hp[2], text: `${hp[1]}/${hp[2]}`, tone: C.ok })
      const stamina = STAMINA_SEGMENT.exec(text)
      if (stamina !== null) return h(Meter, { icon: 'bolt', value: stamina[1], max: stamina[2], text: `${stamina[1]}/${stamina[2]}`, tone: C.accent })
      const tone = /g$/.test(text) ? C.warn : C.text
      return h(Chip, { tone }, text)
    }

    function CardBagRow(props) {
      const bag = props.bag
      const [open, setOpen] = useState(false)
      const items = bag.items
      const limit = 10
      const shown = open || items.length <= limit ? items : items.slice(0, limit)
      const hidden = items.length - shown.length
      const children = [h(Chip, { key: 'count', tone: C.dim }, bag.count === null ? bag.note : `${bag.count} 格`)]
      for (const item of shown) {
        // note 是括号里的原文（"工具"、"工具，水 40/40"），取第一段当分类
        const category = typeof item.note === 'string' ? item.note.split(/[，,]/)[0].trim() : ''
        children.push(
          h(Chip, { key: `i${item.index}`, tone: C.text },
            CATEGORY_ART[category] === undefined
              ? null
              : h(Pixel, { key: 'k', name: CATEGORY_ART[category], scale: 1.4 }),
            item.name,
            item.count > 1 ? h('span', { style: { color: C.faint, fontFamily: C.mono } }, `×${item.count}`) : null),
        )
      }
      if (hidden > 0 || open) {
        children.push(
          h('button', {
            key: 'more', type: 'button', onClick: () => { setOpen(!open) },
            style: { border: 'none', background: 'none', padding: '0 4px', color: C.accent, font: 'inherit', fontSize: C.xs, cursor: 'pointer' },
          }, open ? '收起' : `展开其余 ${hidden} 格`),
        )
      }
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } }, children)
    }

    function CardRow(props) {
      const row = props.row
      // 没有【标签】的整句话（例如「游戏还没有进入存档」）：直接当正文，
      // 别塞进 chip、也别缩进 46px，否则看起来像一条空标签的表格行。
      if (row.tag === null && row.items === null) {
        return h('div', { style: { color: C.dim, fontSize: C.xs, lineHeight: '18px', padding: '3px 0' } }, row.body)
      }
      const body = row.items === null
        ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 6px', alignItems: 'center' } },
            segmentsOf(row).map((text, index) => h(Segment, { key: `${index}:${text}`, text })))
        : h(CardBagRow, { bag: row })
      return h(
        'div',
        { style: { display: 'grid', gridTemplateColumns: '46px 1fr', gap: '8px', alignItems: 'baseline', padding: '3px 0' } },
        h('span', { style: { color: C.caption, fontSize: C.xs } }, row.tag === null ? '' : row.tag),
        body,
      )
    }

    function JunimoStateCard(props) {
      const phase = props.phase
      const block = props.block
      const [rawOpen, setRawOpen] = useState(false)

      if (phase === 'preparing' || phase === 'start') {
        return h('div', { style: { color: C.faint, fontSize: C.xs, padding: '2px 0' } }, '星露谷 · 正在读取状态…')
      }

      const raw = textOf(block)
      const failed = block !== undefined && block !== null && block.isError === true
      const notReady = /游戏还没有进入存档|无法解析/.test(raw)
      const rows = raw === '' ? [] : parseState(raw)
      const time = rows.find(row => row.tag === '时间')
      const meta = []
      if (time !== undefined) meta.push(h('span', { key: 't', style: { color: C.faint, fontSize: C.xs, fontFamily: C.mono } }, time.body))
      const duration = durationOf(block)
      if (duration !== null) meta.push(h('span', { key: 'd', style: { color: C.faint, fontSize: C.xs, fontFamily: C.mono } }, duration))

      const tone = failed ? C.err : notReady ? C.warn : C.accent
      const title = failed ? '星露谷 · 状态读取失败' : notReady ? '星露谷 · 未进档' : '星露谷 · 状态'

      const body = rows.length === 0
        ? h('div', { style: { color: C.faint, fontSize: C.xs } }, raw === '' ? '（无返回内容）' : raw)
        : rows.filter(row => row.tag !== '时间').map((row, index) => h(CardRow, { key: `${index}`, row }))

      const actions = []
      if (typeof openPanelFn === 'function') {
        actions.push(
          h('button', {
            key: 'open', type: 'button', onClick: () => { openPanelFn() },
            style: { border: 'none', background: 'none', padding: '0 2px', color: C.accent, font: 'inherit', fontSize: C.xs, cursor: 'pointer' },
          }, '看季历'),
        )
      }
      actions.push(
        h('button', {
          key: 'raw', type: 'button', onClick: () => { setRawOpen(!rawOpen) },
          style: { border: 'none', background: 'none', padding: '0 2px', color: rawOpen ? C.accent : C.faint, font: 'inherit', fontSize: C.xs, cursor: 'pointer' },
        }, rawOpen ? '隐藏原文' : '原文'),
      )

      return h(
        'div',
        {
          style: {
            border: `1px solid ${tone === C.accent ? C.borderSoft : tone}`,
            borderRadius: C.radius,
            background: C.bg,
            padding: '8px 10px',
            margin: '2px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          },
        },
        // 头部只放标题 + meta：372px 宽下塞进按钮会把按钮挤到第二行左贴边，像正文。
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h(Pixel, { name: 'junimo', scale: 1 }),
          h('span', { style: { color: C.text, fontSize: C.xs, fontWeight: 600, whiteSpace: 'nowrap' } }, title),
          h('span', { style: { flex: '1 1 auto' } }),
          ...meta),
        body,
        actions.length === 0
          ? null
          : h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '2px' } }, ...actions),
        rawOpen
          ? h('pre', {
              style: {
                margin: 0, padding: '6px 8px', borderRadius: C.radiusSm, background: C.chipBg,
                color: C.dim, fontFamily: C.mono, fontSize: C.xs, lineHeight: '18px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '240px', overflow: 'auto',
              },
            }, raw)
          : null,
      )
    }

    /* ================================================================== *
     * 六、注册
     * ================================================================== */

    /** 本插件接管的 wire 工具名（keyed slot 的 key）。 */
    const CLAIMED = ['mcp__junimo__get_state']

    /** 季历页的实现 id：既是标签类型的身份，也是两个 slot 的 key。 */
    const PANEL_ID = 'dsh-junimo-calendar'
    /** 标签类型 kind：`openTab('junimo-calendar')` 用它。 */
    const PANEL_KIND = 'junimo-calendar'

    /** 由 apply 填上：对话里的卡片靠它一键打开右栏。 */
    let openPanelFn = null

    function apply(ctx) {
      for (const name of CLAIMED) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
          { name: 'tool.call.toolview', key: name },
          JunimoStateCard,
        ))
      }

      // 右栏两个服务按需注入：没有它（例如只装了 dsh-base 的 profile）时，
      // 工具行卡片照旧工作，只是少了「看季历」。
      ctx.inject(['sidebarRightTabs', 'sidebarRight'], scoped => {
        scoped.effect(() => scoped.sidebarRightTabs.register({
          id: PANEL_ID,
          kind: PANEL_KIND,
          title: () => '季历',
          // 引导页的入口胶囊：用户不用知道 kind 名也能找到这页。
          guide: [{
            id: 'calendar',
            order: 100,
            title: () => '星露谷季历',
            description: () => '季节 / 节日 / 当前状态',
            icon: () => h(Pixel, { name: 'cal', scale: 1.2 }),
          }],
        }), 'junimo: calendar tab type')

        scoped.slots.inject('sidebar.right.pane.tab', () => scoped.slots.register(
          { name: 'sidebar.right.pane.tab', key: PANEL_ID },
          JunimoPanel,
        ))
        scoped.slots.inject('sidebar.right.pane.tab.title', () => scoped.slots.register(
          { name: 'sidebar.right.pane.tab.title', key: PANEL_ID },
          JunimoTabTitle,
        ))

        openPanelFn = () => {
          try {
            scoped.sidebarRight.openTab(PANEL_KIND)
          } catch (error) {
            console.error('[junimo] open calendar failed:', error)
          }
        }
      })
    }

    exports.apply = apply
    exports.inject = inject
    exports.JunimoStateCard = JunimoStateCard
    exports.PanelView = PanelView
    exports.parseState = parseState
    exports.ART = ART
    exports.sceneGrid = sceneGrid
    return module.exports
  },
})
