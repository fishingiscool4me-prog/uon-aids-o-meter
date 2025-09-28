import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore("votes", {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });

    if (req.method === "GET") {
      const url = new URL(req.url);
      const degree = url.searchParams.get("degree");
      const code = url.searchParams.get("code");
      if (!degree || !code) {
        return new Response(JSON.stringify({ error: "Missing params" }), {
          status: 400,
        });
      }

      const key = `${degree}:${code}`;
      const current = (await store.getJSON(key)) || { sum: 0, count: 0 };
      const avg = current.count > 0 ? current.sum / current.count : null;

      return new Response(
        JSON.stringify({ avg, count: current.count }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const { degree, code, score } = await req.json();
      if (!degree || !code || score === undefined) {
        return new Response(JSON.stringify({ error: "Missing body params" }), {
          status: 400,
        });
      }

      const key = `${degree}:${code}`;
      const current = (await store.getJSON(key)) || { sum: 0, count: 0 };
      const updated = {
        sum: current.sum + score,
        count: current.count + 1,
      };

      await store.setJSON(key, updated);

      const avg = updated.count > 0 ? updated.sum / updated.count : null;
      return new Response(
        JSON.stringify({ avg, count: updated.count }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid method" }), {
      status: 405,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Netlify Blobs unavailable",
        reason: err.message,
      }),
      { status: 500 }
    );
  }
};
