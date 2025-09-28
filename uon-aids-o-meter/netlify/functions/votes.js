import { getStore } from '@netlify/blobs'

// Helper to create store with fallback for manual config
function getBlobsStore(name) {
  try {
    return getStore(name)
  } catch (err) {
    const siteID = process.env.NETLIFY_SITE_ID
    const token = process.env.NETLIFY_API_TOKEN
    if (!siteID || !token) {
      throw new Error("Missing Netlify Blobs configuration: add NETLIFY_SITE_ID and NETLIFY_API_TOKEN to environment variables")
    }
    return getStore(name, { siteID, token })
  }
}

const votesStore = getBlobsStore('votes')
const guardStore = getBlobsStore('vote-guards')

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }
  }

  if (event.httpMethod === "GET") {
    const { degree, code } = event.queryStringParameters
    const key = `${degree}-${code}`
    const record = await votesStore.get(key, { type: "json" }) || { sum: 0, count: 0 }
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(record),
    }
  }

  if (event.httpMethod === "POST") {
    const { degree, code, vote } = JSON.parse(event.body)
    const key = `${degree}-${code}`

    // basic anti-spam guard
    const guardKey = `${key}-${event.headers["client-ip"] || "anon"}`
    const lastVote = await guardStore.get(guardKey, { type: "json" })
    if (lastVote) {
      return {
        statusCode: 429,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Already voted recently" }),
      }
    }

    // store vote
    const record = await votesStore.get(key, { type: "json" }) || { sum: 0, count: 0 }
    record.sum += vote
    record.count += 1
    await votesStore.set(key, JSON.stringify(record))

    // update guard with 1-hour expiry
    await guardStore.set(guardKey, JSON.stringify({ voted: true }), { ttl: 60 * 60 })

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(record),
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" }
}
