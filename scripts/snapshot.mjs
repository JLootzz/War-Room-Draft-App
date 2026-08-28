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
 * Scouting notes (optional):
 *   - If ANTHROPIC_API_KEY is set -> generate a short plain-English note per
 *     top player via Claude Haiku, baked into players.json (shown offline).
 *
 * Board rankings (optional, powers the app's "next pick per source"):
 *   - ANTHROPIC_API_KEY -> Claude ranks the top players into its own board.
 *   - OPENAI_API_KEY + OPENAI_MODEL -> ChatGPT does the same.
 *     (Set OPENAI_MODEL to an id from your OpenAI dashboard, e.g. gpt-5.2.)
 *
 * Output: { name, pos, team, ecr, tier, adp, bye, injury, note, claudeRank,
 *   gptRank } — exactly the shape the app expects.
 *
 * Requires Node 18+ (uses global fetch). No npm install needed.
 *
 * Usage:
 *   node snapshot.mjs                                   # PPR, 12 teams, 2026
 *   node snapshot.mjs --scoring=half-ppr --teams=10
 *   FANTASYPROS_API_KEY=xxxx node snapshot.mjs          # better tiers
 *   ANTHROPIC_API_KEY=xxxx  node snapshot.mjs           # + notes + Claude board
 *   OPENAI_API_KEY=xxxx OPENAI_MODEL=gpt-5.2 node snapshot.mjs   # + ChatGPT board
 *   node snapshot.mjs --no-notes --no-rank             # skip the LLM passes
 *   node snapshot.mjs --out=src/data/players.json
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/* ----------------------------- config ----------------------------- */
function parseArgs(argv) {
  const a = {};
  argv.slice(2).forEach((s) => {
    const m = s.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) a[m[1]] = m[2] ?? "true";
  });
  return a;
}
const args = parseArgs(process.argv);
const YEAR = args.year || "2026";
const TEAMS = args.teams || "12";
const SCORING = (args.scoring || "ppr").toLowerCase(); // ffc: standard | ppr | half-ppr | 2qb
const OUT = args.out || "src/data/players.json";
const FP_KEY = process.env.FANTASYPROS_API_KEY || "";
const NOTES_LIMIT = Number(args.notes ?? 100);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || ""; // set to your account's model id, e.g. gpt-5.2
const RANK_LIMIT = Number(args.rank ?? 120);
const SCORING_LABEL = { ppr: "full PPR", "half-ppr": "half-PPR", standard: "standard (non-PPR)", "2qb": "2-QB / superflex" }[SCORING] || SCORING;

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

/**
 * Optional: generate a short scouting note per top player via Claude Haiku.
 * Runs locally in Node, so the API key stays on your machine (never shipped to
 * the browser). Notes are baked into players.json and shown offline in the app.
 * Grounded in the tier/ADP/bye/injury data — the model is told not to invent
 * stats or injury news. Mutates players in place (sets p.note).
 */
async function generateNotes(players) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.log("→ Notes: skipped (set ANTHROPIC_API_KEY to enable)."); return 0; }
  if (args["no-notes"]) { console.log("→ Notes: skipped (--no-notes)."); return 0; }

  const top = [...players].sort((a, b) => a.ecr - b.ecr).slice(0, NOTES_LIMIT);
  const BATCH = 20;
  let done = 0;
  console.log(`→ Notes: generating for top ${top.length} players via ${MODEL} ...`);

  const system =
    "You are a concise fantasy football draft analyst. For each player, write ONE note of 25-45 words: " +
    "first a brief outlook on their role and fantasy value, then a practical draft-day tip (when to target them, or a caution). " +
    `Scoring is ${SCORING_LABEL}. Base every note on general football knowledge plus the provided tier / ADP / bye / injury fields. ` +
    "Do NOT invent specific statistics, yardage, contract details, or injury news. " +
    "If an injury code is given, note it as a caution; if injury is 'none', do not speculate about health. " +
    "Return ONLY a JSON object mapping each exact player name to its note string — no markdown, no commentary.";

  for (let i = 0; i < top.length; i += BATCH) {
    const batch = top.slice(i, i + BATCH);
    const roster = batch.map((p) => ({
      name: p.name, pos: p.pos, team: p.team, tier: p.tier, adp: p.adp, bye: p.bye, injury: p.injury || "none",
    }));
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          system,
          messages: [{ role: "user", content: "Players:\n" + JSON.stringify(roster) }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn(`  ! notes batch ${i / BATCH + 1}: HTTP ${res.status} ${detail.slice(0, 120)}`);
        continue;
      }
      const data = await res.json();
      let text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
      const notes = JSON.parse(text);
      const byName = new Map(Object.entries(notes).map(([k, v]) => [normName(k), v]));
      batch.forEach((p) => { const n = byName.get(normName(p.name)); if (n) { p.note = String(n); done++; } });
    } catch (e) {
      console.warn(`  ! notes batch ${i / BATCH + 1} failed (${e.message}) — skipping.`);
    }
  }
  console.log(`  ${done} notes written.`);
  return done;
}

