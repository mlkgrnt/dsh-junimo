/**
 * 宿主侧面板 DTO 的离线校验（`src/panel.js`）。
 *
 * 这一层是浏览器唯一的数据来源，形状错了面板就整块空掉，而它跑在宿主里、没有
 * 类型检查也没有前端报错——所以这里拿 `/state` 的几种真实形态直接喂它。
 * `panelDto` 是纯函数，不需要起服务、不需要开游戏。
 */

import { strict as assert } from 'node:assert'
import { panelDto } from '../src/panel.js'

/* ---------- 1. 正常进档 ---------- */

const full = panelDto({
  ok: true,
  worldReady: true,
  player: {
    name: 'DeepSeek', x: 12, y: 34, facingDirection: 2,
    health: 100, maxHealth: 100, stamina: 140.5, maxStamina: 270,
    money: 500, currentTool: '锄头', isMoving: false,
  },
  location: { name: '农场', mapWidth: 80, mapHeight: 65 },
  time: { timeOfDay: 640, dayOfMonth: 20, season: 'spring', year: 1, weather: 0 },
  activeMenu: null,
  activeEvent: null,
  inventory: [
    { name: '锄头', stack: 1, category: '工具' },
    { name: '浇水壶', stack: 1, category: '工具', waterLeft: 40, waterMax: 40 },
  ],
})

assert.equal(full.ready, true)
assert.equal(full.time.season, 'spring')
assert.equal(full.time.day, 20)
assert.equal(full.time.timeOfDay, 640)
assert.equal(full.time.weather, 0)
assert.equal(full.player.stamina, 140.5, '体力是浮点，不能取整')
assert.equal(full.player.money, 500)
assert.equal(full.location.name, '农场')
assert.equal(full.inventory.length, 2)
assert.deepEqual(full.inventory[1].water, { left: 40, max: 40 }, '水壶要带水量')
assert.equal(full.menu, null)
assert.equal(full.event, null)

/* ---------- 2. 没进档：只有 worldReady ---------- */

const title = panelDto({ ok: true, worldReady: false })
assert.equal(title.ready, false)
assert.equal(title.mod, true, 'mod 是通的，只是没进档')

/* ---------- 3. 旧 mod 没有 weather 字段 ---------- */

const noWeather = panelDto({
  worldReady: true,
  player: { name: 'A' },
  location: { name: '农场' },
  time: { timeOfDay: 600, dayOfMonth: 1, season: 'winter', year: 2 },
  inventory: [],
})
assert.equal(noWeather.ready, true)
assert.equal(noWeather.time.weather, undefined, '缺字段要保留 undefined，面板据此不画天气')

/* ---------- 4. 菜单与剧情 ---------- */

const busy = panelDto({
  worldReady: true,
  player: {},
  location: {},
  time: { timeOfDay: 2140, dayOfMonth: 26, season: 'fall', year: 2, weather: 1 },
  activeMenu: { type: 'Chest' },
  activeEvent: { id: 13, skippable: true, message: '台词' },
  inventory: [],
})
assert.equal(busy.menu, 'Chest')
assert.equal(busy.event.id, '13', 'id 统一转成字符串')
assert.equal(busy.event.skippable, true)
assert.equal(busy.event.message, '台词')

/* ---------- 5. 垃圾输入一律降级，不抛 ---------- */

for (const junk of [null, undefined, {}, 42, 'x', []]) {
  const dto = panelDto(junk)
  assert.equal(dto.ok, true, '永远返回可渲染的 DTO')
  assert.equal(dto.ready, false)
}

/* ---------- 6. 日期越界被夹住 ---------- */

const clamped = panelDto({
  worldReady: true,
  player: {},
  location: {},
  time: { dayOfMonth: 99, season: 'spring', year: 0, timeOfDay: 600 },
  inventory: [],
})
assert.equal(clamped.time.day, 28, '日不能超过 28（每季固定 28 天）')
assert.equal(clamped.time.year, 1)

console.log('panel dto: 全部断言通过')
