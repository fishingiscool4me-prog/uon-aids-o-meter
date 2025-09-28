// netlify/functions/votes.mjs
import { getStore } from '@netlify/blobs'

// --- CORS helpers ---
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'content-type': 'application/json'
}
const ok  = (data) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(data) })
const err = (code, msg, extra = {}) =>
  ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg, ...extra }) })

// Always use manual mode (auto-wiring is off on your site)
const siteID = process.env.NETLIFY_SITE_ID
const token  = process.env.NETLIFY_API_TOKEN

function getVotesStore() {
  if (!siteID || !token) {
    throw new Error('Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN')
  }
  return getStore('votes', { siteID, token })
}

export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return ok({})

  // Diagnostics (quick sanity check)
  if (event.queryStringParameters?.diag === '1') {
    return ok({
      node: process.version,
      mode: 'manual',
      have_site_id: !!siteID,
      have_api_token: !!token,
      method: event.httpMethod,
      qp: event.queryStringParameters || null
    })
  }

  let store
  try {
    store = getVotesStore()
  } catch (e) {
    return err(500, 'Netlify Blobs unavailable', { reason: String(e) })
  }

  // ---- READ via GET (degree/code in query) ----
  if (event.httpMethod === 'GET') {
    const degree = event.queryStringParameters?.degree
    const code   = event.queryStringParameters?.code
    if (!degree || !code) return err(400, 'Missing params', { need: ['degree', 'code'] })

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

  // ---- WRITE or READ via POST (JSON body) ----
  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}
    const degree = body?.degree
    const code   = body?.code
    const raw    = body?.score ?? body?.vote
    const hasScore = raw !== undefined && raw !== null
    const score  = hasScore ? Number(raw) : undefined

    if (!degree || !code) return err(400, 'Missing params', { need: ['degree', 'code'] })

    const key = `courses/${degree}/${code}.json`

    // If no score provided, treat POST as a read
    if (!hasScore) {
      try {
        const data = await store.get(key, { type: 'json' }) || { sum: 0, count: 0 }
        const avg = data.count ? Math.round((data.sum / data.count) * 10) / 10 : null
        return ok({ avg, count: data.count })
      } catch (e) {
        return err(500, 'Read failed', { reason: String(e) })
      }
    }

    // Otherwise, write a vote
    if (Number.isNaN(score)) return err(400, 'Invalid score')
    const clamped = Math.max(0, Math.min(100, score))

    try {
      const current = (await store.get(key, { type: 'json' })) || { sum: 0, count: 0 }
      const next = { sum: current.sum + clamped, count: current.count + 1, updatedAt: Date.now() }
      await store.setJSON(key, next)

      const avg = Math.round((next.sum / next.count) * 10) / 10
      return ok({ ok: true, avg, count: next.count })
    } catch (e) {
      return err(500, 'Write failed', { reason: String(e) })
    }
  }

  return err(405, 'Method not allowed')
}
