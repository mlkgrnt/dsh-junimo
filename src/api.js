/**
 * 直连 NagiBridge-Remix 的极薄 HTTP 客户端，只给插件自己的诊断/生命周期工具用。
 *
 * 游戏语义一律不在这里实现——那些在 junimo-mcp.exe 里，本层只做「探活」和
 * 「点两下鼠标」这种 MCP 工具够不到的事。
 *
 * @module dsh-junimo/api
 */

/**
 * 带超时的 fetch：mod 在模态界面下会挂住，必须自己兜住。
 * @param {string} base
 * @param {string} path
 * @param {{ method?: string, body?: string, timeoutMs?: number }} [init]
 */
async function request(base, path, init = {}) {
  const { method = 'GET', body, timeoutMs = 5000 } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(new URL(path, base), {
      method,
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/** GET 一个端点并尽量解析 JSON；解析失败时回退成原始文本。 */
export async function apiGet(base, path, timeoutMs) {
  const res = await request(base, path, { timeoutMs })
  if (!res.ok) return { ok: false, error: res.error ?? `HTTP ${res.status}` }
  const raw = res.text ?? ''
  try {
    return { ok: true, data: JSON.parse(raw), raw }
  } catch {
    return { ok: true, raw }
  }
}

/**
 * POST 一个端点。需要 Content-Length 的端点（`/pause`、`/menu_close`）靠
 * 这里显式给 `{}` 兜住——命令行 curl 当年就是漏了这个才一直失败。
 */
export async function apiPost(base, path, payload = {}, timeoutMs) {
  const body = JSON.stringify(payload ?? {})
  const res = await request(base, path, { method: 'POST', body, timeoutMs })
  if (!res.ok) return { ok: false, error: res.error ?? `HTTP ${res.status}` }
  const raw = res.text ?? ''
  try {
    return { ok: true, data: JSON.parse(raw), raw }
  } catch {
    return { ok: true, raw }
  }
}

/** 裸 TCP 探活：区分「没人监听」和「HTTP 挂住」。 */
export async function probePort(host, port, timeoutMs = 1500) {
  const { connect } = await import('node:net')
  return new Promise(resolve => {
    const socket = connect({ host, port })
    const done = value => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/** 从 `localhost:7842` 里取出 host/port，给 probePort 用。 */
export function splitApiUrl(apiUrl) {
  try {
    const url = new URL(apiUrl)
    return { host: url.hostname, port: url.port ? Number(url.port) : 80 }
  } catch {
    return { host: 'localhost', port: 7842 }
  }
}
