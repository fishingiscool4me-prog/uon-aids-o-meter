// netlify/functions/maintenance.mjs
import { getStore } from "@netlify/blobs";

const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
const token  = (process.env.NETLIFY_API_TOKEN || "").trim();
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim(); // set this in Netlify env vars

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-admin-key",
  "content-type": "application/json"
};
const res = (status, body) => ({ statusCode: status, headers: CORS, body: JSON.stringify(body) });

function store() {
  if (!siteID || !token) throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN");
  return getStore("votes", { siteID, token });
}

// standard normalized doc
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

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return res(200, { ok: true });

  // admin key check
  const provided = event.headers["x-admin-key"] || event.queryStringParameters?.adminKey || "";
  if (!ADMIN_KEY || provided !== ADMIN_KEY) return res(401, { error: "Unauthorized" });

  const s = store();

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
      const updated = { ...current, ...changes, updatedAt: Date.now() };
      await s.setJSON(unifiedKey, updated);
      return res(200, { ok: true, action: "edit-course", code, changes });
    }

    return res(400, { error: "Unknown op" });
  }

  return res(405, { error: "Method not allowed" });
}
