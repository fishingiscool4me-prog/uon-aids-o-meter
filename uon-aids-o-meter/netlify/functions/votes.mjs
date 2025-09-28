import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore("votes", {
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN,
    });

    if (req.method === "POST") {
      const { course, vote } = await req.json();

      // fetch current data
      const current = (await store.getJSON(course)) || { sum: 0, count: 0 };

      // update
      const updated = {
        sum: current.sum + vote,
        count: current.count + 1,
      };

      await store.setJSON(course, updated);

      return new Response(
        JSON.stringify({ success: true, data: updated }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid method" }), {
      status: 405,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Netlify Blobs unavailable", reason: err.message }),
      { status: 500 }
    );
  }
};
