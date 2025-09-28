import { getStore } from "@netlify/blobs";

export default async (req) => {
  try {
    // Init store (manual mode)
    const store = getStore("votes", {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });

    // Parse request
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Invalid method" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }

    const { code, score, clientId } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing course code" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // fetch current votes for this course
    const current = (await store.getJSON(code)) || { votes: {} };

    // update (overwrite existing client vote if present)
    if (score !== undefined && clientId) {
      current.votes[clientId] = score;
      await store.setJSON(code, current);
    }

    // recalc avg + count
    const values = Object.values(current.votes);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = count > 0 ? sum / count : null;

    return new Response(
      JSON.stringify({ avg, count }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Netlify Blobs unavailable", reason: err.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
