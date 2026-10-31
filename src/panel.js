/**
 * 季历面板的数据入口：把 NagiBridge 的 `/state` 收成前端直接可用的小 DTO。
 *
 * 存在的理由只有一个——浏览器端**打不通**游戏 API。桌面端的页面跑在
 * `dsh-app://app/`，对 `localhost:7842` 的直连既不跨源也不走那条自定义协议；
 * 而宿主 HTTP 服务会把未命名的路径转发过去，所以只能由这一层代理。
 *
 * 这一层刻意做「翻译」而不是「渲染」：OCaml 那边给 Agent 的是中文长文本，
 * 面板要的是能画成图的结构化数据，两者用途不同，各自保留最合适的形状。
 *
 * @module dsh-junimo/panel
 */

import { apiGet } from './api.js'

/** 每季固定 28 天，1 号固定周一 —— 面板据此直接排 4×7，不做偏移计算。 */
const SEASON_DAYS = 28

/** `/state.time.season` 只认这四个值；其余原样透传，前端会退化成「未知季」。 */
const SEASONS = new Set(['spring', 'summer', 'fall', 'winter'])

/** 数值字段一律兜住类型：mod 在某些阶段会给出 null 或字符串。 */
function num(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function str(value, fallback = '') {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return fallback
}

function obj(value) {
  return value !== null && typeof value === 'object' && Array.isArray(value) === false ? value : undefined
}

/** 背包条目：只留画面需要的四个字段，水壶额外带水量。 */
function mapItem(item) {
  const it = obj(item)
  if (it === undefined) return undefined
  const mapped = {
    name: str(it.name, '?'),
    count: Math.max(1, num(it.stack, 1)),
    category: str(it.category),
  }
  if (it.waterLeft !== undefined) {
    mapped.water = { left: num(it.waterLeft), max: num(it.waterMax) }
  }
  return mapped
}

/** `/state` 的一条响应 → 面板 DTO。任何异常形状都退化成「没连上」，绝不抛。 */
export function panelDto(state) {
  const root = obj(state)
  if (root === undefined) return { ok: true, mod: true, ready: false, error: '/state 返回的不是对象' }

  const stillBooting = root.time === undefined && root.player === undefined
  if (stillBooting && root.worldReady === undefined) {
    return { ok: true, mod: true, ready: false, error: 'mod 尚未返回状态字段' }
  }
  if (root.worldReady !== true) {
    return { ok: true, mod: true, ready: false }
  }

  const time = obj(root.time) ?? {}
  const player = obj(root.player) ?? {}
  const location = obj(root.location) ?? {}
  const event = obj(root.activeEvent)
  const menu = obj(root.activeMenu)

  const season = str(time.season)
  const inventory = Array.isArray(root.inventory)
    ? root.inventory.map(mapItem).filter(item => item !== undefined)
    : []

  return {
    ok: true,
    mod: true,
    ready: true,
    time: {
      season: SEASONS.has(season) ? season : season,
      day: Math.min(SEASON_DAYS, Math.max(1, num(time.dayOfMonth, 1))),
      year: Math.max(1, num(time.year, 1)),
      /** 游戏原始值：600 = 06:00，1260 = 12:60 不会出现，取整到 10 分。 */
      timeOfDay: num(time.timeOfDay),
      /** 0 晴 / 1 雨 / 2 雷雨 / 3 大风 / 5 雪 / 7 绿雨；旧 mod 无此字段。 */
      weather: time.weather === undefined ? undefined : num(time.weather, 0),
    },
    player: {
      name: str(player.name, '?'),
      x: num(player.x),
      y: num(player.y),
      facing: num(player.facingDirection, 2),
      health: num(player.health),
      maxHealth: num(player.maxHealth),
      stamina: num(player.stamina),
      maxStamina: num(player.maxStamina),
      money: num(player.money),
      tool: str(player.currentTool, '无'),
      moving: player.isMoving === true,
    },
    location: {
      name: str(location.name),
      width: num(location.mapWidth),
      height: num(location.mapHeight),
    },
    inventory,
    /** 菜单类型名；不同 mod 版本可能给字符串或对象。 */
    menu: menu === undefined ? (typeof root.activeMenu === 'string' ? root.activeMenu : null) : str(menu.type, '未知菜单'),
    event:
      event === undefined
        ? null
        : {
            id: str(event.id),
            skippable: event.skippable === true,
            message: str(event.message),
          },
  }
}

/**
 * 取一次面板数据。mod 没起来 / 挂着 / 没进档都在这里降级，永远返回 200 的 DTO。
 * @param {{ apiUrl: string }} paths - 插件解析出的游戏 API 根。
 * @param {number} [timeoutMs] - 单次等待上限；模态界面下 mod 会挂住，必须自己兜住。
 */
export async function readPanelState(paths, timeoutMs = 2500) {
  const res = await apiGet(paths.apiUrl, '/state', timeoutMs)
  if (res.ok !== true) {
    return { ok: true, mod: false, ready: false, error: res.error ?? '游戏 API 无响应' }
  }
  if (res.data === undefined) {
    return { ok: true, mod: true, ready: false, error: '/state 返回的不是 JSON' }
  }
  const dto = panelDto(res.data)
  return { ...dto, at: Date.now() }
}
