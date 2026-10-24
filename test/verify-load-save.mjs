/**
 * 真机验证 junimo_load_save：启动游戏 → 确认停在标题界面 → 进档 → 读 worldReady。
 *
 * 只为验证坐标与时机，不做任何游戏内操作，验证完不落盘（不 sleep）。
 */
import { apiGet } from '../src/api.js'
import { launchGame, loadSave } from '../src/game.js'
import { resolvePaths } from '../src/paths.js'

const paths = resolvePaths()
console.log('exe     :', paths.exe)
console.log('gameDir :', paths.gameDir)

// 传 --existing 时假定游戏已经在跑（例如由外部终端启动），只验进档。
if (!process.argv.includes('--existing')) {
  const launch = await launchGame(paths, 120_000)
  console.log('launch  :', launch.ok ? 'OK' : 'FAIL', '-', launch.detail)
  if (!launch.ok) process.exit(1)
} else {
  console.log('launch  : 跳过（--existing）')
}

const before = await apiGet(paths.apiUrl, '/status')
console.log('before  :', JSON.stringify(before.data))

const load = await loadSave(paths, 0, 60_000)
console.log('loadSave:', load.ok ? 'OK' : 'FAIL', '-', load.detail)

const after = await apiGet(paths.apiUrl, '/status')
console.log('after   :', JSON.stringify(after.data))
process.exit(load.ok ? 0 : 2)
