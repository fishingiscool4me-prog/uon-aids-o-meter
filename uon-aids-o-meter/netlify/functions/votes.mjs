import { getStore } from '@netlify/blobs'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'content-type': 'application/json'
}
const ok  = (data) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(data) })
const err = (code, msg, extra = {}) =>
  ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg, ...extra }) })

// Try auto wiring; if not available, fall back to manual siteID+token
function getVotesStore() {
  try {
    // auto (works when Blobs is enabled for the site)
    return getStore('votes')
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID
    const token  = process.env.NETLIFY_API_TOKEN
    if (!siteID || !token) {
      throw new Error(`Blobs auto-wiring missing and manual env not set (siteID or token not found). Original: ${e}`)
    }
    // manual mode
    return getStore('votes', { siteID, token })
  }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return ok({})

  // quick diagnostics
  if (event.queryStringParameters?.diag === '1') {
    return ok({
      node: process.version,
      auto_ctx: !!process.env.NETLIFY_BLOBS_CONTEXT,
      auto_url: !!process.env.NETLIFY_BLOBS_URL,
      have_site_id: !!process.env.NETLIFY_SITE_ID,
      have_api_token: !!process.env.NETLIFY_API_TOKEN
    })
  }

  let store
  try {
    store = getVotesStore()
  } catch (e) {
    return err(500, 'Blobs unavailable', { reason: String(e) })
  }

  if (event.httpMethod === 'GET') {
    const degree = event.queryStringParameters?.degree
    const code   = event.queryStringParameters?.code
    if (!degree || !code) return err(400, 'Missing degree or code')

    const key = `courses/${degree}/${code}.json`
    try {
      const data = await store.get(key, { type: 'json' }) // null if not found
      if (!data) return ok({ avg: null, count: 0 })
      const avg = Math.round((data.sum / Math.max(1, data.count)) * 10) / 10
      return ok({ avg, count: data.count })
    } catch (e) {
      return err(500, 'Read failed', { reason: String(e) })
    }
  }

  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}
    const degree = body?.degree
    const code   = body?.code
    const raw    = body?.score ?? body?.vote
    const score  = Number(raw)

    if (!degree || !code || Number.isNaN(score)) return err(400, 'Invalid payload')
    if (score < 0 || score > 100)               return err(400, 'Score must be 0–100')

    const key = `courses/${degree}/${code}.json`
    try {
      const current = (await store.get(key, { type: 'json' })) || { sum: 0, count: 0 }
      const next = { sum: current.sum + score, count: current.count + 1, updatedAt: Date.now() }
      await store.setJSON(key, next)

      const avg = Math.round((next.sum / next.count) * 10) / 10
      return ok({ ok: true, avg, count: next.count })
    } catch (e) {
      return err(500, 'Write failed', { reason: String(e) })
    }
  }

  return err(405, 'Method not allowed')
}
