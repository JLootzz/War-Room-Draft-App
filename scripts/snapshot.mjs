#!/usr/bin/env node
/**
 * snapshot.mjs — build players.json for Draft War Room.
 *
 * Backbone: Fantasy Football Calculator ADP API (no key, free for personal use).
 *   https://fantasyfootballcalculator.com/api/v1/adp/{format}?teams={n}&year={year}
 *   Please attribute Fantasy Football Calculator; data refreshes once a day.
 *
 * Tiers + ECR:
 *   - If FANTASYPROS_API_KEY is set -> pull consensus tiers/ECR from FantasyPros.
 *   - Otherwise -> tiers are computed from ADP gaps (a sensible heuristic).
 *
 * Output: an array of { name, pos, team, ecr, tier, adp, bye } — exactly the
 * shape the app's "Load data" box and players.json expect.
 *
 * Requires Node 18+ (uses global fetch). No npm install needed.
 *
 * Usage:
 *   node snapshot.mjs                                   # PPR, 12 teams, 2026
 *   node snapshot.mjs --scoring=half-ppr --teams=10
 *   FANTASYPROS_API_KEY=xxxx node snapshot.mjs          # better tiers
 *   node snapshot.mjs --out=src/data/players.json
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/* ----------------------------- config ----------------------------- */
function parseArgs(argv) {
  const a = {};
  argv.slice(2).forEach((s) => {
    const m = s.match(/^--([^=]+)=(.*)$/);
    if (m) a[m[1]] = m[2];
  });
  return a;
}
const args = parseArgs(process.argv);
const YEAR = args.year || "2026";
const TEAMS = args.teams || "12";
const SCORING = (args.scoring || "ppr").toLowerCase(); // ffc: standard | ppr | half-ppr | 2qb
const OUT = args.out || "src/data/players.json";
const FP_KEY = process.env.FANTASYPROS_API_KEY || "";

// map FFC scoring -> FantasyPros scoring param
const FP_SCORING = { ppr: "PPR", "half-ppr": "HALF", standard: "STD", "2qb": "PPR" }[SCORING] || "PPR";