/**
 * Optional: ask a model to rank the top players into its own draft board.
 * Grounded in the provided data; the model must reuse only the given names.
 * Returns Map<normName, rank>. Used to show "next pick per source" in the app.
 */
function parseJsonArray(text) {
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("["), e = t.lastIndexOf("]");
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  const parsed = JSON.parse(t);
  return Array.isArray(parsed) ? parsed : (parsed.ranking || parsed.players || parsed.order || []);
}

async function rankBoard(provider, players) {
  const top = [...players].sort((a, b) => a.ecr - b.ecr).slice(0, RANK_LIMIT);
  const roster = top.map((p) => ({
    name: p.name, pos: p.pos, team: p.team, tier: p.tier, adp: p.adp, bye: p.bye, injury: p.injury || "none",
  }));
  const system =
    `You are an expert fantasy football draft analyst. Rank these players for a ${TEAMS}-team ${SCORING_LABEL} ` +
    "league in the order YOU would draft them, best first. Use ONLY the players provided; include every one exactly once; " +
    "never add or invent players. Ground the ranking in the provided tier / ADP / bye / injury fields plus general football " +
    "knowledge; do not fabricate stats or injury news. Return ONLY a JSON array of the exact player-name strings, in order.";
  const user = "Players:\n" + JSON.stringify(roster);

  let text;
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Claude HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 140)}`);
    const data = await res.json();
    text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  } else {
    // OpenAI GPT-5-series: chat/completions, Bearer auth, max_completion_tokens, no temperature
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${OPENAI_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_completion_tokens: 4000,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 140)}`);
    const data = await res.json();
    text = data.choices?.[0]?.message?.content || "";
  }

  const order = parseJsonArray(text);
  const rank = new Map();
  order.forEach((name, i) => { const k = normName(name); if (k && !rank.has(k)) rank.set(k, i + 1); });
  return rank;
}

