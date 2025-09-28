// netlify/functions/votes.mjs
import { getStore } from '@netlify/blobs'
import crypto from 'node:crypto'

/* ---------- helpers ---------- */
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

// configurable cooldown (seconds) for updates; default 60s
const COOLDOWN_S  = Math.max(0, Number(process.env.VOTE_COOLDOWN_S ?? '60') || 60)
const COOLDOWN_MS = COOLDOWN_S * 1000

function tryGetStoreAllWays () {
  if (!siteID || !token) throw new Error('Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN')
  const attempts = [
    () => getStore('votes', { siteID, token }),
    () => getStore('votes', { siteId: siteID, token }),
    () => getStore({ name: 'votes', siteID, token }),
    () => getStore({ name: 'votes', siteId: siteID, token })
  ]
  const errs = []
  for (const fn of attempts) {
    try { return fn() } catch (e) { errs.push(String(e)) }
  }
  throw new Error(`Blobs init failed → ${errs.join(' | ')}`)
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32)
const getHeader = (headers, name) => headers?.[name] || headers?.[name.toLowerCase()] || null

// Unified keys (by course code only)
const codeKey   = (code) => `codes/${code}.json`
const legacyKey = (degree, code) => `courses/${degree}/${code}.json`

// Ensure we always have the shape we want (BACKWARD-COMPATIBLE)
function normalizeDoc(doc) {
  // new format: { sum, count, votes: { voterKey: score }, stamps: { voterKey: ts }, updatedAt }
  if (doc && typeof doc === 'object') {
    const hasVotes = doc.votes && typeof doc.votes === 'object'
    const sum = Number(doc.sum) || 0
    const count = Number(doc.count) || 0
    const stamps = (doc.stamps && typeof doc.stamps === 'object') ? doc.stamps : {}
    return hasVotes
      ? { sum, count, votes: doc.votes, stamps, updatedAt: doc.updatedAt || Date.now() }
      : { sum, count, votes: {}, stamps, updatedAt: Date.now() } // migrate aggregate-only
  }
  return { sum: 0, count: 0, votes: {}, stamps: {}, updatedAt: Date.now() }
}

// build a stable voter key (prefer clientId from body; else IP+UA)
function voterKeyFrom(event, body) {
  if (body?.clientId) return sha(body.clientId)
  const ip = (getHeader(event.headers, 'x-nf-client-connection-ip')
           || (getHeader(event.headers, 'x-forwarded-for') || '').split(',')[0].trim()
           || getHeader(event.headers, 'client-ip')
           || '0.0.0.0')
  const ua = getHeader(event.headers, 'user-agent') || ''
  return sha(`${ip}|${ua}`)
}

/* ---------- handler ---------- */
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return ok({})

  // quick diag
  if (event.queryStringParameters?.diag === '1') {
    return ok({
      node: process.version,
      have_site_id: !!siteID,
      have_api_token: !!token,
      method: event.httpMethod,
      cooldown_s: COOLDOWN_S
    })
  }

  let store
  try { store = tryGetStoreAllWays() }
  catch (e) { return err(500, 'Netlify Blobs unavailable', { reason: String(e) }) }

  // ---- GET: read by code (degree only used to migrate) ----
  if (event.httpMethod === 'GET') {
    const degree = event.queryStringParameters?.degree || null
    const code   = event.queryStringParameters?.code
    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const k = codeKey(code)
    try {
      let doc = normalizeDoc(await store.get(k, { type: 'json' }))
      // opportunistic migrate from legacy degree key if provided
      if (degree) {
        const legacy = await store.get(legacyKey(degree, code), { type: 'json' })
        if (legacy && typeof legacy === 'object') {
          const l = normalizeDoc(legacy)
          // merge sum/count only; we have no per-voter detail in legacy
          doc = { ...doc, sum: doc.sum + l.sum, count: doc.count + l.count }
          await store.setJSON(k, doc)
        }
      }
      const avg = doc.count ? Math.round((doc.sum / doc.count) * 10) / 10 : null
      return ok({ avg, count: doc.count })
    } catch (e) {
      return err(500, 'Read failed', { reason: String(e) })
    }
  }

  // ---- POST: read (no score) or write/update (score) ----
  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}
    const degree = body?.degree || null // legacy merge only
    const code   = body?.code
    const raw    = body?.score ?? body?.vote
    const hasScore = raw !== undefined && raw !== null
    const score  = hasScore ? Number(raw) : undefined
    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const k = codeKey(code)

    try {
      // read the unified doc
      let doc = normalizeDoc(await store.get(k, { type: 'json' }))

      // one-time merge from legacy aggregate if degree provided
      if (degree) {
        const legacy = await store.get(legacyKey(degree, code), { type: 'json' })
        if (legacy && typeof legacy === 'object') {
          const l = normalizeDoc(legacy)
          doc.sum += l.sum
          doc.count += l.count
          await store.setJSON(k, doc)
        }
      }

      // POST read
      if (!hasScore) {
        const avg = doc.count ? Math.round((doc.sum / doc.count) * 10) / 10 : null
        return ok({ avg, count: doc.count })
      }

      // POST write/update
      if (Number.isNaN(score)) return err(400, 'Invalid score')
      const newScore = Math.max(0, Math.min(100, score))
      const voterKey = voterKeyFrom(event, body)

      // enforce cooldown
      const now   = Date.now()
      const last  = Number(doc.stamps[voterKey] || 0)
      if (last && (now - last) < COOLDOWN_MS) {
        const retry = Math.ceil((COOLDOWN_MS - (now - last)) / 1000)
        const safeAvg = doc.count ? Math.round((doc.sum / doc.count) * 10) / 10 : null
        return err(429, 'Please wait before updating your vote', {
          retry_after_s: retry,
          avg: safeAvg,
          count: doc.count
        })
      }

      const prev = doc.votes[voterKey]
      if (typeof prev === 'number') {
        if (prev === newScore) {
          // no-op — don't burn cooldown for identical score
          const avg = doc.count ? Math.round((doc.sum / doc.count) * 10) / 10 : null
          return ok({ ok: true, avg, count: doc.count })
        }
        // update existing: adjust sum by delta, count unchanged
        const delta = newScore - prev
        doc.sum += delta
        doc.votes[voterKey] = newScore
      } else {
        // new voter: add to sum, increment count
        doc.sum += newScore
        doc.count += 1
        doc.votes[voterKey] = newScore
      }

      // record/update the voter cooldown stamp
      doc.stamps[voterKey] = now

      doc.updatedAt = Date.now()
      await store.setJSON(k, doc)

      const avg = Math.round((doc.sum / doc.count) * 10) / 10
      return ok({ ok: true, avg, count: doc.count, cooldown_s: COOLDOWN_S })
    } catch (e) {
      return err(500, 'Write failed', { reason: String(e) })
    }
  }

  return err(405, 'Method not allowed')
}
