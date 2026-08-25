# Get Started — start to finish

This walks you from the zip to a working app on your phone. It assumes you can use a terminal and git, but not that you know Vite or PWAs. Budget ~30–40 minutes the first time.

---

## 0. What you're building

Two pieces:

- **`snapshot.mjs`** — a script you run on your computer. It pulls today's ADP, expert tiers, and injuries and writes `src/data/players.json`.
- **The app** — a React site that reads `players.json` and runs your draft. It installs to your phone and works offline.

You run the script whenever you want fresh data (mainly the morning of the draft). The app is what you actually use at the table.

---

## 1. Prerequisites

You need **Node.js 18 or newer**. Check:

```bash
node --version
```

If it's missing or older than 18, install the LTS from <https://nodejs.org>.

---

## 2. Get the files into your repo

Unzip the project and move its contents into your cloned repo folder (so `package.json` sits at the repo root). Then:

```bash
cd your-repo
npm install
```

This downloads the dependencies into `node_modules/` (already git-ignored). Takes a minute.

---

## 3. Get your FantasyPros API key

The key is what turns the board from "crowd ADP" into "expert consensus," which matters most if you're newer to fantasy.

1. Go to <https://www.fantasypros.com/api-data/> and request a free public API key.
2. When it arrives, keep it handy for the next step. **Don't paste it into any file you commit.**

---

## 4. Build today's board

Run the snapshot. Pass the key as an environment variable so it never touches your code:

```bash
# macOS / Linux
FANTASYPROS_API_KEY=your_key_here npm run snapshot

# Windows PowerShell
$env:FANTASYPROS_API_KEY="your_key_here"; npm run snapshot
```

Options (defaults are PPR / 12 teams / 2026):

```bash
FANTASYPROS_API_KEY=xxx npm run snapshot -- --scoring=half-ppr --teams=10
```

`--scoring` accepts `ppr`, `half-ppr`, `standard`, or `2qb`. It prints a summary — player counts, tier source, injuries flagged, and the top 5 — so you can sanity-check it. It writes `src/data/players.json`.

> No key yet? You can still run `npm run snapshot` without it — you'll get real ADP + injuries and tiers computed from ADP gaps. Add the key later and re-run.

---

## 5. Run it locally

```bash
npm run dev
```

Open the URL it prints (usually <http://localhost:5173>). You should see your board with real players. Click **Mine** / **Gone** on a few players and confirm the "on the clock" bar, alerts, and top-values panel react. Set your **team count** and **draft slot** in the header.

Press `Ctrl+C` in the terminal to stop the dev server.

---

## 6. Deploy it free (Vercel)

Vercel gives you a public HTTPS URL and rebuilds automatically whenever you push to GitHub. Netlify and Cloudflare Pages work the same way if you prefer them.

1. Push your repo to GitHub if you haven't:
   ```bash
   git add .
   git commit -m "Draft War Room app"
   git push
   ```
2. Go to <https://vercel.com>, sign in with GitHub, and click **Add New → Project**.
3. Import your repo. Vercel auto-detects Vite — framework preset **Vite**, build command `npm run build`, output dir `dist`. Leave the defaults.
4. Click **Deploy**. After ~1 minute you get a URL like `https://draft-war-room-yourname.vercel.app`.

> **Important:** `players.json` is committed to the repo, so it's baked into the deploy. Any time you re-run the snapshot, commit and push so the live site updates — or just use the in-app **Load data** box to paste fresh data without redeploying.

---

## 7. Add it to your phone's home screen

Open your Vercel URL on your phone, then:

- **iPhone (Safari):** tap the Share button → **Add to Home Screen** → Add.
- **Android (Chrome):** tap the ⋮ menu → **Add to Home screen** / **Install app**.

It now launches full-screen from its own icon, no browser bars. Because it's a PWA with a service worker, once you've opened it once it works **offline** — perfect for a draft venue with bad wifi.

---

## 8. Draft-day checklist

1. **Morning of:** re-run the snapshot for the freshest ADP/injuries, then `git commit && git push` (or plan to use the in-app Load data box).
2. Open the app on your phone; confirm the board looks current and injuries are flagged.
3. Set **team count** and your **draft slot** in the header.
4. During the draft: tap **Gone** when someone else picks, **Mine** when you pick. Watch the on-the-clock bar and the alerts.
5. If big news breaks right before the draft, re-run the snapshot and reload.

---

## Troubleshooting

- **Board is empty / still sample data** — you haven't run the snapshot yet, or it wrote to the wrong place. Confirm `src/data/players.json` updated, then restart `npm run dev`.
- **Snapshot says FantasyPros failed** — check the key and that you passed it as shown. The script still produces a board with computed tiers.
- **Icons look wrong after install** — you deployed before the icons existed; redeploy and reinstall from the home screen.
- **Deploy shows a blank page on a non-root path** — only relevant for GitHub Pages (needs a `base` in `vite.config.js`). Vercel/Netlify serve from root, so no change needed.

---

## What's intentionally not here

Live Yahoo auto-sync (auto-checking picks from your league) needs Yahoo API approval + a small serverless function. It's an optional future add-on — the manual check-off already covers draft day fully.