/* --------------------------- utilities ---------------------------- */
async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// Normalize a player name for cross-source matching.
export function normName(n) {
  return String(n)
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normPos(p) {
  const u = String(p).toUpperCase();
  if (u === "DEF" || u === "DST" || u === "D/ST") return "DST";
  if (u === "PK" || u === "K") return "K";
  return u;
}

/**
 * Heuristic tiering: within a position (sorted by adp asc), start a new tier
 * when the ADP gap to the previous player exceeds a depth-scaled threshold.
 * Not as good as expert-clustered tiers, but self-contained and dependable.
 */
export function computeTiers(sortedByAdp, { maxTierSize = 5 } = {}) {
  let tier = 1;
  let sizeInTier = 0;
  sortedByAdp.forEach((p, i) => {
    if (i === 0) { p.tier = 1; sizeInTier = 1; return; }
    const prev = sortedByAdp[i - 1];
    const gap = p.adp - prev.adp;
    const threshold = Math.max(4, prev.adp * 0.1); // small early, scales with depth
    // break on a real ADP gap, or when a tier gets too big to be meaningful
    if (gap > threshold || sizeInTier >= maxTierSize) { tier += 1; sizeInTier = 0; }
    p.tier = tier;
    sizeInTier += 1;
  });
  return sortedByAdp;
}

/* ------------------------- data sources --------------------------- */
async function getFFC() {
  const url = `https://fantasyfootballcalculator.com/api/v1/adp/${SCORING}?teams=${TEAMS}&year=${YEAR}`;
  console.log(`→ FFC ADP: ${url}`);
  const data = await fetchJSON(url);
  const players = (data.players || data.data || []).map((p) => ({
    name: p.name,
    pos: normPos(p.position),
    team: p.team || "",
    adp: Number(p.adp),
    bye: Number(p.bye) || 0,
  })).filter((p) => p.name && p.pos && Number.isFinite(p.adp));
  if (!players.length) throw new Error("FFC returned no players — check year/scoring/teams.");
  return players;
}

// Returns Map<normName, {tier, ecr}> from FantasyPros, or null on failure.
async function getFantasyProsTiers() {
  if (!FP_KEY) return null;
  const positions = ["QB", "RB", "WR", "TE"]; // name-match is reliable for skill positions
  const out = new Map();
  for (const pos of positions) {
    const url = `https://api.fantasypros.com/public/v2/json/nfl/${YEAR}/consensus-rankings?position=${pos}&scoring=${FP_SCORING}`;
    try {
      const data = await fetchJSON(url, { "x-api-key": FP_KEY });
      (data.players || []).forEach((p) => {
        const key = normName(p.player_name);
        if (key) out.set(key, { tier: Number(p.tier) || null, ecr: Number(p.rank_ecr) || null });
      });
      console.log(`→ FantasyPros ${pos}: ${(data.players || []).length} ranked`);
    } catch (e) {
      console.warn(`  ! FantasyPros ${pos} failed (${e.message}) — computing that group instead.`);
    }
  }
  return out.size ? out : null;
}

// Returns Map<normName, shortInjuryCode> from Sleeper's free public API, or null.
const INJ_CODE = {
  Questionable: "Q", Doubtful: "D", Out: "O", IR: "IR",
  PUP: "PUP", Sus: "SUS", COV: "COV", NA: "",
};
async function getSleeperInjuries() {
  if (args["no-injuries"] === "true" || args["no-injuries"] === "") return null;
  try {
    console.log("→ Sleeper injuries: https://api.sleeper.app/v1/players/nfl");
    const data = await fetchJSON("https://api.sleeper.app/v1/players/nfl");
    const out = new Map();
    for (const id in data) {
      const p = data[id];
      if (!p || !p.full_name || !p.injury_status) continue;
      const code = INJ_CODE[p.injury_status] ?? String(p.injury_status).slice(0, 3).toUpperCase();
      if (code) out.set(normName(p.full_name), code);
    }
    console.log(`  ${out.size} players carrying an injury designation.`);
    return out.size ? out : null;
  } catch (e) {
    console.warn(`  ! Sleeper injuries failed (${e.message}) — skipping flags.`);
    return null;
  }
}

/* ------------------------------ main ------------------------------ */
async function main() {
  const base = await getFFC();

  // overall ECR = rank by ADP (what a draft board actually keys on)
  base.sort((a, b) => a.adp - b.adp).forEach((p, i) => { p.ecr = i + 1; });

  // group by position for tiering
  const byPos = {};
  base.forEach((p) => (byPos[p.pos] ||= []).push(p));

  const fp = await getFantasyProsTiers();
  let tierSource = "computed from ADP gaps";

  Object.values(byPos).forEach((group) => {
    group.sort((a, b) => a.adp - b.adp);
    computeTiers(group); // guarantees every player has a tier
  });

  if (fp) {
    tierSource = "FantasyPros consensus (fallback: computed)";
    let matched = 0;
    base.forEach((p) => {
      const hit = fp.get(normName(p.name));
      if (hit && hit.tier) { p.tier = hit.tier; matched++; }
    });
    console.log(`→ Matched ${matched}/${base.length} players to FantasyPros tiers.`);
  }

  const inj = await getSleeperInjuries();
  let flagged = 0;
  base.forEach((p) => {
    p.injury = (inj && inj.get(normName(p.name))) || "";
    if (p.injury) flagged++;
  });

  const players = base
    .sort((a, b) => a.ecr - b.ecr)
    .map(({ name, pos, team, ecr, tier, adp, bye, injury }) => ({
      name, pos, team, ecr, tier, adp: Math.round(adp * 10) / 10, bye, injury,
    }));

  await mkdir(dirname(OUT) === "" ? "." : dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(players, null, 2));

  // summary
  const counts = players.reduce((m, p) => ((m[p.pos] = (m[p.pos] || 0) + 1), m), {});
  console.log("\n✓ Wrote", players.length, "players →", OUT);
  console.log("  Scoring:", SCORING, "| Teams:", TEAMS, "| Year:", YEAR);
  console.log("  Tiers:", tierSource);
  console.log("  Injuries flagged:", flagged);
  console.log("  By position:", counts);
  console.log("  Top 5:", players.slice(0, 5).map((p) => `${p.name} (${p.pos}, adp ${p.adp})`).join(", "));
  console.log("\n  Data: ADP via Fantasy Football Calculator" +
    (fp ? " · tiers via FantasyPros" : "") + (inj ? " · injuries via Sleeper" : "") + ".");
}

const isMain = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => { console.error("\n✗ Failed:", e.message); process.exit(1); });
}
