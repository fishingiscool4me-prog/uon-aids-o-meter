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

// Ensure we always have the shape we want
function normalizeDoc(doc) {
  // { sum, count, votes: { voterKey: score }, last: { voterKey: ts }, updatedAt, migrated?: true }
  if (doc && typeof doc === 'object') {
    const votes = (doc.votes && typeof doc.votes === 'object') ? doc.votes : {}
    const last  = (doc.last  && typeof doc.last  === 'object') ? doc.last  : {}
    const sum   = Number(doc.sum) || 0
    const count = Number(doc.count) || 0
    return {
      sum, count, votes, last,
      migrated: !!doc.migrated,
      updatedAt: doc.updatedAt || Date.now()
    }
  }
  return { sum: 0, count: 0, votes: {}, last: {}, migrated: false, updatedAt: Date.now() }
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

  if (event.queryStringParameters?.diag === '1') {
    return ok({
      node: process.version,
      have_site_id: !!siteID,
      have_api_token: !!token,
      method: event.httpMethod
    })
  }

  let store
  try { store = tryGetStoreAllWays() }
  catch (e) { return err(500, 'Netlify Blobs unavailable', { reason: String(e) }) }

  // ---- GET: read (with auto-initialize) ----
  if (event.httpMethod === 'GET') {
    const code = event.queryStringParameters?.code
    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const k = codeKey(code)
    try {
      let doc = await store.get(k, { type: 'json' })
      if (!doc) {
        doc = normalizeDoc(null)
        await store.setJSON(k, doc) // auto-initialize
      } else {
        doc = normalizeDoc(doc)
      }
      const avg = doc.count ? Math.round((doc.sum / doc.count) * 10) / 10 : null
      return ok({ avg, count: doc.count })
    } catch (e) {
      return err(500, 'Read failed', { reason: String(e) })
    }
  }

  // ---- POST: read or write ----
  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}
    const degree = body?.degree || null
    const code   = body?.code
    const raw    = body?.score ?? body?.vote
    const hasScore = raw !== undefined && raw !== null
    const score  = hasScore ? Number(raw) : undefined
    if (!code) return err(400, 'Missing params', { need: ['code'] })

    const k = codeKey(code)

    try {
      let doc = await store.get(k, { type: 'json' })
      if (!doc) {
        doc = normalizeDoc(null)
        await store.setJSON(k, doc) // auto-initialize
      } else {
        doc = normalizeDoc(doc)
      }

      // legacy merge only once
      if (degree && !doc.migrated) {
        const legacy = await store.get(legacyKey(degree, code), { type: 'json' })
        if (legacy && typeof legacy === 'object') {
          const l = normalizeDoc(legacy)
          doc.sum   += l.sum
          doc.count += l.count
        }
        doc.migrated = true
        await store.setJSON(k, doc)
      }

      if (!hasScore) {
        const avg = doc.count ? Math.round((doc.sum / doc.count) * 10) / 10 : null
        return ok({ avg, count: doc.count })
      }

      if (Number.isNaN(score)) return err(400, 'Invalid score')
      const newScore = Math.max(0, Math.min(100, score))
      const voterKey = voterKeyFrom(event, body)

      const prev = doc.votes[voterKey]
      if (typeof prev === 'number') {
        const delta = newScore - prev
        doc.sum += delta
        doc.votes[voterKey] = newScore
      } else {
        doc.sum += newScore
        doc.count += 1
        doc.votes[voterKey] = newScore
      }

      doc.updatedAt = Date.now()
      await store.setJSON(k, doc)

      const avg = Math.round((doc.sum / doc.count) * 10) / 10
      return ok({ ok: true, avg, count: doc.count })
    } catch (e) {
      return err(500, 'Write failed', { reason: String(e) })
    }
  }

  return err(405, 'Method not allowed')
}
