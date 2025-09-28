import { getStore } from '@netlify/blobs'
import crypto from 'node:crypto'

const votesStore = getStore('votes')
const guardStore = getStore('vote-guards')

function corsHeaders () {
  return {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  }
}
function res (data, statusCode = 200) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(data)
  }
}
function clientIpFromHeaders (headers) {
  // Netlify provides x-nf-client-connection-ip; also fall back gracefully
  const h = {}
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = v
  let ip = h['x-nf-client-connection-ip'] || h['client-ip'] || h['x-forwarded-for'] || ''
  if (ip.includes(',')) ip = ip.split(',')[0].trim()
  return ip
}

export async function handler (event, context) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return res({ ok: true })
  }

  if (event.httpMethod === 'GET') {
    const degree = event.queryStringParameters?.degree
    const code = event.queryStringParameters?.code
    if (!degree || !code) return res({ error: 'Missing degree or code' }, 400)

    const key = `courses/${degree}/${code}.json`
    const data = await votesStore.get(key, { type: 'json' })
    if (!data) return res({ avg: null, count: 0 })
    const avg = Math.round((data.sum / Math.max(1, data.count)) * 10) / 10
    return res({ avg, count: data.count })
  }

  if (event.httpMethod === 'POST') {
    let body
    try { body = JSON.parse(event.body || '{}') } catch { body = {} }
    const degree = body?.degree
    const code = body?.code
    const score = Number(body?.score)
    if (!degree || !code || Number.isNaN(score)) return res({ error: 'Invalid payload' }, 400)
    if (score < 0 || score > 100) return res({ error: 'Score out of range' }, 400)

    // Soft anti-spam: hashed IP + 30-day window per course
    const ip = clientIpFromHeaders(event.headers || {})
    const salt = process.env.VOTE_SALT || 'dev-salt'
    if (ip) {
      const hash = crypto.createHash('sha256').update(`${ip}|${degree}|${code}|${salt}`).digest('hex')
      const gkey = `guards/${degree}/${code}/${hash}.json`
      const now = Date.now()
      const windowMs = 30 * 24 * 3600 * 1000

      const existing = await guardStore.getWithMetadata(gkey, { type: 'json' })
      if (!existing?.value) {
        try {
          await guardStore.setJSON(gkey, { t: now }, { onlyIfNew: true, metadata: { t: now } })
        } catch {}
      } else {
        const last = existing.value?.t || 0
        if (now - last < windowMs) {
          return res({ error: 'Duplicate vote detected. Try again later.' }, 429)
        } else {
          try {
            await guardStore.setJSON(gkey, { t: now }, { onlyIfMatch: existing.etag, metadata: { t: now } })
          } catch {}
        }
      }
    }

    // Update totals with optimistic concurrency
    const key = `courses/${degree}/${code}.json`
    let tries = 0
    while (tries++ < 6) {
      const current = await votesStore.getWithMetadata(key, { type: 'json' })
      let next, opts
      if (!current?.value) {
        next = { sum: score, count: 1, updatedAt: Date.now() }
        opts = { onlyIfNew: true, metadata: { updatedAt: next.updatedAt } }
      } else {
        next = {
          sum: (current.value.sum || 0) + score,
          count: (current.value.count || 0) + 1,
          updatedAt: Date.now()
        }
        opts = { onlyIfMatch: current.etag, metadata: { updatedAt: next.updatedAt } }
      }
      try {
        await votesStore.setJSON(key, next, opts)
        const avg = Math.round((next.sum / next.count) * 10) / 10
        return res({ ok: true, avg, count: next.count })
      } catch (e) {
        if (String(e?.message || '').includes('412')) continue
        return res({ error: 'Failed to save vote.' }, 500)
      }
    }
    return res({ error: 'Busy. Please retry.' }, 503)
  }

  return res({ error: 'Method not allowed' }, 405)
}
