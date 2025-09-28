// netlify/functions/votes.js

import { getStore } from '@netlify/blobs'

// ---- helpers ---------------------------------------------------------------
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'content-type': 'application/json'
}
const ok  = (data) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(data) })
const err = (code, msg, extra = {}) =>
  ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg, ...extra }) })

function makeStore(name) {
  // 1) try auto-wired Blobs
  try { return getStore(name) }
  catch {
    // 2) fallback to manual config via env vars
    const siteID = process.env.NETLIFY_SITE_ID
    const token  = process.env.NETLIFY_API_TOKEN
    if (!siteID || !token) {
      throw new Error(
        `Blobs not configured: missing ${!siteID ? 'NETLIFY_SITE_ID ' : ''}${!token ? 'NETLIFY_API_TOKEN' : ''}`
      )
    }
    return getStore(name, { siteID, token })
  }
}

// ---- handler ---------------------------------------------------------------
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return ok({})

  // diagnostics: /.netlify/functions/votes?diag=1
  if (event.queryStringParameters?.diag === '1') {
    return ok({
      has_SITE_ID: !!process.env.NETLIFY_SITE_ID,
      has_API_TOKEN: !!process.env.NETLIFY_API_TOKEN,
      blobs_enabled: process.env.NETLIFY_BLOBS_ENABLED || false
    })
  }

  let votesStore
  try { votesStore = makeStore('votes') }
  catch (e) { return err(500, 'Netlify Blobs unavailable', { reason: String(e) }) }

  if (event.httpMethod === 'GET') {
    const degree = event.queryStringParameters?.degree
    const code   = event.queryStringParameters?.code
    if (!degree || !code) return err(400, 'Missing degree or code')

    const key = `courses/${degree}/${code}.json`
    try {
      const data = await votesStore.get(key, { type: 'json' })
      if (!data) return ok({ avg: null, count: 0 })
      const avg = Math.round((data.sum / Math.max(1, data.count)) * 10) / 10
      return ok({ avg, count: data.count })
    } catch (e) {
      return err(500, 'Failed to read vote data', { reason: String(e) })
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
      const current = (await votesStore.get(key, { type: 'json' })) || { sum: 0, count: 0 }
      const next = { sum: current.sum + score, count: current.count + 1, updatedAt: Date.now() }
      await votesStore.setJSON(key, next)

      const avg = Math.round((next.sum / next.count) * 10) / 10
      return ok({ ok: true, avg, count: next.count })
    } catch (e) {
      return err(500, 'Failed to save vote', { reason: String(e) })
    }
  }

  return err(405, 'Method not allowed')
}
