import { getStore } from '@netlify/blobs'

const votesStore = getStore('votes')

function corsHeaders () {
  return {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  }
}
const ok = (data) => ({ statusCode: 200, headers: corsHeaders(), body: JSON.stringify(data) })
const err = (statusCode, msg) => ({ statusCode, headers: corsHeaders(), body: JSON.stringify({ error: msg }) })

export async function handler (event) {
  if (event.httpMethod === 'OPTIONS') return ok({})

  if (event.httpMethod === 'GET') {
    const { degree, code } = event.queryStringParameters || {}
    if (!degree || !code) return err(400, 'Missing degree or code')

    const key = `courses/${degree}/${code}.json`
    const data = await votesStore.get(key, { type: 'json' })
    if (!data) return ok({ avg: null, count: 0 })

    const avg = Math.round((data.sum / Math.max(1, data.count)) * 10) / 10
    return ok({ avg, count: data.count })
  }

  if (event.httpMethod === 'POST') {
    let body = {}
    try { body = JSON.parse(event.body || '{}') } catch {}
    const degree = body?.degree
    const code = body?.code
    const score = Number(body?.score)
    if (!degree || !code || Number.isNaN(score)) return err(400, 'Invalid payload')
    if (score < 0 || score > 100) return err(400, 'Score out of range')

    // No anti-spam for now — every POST adds to the tally
    try {
      const key = `courses/${degree}/${code}.json`
      const current = await votesStore.get(key, { type: 'json' }) || { sum: 0, count: 0 }
      const next = { sum: current.sum + score, count: current.count + 1, updatedAt: Date.now() }
      await votesStore.setJSON(key, next)
      const avg = Math.round((next.sum / next.count) * 10) / 10
      return ok({ ok: true, avg, count: next.count })
    } catch (e) {
      return err(500, 'Failed to save vote.')
    }
  }

  return err(405, 'Method not allowed')
}
