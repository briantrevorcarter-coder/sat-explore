# Deploying SAT Explore to Railway

`server.js` serves **both** the game files and the multiplayer server, so you
deploy ONE app to Railway and get ONE URL where everything — including
multiplayer — works. No separate frontend host needed.

---

## 1. Create a Railway account

1. Go to **https://railway.app** and click **Login**.
2. Sign up with **GitHub** (recommended — it makes deploying from a repo one click).
3. Railway's Hobby plan is ~$5/month and includes ~$5 of usage, which easily
   covers an app this size. You'll add a payment method when prompted.

---

## 2. Put this project on GitHub

Railway deploys from a GitHub repo. From the `sat-explore` folder:

```bash
cd "C:/Users/Brian Carter/.claude/code/sat-explore"
git init
git add .
git commit -m "SAT Explore — Axiom-7"
```

Then create an empty repo on GitHub (github.com → New repository, name it
`sat-explore`, don't add a README), and push:

```bash
git remote add origin https://github.com/<your-username>/sat-explore.git
git branch -M main
git push -u origin main
```

`node_modules` is ignored via `.gitignore` — Railway installs dependencies itself.

---

## 3. Deploy on Railway

1. In Railway, click **New Project → Deploy from GitHub repo**.
2. Authorize Railway to see your repos, then pick **sat-explore**.
3. Railway auto-detects Node (via `package.json`) and builds using the settings
   in `railway.json` — no config needed. Wait for the build to finish (~1–2 min).

---

## 4. Turn on a public URL

1. Open your service → **Settings → Networking**.
2. Click **Generate Domain**.
3. You'll get a URL like `https://sat-explore-production.up.railway.app`.

That URL is the whole game. Open it, click **Multiplayer**, and it works — the
WebSocket server is on the same host, so no extra setup is required.

---

## Notes

- **PORT**: Railway sets the `PORT` environment variable automatically, and
  `server.js` already reads it (`process.env.PORT`). Nothing to configure.
- **Updating the game**: push new commits to GitHub and Railway redeploys
  automatically.
- **Optional — keep your Netlify frontend**: If you'd rather serve the game from
  Netlify and use Railway only for multiplayer, open the Netlify site with the
  backend address appended once:
  `https://satexplore.netlify.app/?server=wss://sat-explore-production.up.railway.app`
  (note `wss://`). The browser remembers it. But the single-host approach above
  is simpler — you can retire the Netlify site entirely.
