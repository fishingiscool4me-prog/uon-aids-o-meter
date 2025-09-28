import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore("votes", {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Invalid method" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { code, score, clientId } = body;

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // fetch existing
    const current = (await store.getJSON(code)) || { votes: {} };

    // overwrite this client’s vote instead of incrementing blindly
    if (score !== undefined && clientId) {
      current.votes[clientId] = score;
    }

    // compute average + count
    const values = Object.values(current.votes);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;
    const avg = count > 0 ? sum / count : null;

    // save back
    await store.setJSON(code, current);

    return new Response(
      JSON.stringify({ avg, count }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Netlify Blobs unavailable",
        reason: err.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
