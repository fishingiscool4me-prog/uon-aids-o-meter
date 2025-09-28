# UON Aids‑O‑Meter (React + Netlify)

A cheeky, student‑made site to vote how cooked each course feels (0 = good/easy, 100 = terrible). Not affiliated with UON.

## What you get

- **Vite + React** frontend with a fun **thermometer meter** and clean UI.
- **Netlify Function** `/.netlify/functions/votes` that stores votes using **Netlify Blobs** (no DB to set up).
- **Optimistic concurrency** with ETags so concurrent votes don’t clobber each other.
- **Soft anti‑spam**: one vote per course per device + hashed IP 30‑day window on the backend.
- Add more degrees/courses by editing `src/data/degrees.js`.

## One‑time setup

1) **Create a new GitHub repo** and push these files.

2) **Netlify → New site from Git**  
   - Build command: `npm run build`  
   - Publish directory: `dist`  
   (These are already in `netlify.toml` but the UI will show them.)

3) **Environment variable** (Site settings → Environment variables):  
   - `VOTE_SALT` = any random string (used only to hash IPs for the dupe‑vote window).

That’s it. Netlify will auto‑detect the Functions and Blobs.

> Netlify Functions require Node 18+ and support ESM fetch‑style handlers. See Netlify docs.


## Local dev

```bash
npm i
npm run dev           # just the Vite dev server (functions won’t run)
# or, if you use Netlify CLI:
# npm i -g netlify-cli
# netlify dev         # runs Vite + functions together with proxy
```

Open http://localhost:5173

## How it works

- `src/App.jsx` – degree/prefix/course pickers, voting UI, and meter.
- `src/components/Gauge.jsx` – CSS thermometer meter.
- `netlify/functions/votes.js` – GET returns `{ avg, count }`; POST accepts `{ degree, code, score }` (0–100). Stores an aggregate `{ sum, count }` per course in a Blobs store named `votes` and uses another store `vote-guards` for hashed IP throttling.
- Data lives in Blobs under keys like `courses/Mechanical/MECH2110.json`.

## Optional tweaks

- Change the 30‑day dupe window in `votes.js` (`windowMs`).
- Add a **.uon.edu.au email verification** step: you can later add a function that emails a code via a provider (Resend, Mailgun, etc.). Not required for launch.
- Add more degrees: extend `DEGREES` in `src/data/degrees.js`. Prefix tabs are derived automatically from course codes.
- Add images (backgrounds, logos): drop files into `/public` and reference them in `index.html` or CSS.

## Licence & disclaimers

- For entertainment only. Not affiliated with the University of Newcastle.
- Don’t defame or harass staff or students.
- No personal data is stored by default; a hashed IP is kept for anti‑spam only.
