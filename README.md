# Draft War Room

A free, offline-first draft assistant for fantasy football. It tracks your draft board in real time and answers the only question that matters when you're on the clock: **who should I pick right now?**

Built as a personal, single-league tool for my own league — no accounts, no ads, no fees.

> **Personal, non-commercial project.** Intended for read-only use in a single private league. Not affiliated with, endorsed by, or connected to Yahoo, the NFL, or any data provider. Player data is used for personal draft prep only.

---

## What it does

Three engines run on every pick, so the board is always telling you something useful:

- **Best-available recommendations** — the top of your board is always surfaced, with a snake-draft-aware "on the clock" indicator that lights up when it's your turn and names the pick to make.
- **Tier & position-run alerts** — flags when a positional tier drops to two or fewer players left ("RB tier 3: 1 left — reach or lose the tier"), and detects runs when three of the last five picks share a position.
- **Value vs. ADP** — shows how far each available player has fallen past their average draft position, with a live "top values" panel that surfaces the biggest fallers as the draft unfolds.

Plus the draft-day essentials: roster tracking into starter slots, bye-week clash flagging, fast one-tap pick check-off (yours vs. taken), undo/reset, and search + position filters.

## How it works

Every player is just a row of data:

```json
{ "name": "Ja'Marr Chase", "pos": "WR", "team": "CIN", "ecr": 1, "tier": 1, "adp": 1, "bye": 10 }
```

Everything derives from that:

- **Best available** — filter to undrafted, sort by ECR (expert consensus rank).
- **Tier / run alerts** — group remaining players by position + tier; warn when the current tier has ≤2 left; scan the last five picks for a position appearing 3+ times.
- **Value** — `value = currentPick − adp`. Positive means the player is still on the board past where they normally go, i.e. a faller worth grabbing.

### Data snapshot, not live scraping

Rather than call ranking APIs live from the browser (CORS, rate limits, flaky venue wifi), a small script runs the morning of the draft, pulls ADP + tiers into a local `players.json`, and ships it with the app. The draft tool then runs entirely offline at the table.

### Pick tracking

Fast **manual check-off** is the default — robust, offline, zero setup. **Optional Yahoo auto-sync** (read-only) can poll the league's `draft_results` during the draft to check players off hands-free, with manual override always available as a fallback.

## Tech stack

- **React + Vite** — single-page app
- **PWA** — installable to your phone's home screen, full-screen, offline via a service worker
- **localStorage** — draft state persists across refreshes and app-switches
- **Serverless function** *(optional)* — a small Vercel / Netlify / Cloudflare function to handle the Yahoo OAuth token exchange, so no secret ever lives in the browser

## Data sources

This project stands on the shoulders of some excellent free resources:

- [Fantasy Football Calculator](https://fantasyfootballcalculator.com/adp) — average draft position (free REST API)
- [FantasyPros](https://www.fantasypros.com/api-data/) — consensus rankings and tiers (public API, free key)
- [Boris Chen](http://www.borischen.co/) — tier clustering from expert rankings

All rankings and ADP belong to their respective providers and are used here for personal draft prep.

## Getting started

Prerequisites: Node.js 18+.

```bash
git clone https://github.com/<your-username>/draft-war-room.git
cd draft-war-room
npm install
npm run dev      # local dev server
npm run build    # production build in /dist
```

**Load your data:** run the snapshot script (or use the in-app "Load data" box, which accepts JSON or CSV with columns `name, pos, team, ecr, tier, adp, bye`).

```bash
npm run snapshot   # writes src/data/players.json from the sources above
```

**Deploy:** push the repo to a free host (Vercel, Netlify, or Cloudflare Pages) — all auto-build Vite projects. Then open the URL on your phone and choose **Add to Home Screen** to install it like a native app.

## Optional: Yahoo live sync

Read-only sync is a bonus layer, not a dependency — the app is fully usable without it.

1. Apply for [Yahoo Fantasy Sports API access](https://sports.yahoo.com/developer/) (read-only is all that's needed; approval isn't instant, so apply early).
2. Add your credentials as **server-side** environment variables (never commit them):

   ```
   YAHOO_CLIENT_ID=...
   YAHOO_CLIENT_SECRET=...
   ```

3. The serverless function handles the OAuth flow and proxies `draft_results` polls. Picks are matched to the board by player name/ID and checked off automatically.

## Roadmap

- [x] Draft engine: best-available, tier/run alerts, value-vs-ADP
- [x] Manual check-off, roster + bye tracking, data import
- [ ] Vite PWA + offline service worker
- [ ] Data snapshot script
- [ ] localStorage persistence
- [ ] Yahoo read-only auto-sync (serverless OAuth proxy)

## Disclaimer

Any sample data included in the repo is approximate and for demonstration only — it is not draft advice. This is a personal project and is not affiliated with any fantasy platform or data provider.

## License

MIT — see [LICENSE](LICENSE). *(Add an MIT license file if you haven't yet.)*# War-Room-Draft-App
