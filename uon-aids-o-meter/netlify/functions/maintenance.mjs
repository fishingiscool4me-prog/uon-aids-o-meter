// netlify/functions/maintenance.mjs
import { getStore } from "@netlify/blobs";

const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
const token  = (process.env.NETLIFY_API_TOKEN || "").trim();
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-admin-key",
  "content-type": "application/json"
};
const res = (status, body) => ({ statusCode: status, headers: CORS, body: JSON.stringify(body) });

/* ---------- store helper ---------- */
function tryGetStoreAllWays () {
  if (!siteID || !token) throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN");
  const attempts = [
    () => getStore("votes", { siteID, token }),
    () => getStore("votes", { siteId: siteID, token }),
    () => getStore({ name: "votes", siteID, token }),
    () => getStore({ name: "votes", siteId: siteID, token })
  ];
  const errs = [];
  for (const fn of attempts) {
    try { return fn() } catch (e) { errs.push(String(e)) }
  }
  throw new Error(`Blobs init failed → ${errs.join(" | ")}`);
}

/* ---------- doc helpers ---------- */
function emptyDoc() {
  return {
    sum: 0,
    count: 0,
    votes: {},
    last: {},
    migrated: true,
    updatedAt: Date.now()
  };
}

function normalizeDocKeepAggregate(doc) {
  const out = (doc && typeof doc === "object") ? { ...doc } : {};
  out.sum   = Number(out.sum)   || 0;
  out.count = Number(out.count) || 0;
  out.votes = (out.votes && typeof out.votes === "object") ? out.votes : {};
  out.last  = (out.last  && typeof out.last  === "object") ? out.last  : {};
  out.migrated  = out.migrated === true ? true : false;
  out.updatedAt = out.updatedAt || Date.now();
  return out;
}

/* ---------- handler ---------- */
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return res(200, { ok: true });

  // admin key check
  const provided = event.headers["x-admin-key"] || event.queryStringParameters?.adminKey || "";
  if (!ADMIN_KEY || provided !== ADMIN_KEY) return res(401, { error: "Unauthorized" });

  const s = tryGetStoreAllWays();

  // ---- GET: show course ----
  if (event.httpMethod === "GET") {
    const op = event.queryStringParameters?.op;
    if (op === "show") {
      const code = event.queryStringParameters?.code;
      if (!code) return res(400, { error: "Missing ?code=" });
      const unifiedKey = `codes/${code}.json`;
      const data = await s.get(unifiedKey, { type: "json" });
      return res(200, { key: unifiedKey, data: data || null });
    }
    return res(400, { error: "Unknown op" });
  }

  // ---- POST: reset or edit ----
  if (event.httpMethod === "POST") {
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}
    const op = body.op;

    if (op === "reset-course") {
      const code = body.code;
      if (!code) return res(400, { error: "Missing code" });
      const unifiedKey = `codes/${code}.json`;
      await s.setJSON(unifiedKey, emptyDoc());
      return res(200, { ok: true, action: "reset-course", code });
    }

    if (op === "edit-course") {
      const code = body.code;
      const changes = body.changes;
      if (!code) return res(400, { error: "Missing code" });
      if (!changes || typeof changes !== "object") return res(400, { error: "Missing changes" });

      const unifiedKey = `codes/${code}.json`;
      const current = (await s.get(unifiedKey, { type: "json" })) || emptyDoc();
      const updated = { ...normalizeDocKeepAggregate(current), ...changes, updatedAt: Date.now() };
      await s.setJSON(unifiedKey, updated);
      return res(200, { ok: true, action: "edit-course", code, changes });
    }

    return res(400, { error: "Unknown op" });
  }

  return res(405, { error: "Method not allowed" });
}
