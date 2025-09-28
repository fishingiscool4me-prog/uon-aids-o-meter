import { getStore } from '@netlify/blobs'
import crypto from 'node:crypto'

const votesStore = getStore('votes')
const guardStore = getStore('vote-guards')

function corsHeaders(){
  return {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  }
}
function j(data, status=200){
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() })
}

function clientIp(req){
  const h = Object.fromEntries(req.headers)
  let ip = h['x-nf-client-connection-ip'] || h['client-ip'] || h['x-forwarded-for'] || ''
  if(ip.includes(',')) ip = ip.split(',')[0].trim()
  return ip
}

export default async (req, context) => {
  if(req.method === 'OPTIONS') return j({ ok: true })

  if(req.method === 'GET'){
    const url = new URL(req.url)
    const degree = url.searchParams.get('degree')
    const code = url.searchParams.get('code')
    if(!degree || !code) return j({ error: 'Missing degree or code' }, 400)

    const key = `courses/${degree}/${code}.json`
    const data = await votesStore.get(key, { type: 'json' })
    if(!data) return j({ avg: null, count: 0 })
    const avg = Math.round((data.sum / Math.max(1, data.count)) * 10) / 10
    return j({ avg, count: data.count })
  }

  if(req.method === 'POST'){
    let body = {}
    try{ body = await req.json() }catch{}
    const degree = body?.degree
    const code = body?.code
    const score = Number(body?.score)
    if(!degree || !code || Number.isNaN(score)) return j({ error: 'Invalid payload' }, 400)
    if(score < 0 || score > 100) return j({ error: 'Score out of range' }, 400)

    // Soft anti-spam: hashed IP + 30-day window per course
    const ip = clientIp(req)
    const salt = process.env.VOTE_SALT || 'dev-salt'
    if(ip){
      const hash = crypto.createHash('sha256').update(`${ip}|${degree}|${code}|${salt}`).digest('hex')
      const gkey = `guards/${degree}/${code}/${hash}.json`
      const now = Date.now()
      const windowMs = 30 * 24 * 3600 * 1000

      const existing = await guardStore.getWithMetadata(gkey, { type: 'json' })
      if(!existing?.value){
        try{ await guardStore.setJSON(gkey, { t: now }, { onlyIfNew: true, metadata: { t: now } }) }catch{ /* ignore race */ }
      }else{
        const last = existing.value?.t || 0
        if(now - last < windowMs){
          return j({ error: 'Duplicate vote detected. Try again later.' }, 429)
        }else{
          try{ await guardStore.setJSON(gkey, { t: now }, { onlyIfMatch: existing.etag, metadata: { t: now } }) }catch{ /* ignore */ }
        }
      }
    }

    // Update totals with optimistic concurrency
    const key = `courses/${degree}/${code}.json`
    let tries = 0
    while(tries++ < 6){
      const current = await votesStore.getWithMetadata(key, { type: 'json' })
      let next, opts
      if(!current?.value){
        next = { sum: score, count: 1, updatedAt: Date.now() }
        opts = { onlyIfNew: true, metadata: { updatedAt: next.updatedAt } }
      }else{
        next = { sum: (current.value.sum || 0) + score, count: (current.value.count || 0) + 1, updatedAt: Date.now() }
        opts = { onlyIfMatch: current.etag, metadata: { updatedAt: next.updatedAt } }
      }
      try{
        await votesStore.setJSON(key, next, opts)
        const avg = Math.round((next.sum / next.count) * 10) / 10
        return j({ ok: true, avg, count: next.count })
      }catch(e){
        const msg = String(e?.message || '')
        if(msg.includes('412')) continue // ETag mismatch, retry
        return j({ error: 'Failed to save vote.' }, 500)
      }
    }
    return j({ error: 'Busy. Please retry.' }, 503)
  }

  return j({ error: 'Method not allowed' }, 405)
}
