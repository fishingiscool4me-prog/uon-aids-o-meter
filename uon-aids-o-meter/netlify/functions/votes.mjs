import { getStore } from '@netlify/blobs'
import crypto from 'node:crypto'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'content-type': 'application/json'
}
const ok  = (data) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(data) })
const err = (code, msg, extra = {}) =>
  ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg, ...extra }) })

const siteID = (process.env.NETLIFY_SITE_ID || '').trim()
const token  = (process.env.NETLIFY_API_TOKEN || '').trim()

function tryGetStoreAllWays() {
  if (!siteID || !token) throw new Error('Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN')
  const attempts = [
    { label: "name+{siteID,token}", fn: () => getStore('votes', { siteID, token }) },
    { label: "name+{siteId,token}", fn: () => getStore('votes', { siteId: siteID, token }) },
    { label: "{name,siteID,token}", fn: () => getStore({ name: 'votes', siteID, token }) },
    { label: "{name,siteId,token}", fn: () => getStore({ name: 'votes', siteId: siteID, token }) },
  ]
  const errors = []
  for (const a of attempts) {
    try { return { store: a.fn(), variant: a.label } }
    catch (e) { errors.push(`${a.label}: ${String(e)}`) }
  }
  throw new Error(`Blobs init failed → ${errors.join(' | ')}`)
}

const getHeader = (headers, name) => headers?.[name] || headers?.[name.toLowerCase()] || null
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32)

/** derive a stable voter key: prefer clientId from body, else IP+UA fingerprint */
function voterKeyFrom(event, body) {
  const cid = body?.clientId
  if (cid) return sha(cid)
  const ip = (getHeader(event.headers, 'x-nf-client-connection-ip')
           || (getHeader(event.headers, 'x-forwarded-for') || '').split(',')[0].trim()
           || getHeader(event.headers, 'client-ip')
           || '0.0.0.0')
  const ua = getHeader(event.headers, 'user-agent') || ''
  return sha(`${ip}|${ua}`)
}

// unified keys (by course code only)
const keyByCode   = (code) => `codes/${code}.json`
const voterDocKey = (code, voterKey) => `codes/${code}/voters/${voterKey}.json`

// legacy (for migration from old degree-based storage)
const legacyKey   = (degree, code) => `courses/${degree}/${code}.json`
const mergeStats  = (a = { sum:0, count:0 }, b = { sum:0, count:0 }) =>
  ({ sum: (a.sum||0) + (b.sum||0), count: (a.count||0) + (b.count||0) })

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return ok({})

  if (event.queryStringParameters?.diag === '1') {
    return ok({
      node: process.version, mode: 'manual',
      have_site_id: !!siteID, have_api_token: !!token,
      method: event.httpMethod, qp: event.queryStringParameters || null
    })
  }

  let store, variant
  try { ({ store, variant } = tryGetStoreAllWays()) }
  catch (e) { return err(500, 'Netlify Blobs unavailable', { reason: String(e) }) }

  // --- READ via GET (prefer code; degree only used for legacy merge) ---
  if (event.httpMethod === 'GET') {
    const degree = event.queryStringParameters?.degree || null
    const code   = event.queryStringParameters?.code
    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const kCode = keyByCode(code)
    const kLegacy = degree ? legacyKey(degree, code) : null
    try {
      const main   = (await store.get(kCode,   { type: 'json' })) || { sum:0, count:0 }
      const legacy = kLegacy ? (await store.get(kLegacy, { type: 'json' })) || null : null
      const combined = legacy ? mergeStats(main, legacy) : main
      if (legacy) await store.setJSON(kCode, combined) // migrate once
      const avg = combined.count ? Math.round((combined.sum / combined.count) * 10) / 10 : null
      return ok({ avg, count: combined.count, variant })
    } catch (e) {
      return err(500, 'Read failed', { reason: String(e) })
    }
  }

  // --- POST: read (no score) or write/update (with score) by code+voterKey ---
  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}

    const degree = body?.degree || null // ignored for storage, used only for legacy merge
    const code   = body?.code
    const raw    = body?.score ?? body?.vote
    const hasScore = raw !== undefined && raw !== null
    const score  = hasScore ? Number(raw) : undefined

    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const kCode  = keyByCode(code)
    const kLegacy = degree ? legacyKey(degree, code) : null

    // POST read: return current aggregate
    if (!hasScore) {
      try {
        const main   = (await store.get(kCode,   { type: 'json' })) || { sum:0, count:0 }
        const legacy = kLegacy ? (await store.get(kLegacy, { type: 'json' })) || null : null
        const combined = legacy ? mergeStats(main, legacy) : main
        if (legacy) await store.setJSON(kCode, combined) // migrate once
        const avg = combined.count ? Math.round((combined.sum / combined.count) * 10) / 10 : null
        return ok({ avg, count: combined.count, variant })
      } catch (e) {
        return err(500, 'Read failed', { reason: String(e) })
      }
    }

    // POST write/update: single vote per voter; update doesn't change count
    if (Number.isNaN(score)) return err(400, 'Invalid score')
    const clamped = Math.max(0, Math.min(100, score))
    const vKey    = voterKeyFrom(event, body)
    const kVoter  = voterDocKey(code, vKey)

    try {
      // merge any legacy into main before updating
      const main   = (await store.get(kCode,   { type: 'json' })) || { sum:0, count:0 }
      const legacy = kLegacy ? (await store.get(kLegacy, { type: 'json' })) || null : null
      let base     = legacy ? mergeStats(main, legacy) : main
      if (legacy) await store.setJSON(kCode, base) // migrate

      const prev = (await store.get(kVoter, { type: 'json' })) || null
      let next
      if (prev && typeof prev.score === 'number') {
        const delta = clamped - prev.score
        next = { sum: base.sum + delta, count: base.count, updatedAt: Date.now() }
      } else {
        next = { sum: base.sum + clamped, count: base.count + 1, updatedAt: Date.now() }
      }

      await store.setJSON(kCode, next)
      await store.setJSON(kVoter, { score: clamped, updatedAt: Date.now() })

      const avg = Math.round((next.sum / next.count) * 10) / 10
      return ok({ ok: true, avg, count: next.count, variant })
    } catch (e) {
      return err(500, 'Write failed', { reason: String(e) })
    }
  }

  return err(405, 'Method not allowed')
}
