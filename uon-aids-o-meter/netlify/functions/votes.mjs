import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const store = getStore("votes", {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });

    if (req.method === "POST") {
      const { course, vote } = await req.json();

      const current = (await store.getJSON(course)) || { sum: 0, count: 0 };

      const updated = {
        sum: current.sum + vote,
        count: current.count + 1,
      };

      await store.setJSON(course, updated);

      return new Response(JSON.stringify({ success: true, data: updated }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid method" }), {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Netlify Blobs unavailable",
        reason: err.stack || err.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