async function askTakes(provider, players) {
  const top = [...players].sort((a, b) => a.ecr - b.ecr).slice(0, RANK_LIMIT);
  const roster = top.map((p) => ({ name: p.name, pos: p.pos, team: p.team, tier: p.tier, adp: p.adp, bye: p.bye, injury: p.injury || "none" }));
  const system =
    `You are a fantasy football analyst giving contrarian draft takes for a ${TEAMS}-team ${SCORING_LABEL} league. ` +
    "From the players provided, choose the SIX you feel most differently about versus their ADP. For each, write a one-sentence take " +
    "that STARTS with 'BUY' (you'd draft them earlier than ADP) or 'FADE' (let them slide), then a brief reason grounded in role or situation. " +
    "Do NOT invent specific stats or injury news; if unsure about a player, choose a different one. " +
    "Return ONLY a JSON object mapping the exact player name to the take string. At most 6 entries.";
  const user = "Players:\n" + JSON.stringify(roster);
  let text;
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`Claude HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 140)}`);
    const data = await res.json();
    text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  } else {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${OPENAI_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: OPENAI_MODEL, max_completion_tokens: 1200, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 140)}`);
    const data = await res.json();
    text = data.choices?.[0]?.message?.content || "";
  }
  let t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  const obj = JSON.parse(t);
  const m = new Map();
  Object.entries(obj).forEach(([k, v]) => { const kk = normName(k); if (kk) m.set(kk, String(v)); });
  return m;
}

async function addRankings(players) {
  if (args["no-rank"]) return { claude: 0, gpt: 0, claudeTakes: 0, gptTakes: 0 };
  const out = { claude: 0, gpt: 0, claudeTakes: 0, gptTakes: 0 };

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      console.log(`→ Claude board ranking (top ${RANK_LIMIT}) via ${MODEL} ...`);
      const r = await rankBoard("anthropic", players);
      players.forEach((p) => { const x = r.get(normName(p.name)); if (x) { p.claudeRank = x; out.claude++; } });
      console.log(`  ${out.claude} players ranked by Claude.`);
    } catch (e) { console.warn(`  ! Claude ranking failed (${e.message}).`); }
    try {
      console.log("→ Claude hot takes ...");
      const t = await askTakes("anthropic", players);
      players.forEach((p) => { const x = t.get(normName(p.name)); if (x) { p.claudeTake = x; out.claudeTakes++; } });
      console.log(`  ${out.claudeTakes} Claude hot takes.`);
    } catch (e) { console.warn(`  ! Claude hot takes failed (${e.message}).`); }
  }

  if (OPENAI_KEY) {
    if (!OPENAI_MODEL) {
      console.log("→ ChatGPT ranking: skipped (set OPENAI_MODEL to a model id from your OpenAI dashboard).");
    } else {
      try {
        console.log(`→ ChatGPT board ranking (top ${RANK_LIMIT}) via ${OPENAI_MODEL} ...`);
        const r = await rankBoard("openai", players);
        players.forEach((p) => { const x = r.get(normName(p.name)); if (x) { p.gptRank = x; out.gpt++; } });
        console.log(`  ${out.gpt} players ranked by ChatGPT.`);
      } catch (e) { console.warn(`  ! ChatGPT ranking failed (${e.message}). Check OPENAI_MODEL matches your account.`); }
      try {
        console.log("→ ChatGPT hot takes ...");
        const t = await askTakes("openai", players);
        players.forEach((p) => { const x = t.get(normName(p.name)); if (x) { p.gptTake = x; out.gptTakes++; } });
        console.log(`  ${out.gptTakes} ChatGPT hot takes.`);
      } catch (e) { console.warn(`  ! ChatGPT hot takes failed (${e.message}).`); }
    }
  }
  return out;
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

  const noteCount = await generateNotes(base);
  const ranks = await addRankings(base);

  const players = base
    .sort((a, b) => a.ecr - b.ecr)
    .map(({ name, pos, team, ecr, tier, adp, bye, injury, note, claudeRank, gptRank, claudeTake, gptTake }) => ({
      name, pos, team, ecr, tier, adp: Math.round(adp * 10) / 10, bye, injury,
      note: note || "", claudeRank: claudeRank || null, gptRank: gptRank || null,
      claudeTake: claudeTake || "", gptTake: gptTake || "",
    }));

  await mkdir(dirname(OUT) === "" ? "." : dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(players, null, 2));

  // summary
  const counts = players.reduce((m, p) => ((m[p.pos] = (m[p.pos] || 0) + 1), m), {});
  console.log("\n✓ Wrote", players.length, "players →", OUT);
  console.log("  Scoring:", SCORING, "| Teams:", TEAMS, "| Year:", YEAR);
  console.log("  Tiers:", tierSource);
  console.log("  Injuries flagged:", flagged);
  console.log("  Scouting notes:", noteCount);
  console.log("  Board rankings:", `Claude ${ranks.claude}, ChatGPT ${ranks.gpt}`);
  console.log("  Hot takes:", `Claude ${ranks.claudeTakes}, ChatGPT ${ranks.gptTakes}`);
  console.log("  By position:", counts);
  console.log("  Top 5:", players.slice(0, 5).map((p) => `${p.name} (${p.pos}, adp ${p.adp})`).join(", "));
  console.log("\n  Data: ADP via Fantasy Football Calculator" +
    (fp ? " · tiers via FantasyPros" : "") + (inj ? " · injuries via Sleeper" : "") +
    (noteCount ? " · notes via Claude" : "") +
    (ranks.claude ? " · Claude board" : "") + (ranks.gpt ? " · ChatGPT board" : "") + ".");
}

const isMain = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => { console.error("\n✗ Failed:", e.message); process.exit(1); });
}
