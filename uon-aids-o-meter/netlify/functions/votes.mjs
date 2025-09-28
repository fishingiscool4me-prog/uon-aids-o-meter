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

function keyByCode(code) {
  return `codes/${code}.json`   // ← single source of truth for a course, regardless of degree
}
function legacyKey(degree, code) {
  return `courses/${degree}/${code}.json`  // ← old format we used before
}

// merge two {sum,count} objects
function mergeStats(a = { sum:0, count:0 }, b = { sum:0, count:0 }) {
  return { sum: (a.sum||0) + (b.sum||0), count: (a.count||0) + (b.count||0) }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return ok({})

  // diag
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

  // ---- READ via GET (degree/code in query) ----
  if (event.httpMethod === 'GET') {
    const degree = event.queryStringParameters?.degree || null
    const code   = event.queryStringParameters?.code
    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const kCode = keyByCode(code)
    const kLegacy = degree ? legacyKey(degree, code) : null

    try {
      const main   = (await store.get(kCode,   { type:'json' })) || { sum:0, count:0 }
      const legacy = kLegacy ? (await store.get(kLegacy, { type:'json' })) || null : null

      // migrate/merge if legacy exists
      let combined = main
      if (legacy) {
        combined = mergeStats(main, legacy)
        // write back combined to new key so future reads are unified
        await store.setJSON(kCode, combined)
      }

      const avg = combined.count ? Math.round((combined.sum / combined.count) * 10) / 10 : null
      return ok({ avg, count: combined.count, variant })
    } catch (e) {
      return err(500, 'Read failed', { reason: String(e) })
    }
  }

  // ---- POST: read (no score) or write (with score) keyed by code only ----
  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}
    const degree = body?.degree || null
    const code   = body?.code
    const raw    = body?.score ?? body?.vote
    const hasScore = raw !== undefined && raw !== null
    const score  = hasScore ? Number(raw) : undefined

    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const kCode = keyByCode(code)
    const kLegacy = degree ? legacyKey(degree, code) : null

    // POST read (no score) — same as GET but via body
    if (!hasScore) {
      try {
        const main   = (await store.get(kCode,   { type:'json' })) || { sum:0, count:0 }
        const legacy = kLegacy ? (await store.get(kLegacy, { type:'json' })) || null : null
        let combined = main
        if (legacy) {
          combined = mergeStats(main, legacy)
          await store.setJSON(kCode, combined) // migrate
        }
        const avg = combined.count ? Math.round((combined.sum / combined.count) * 10) / 10 : null
        return ok({ avg, count: combined.count, variant })
      } catch (e) {
        return err(500, 'Read failed', { reason: String(e) })
      }
    }

    // POST write — write ONLY to code key (unified)
    if (Number.isNaN(score)) return err(400, 'Invalid score')
    const clamped = Math.max(0, Math.min(100, score))

    try {
      // merge any legacy into main before incrementing so we don't lose prior votes
      const main   = (await store.get(kCode,   { type:'json' })) || { sum:0, count:0 }
      const legacy = kLegacy ? (await store.get(kLegacy, { type:'json' })) || null : null
      const base   = legacy ? mergeStats(main, legacy) : main

      const next = { sum: base.sum + clamped, count: base.count + 1, updatedAt: Date.now() }
      await store.setJSON(kCode, next)

      const avg = Math.round((next.sum / next.count) * 10) / 10
      return ok({ ok: true, avg, count: next.count, variant })
    } catch (e) {
      return err(500, 'Write failed', { reason: String(e) })
    }
  }

  return err(405, 'Method not allowed')
}
