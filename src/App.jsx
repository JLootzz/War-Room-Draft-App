import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Search, Undo2, RotateCcw, Upload, X, Flame, TriangleAlert, Star } from "lucide-react";
import DATA from "./data/players.json";

/* ------------------------------------------------------------------ */
/*  SAMPLE DATA — 2026, approximate & illustrative only.               */
/*  Replace via the "Load data" box with a real FFC / FantasyPros      */
/*  export. Fields: name, pos, team, ecr, tier (per position), adp, bye*/
/* ------------------------------------------------------------------ */
const SEED = [
  ["Ja'Marr Chase","WR","CIN",1,1,1,10],
  ["Bijan Robinson","RB","ATL",1,1,2,5],
  ["Jahmyr Gibbs","RB","DET",1,1,3,8],
  ["Justin Jefferson","WR","MIN",1,1,4,6],
  ["Saquon Barkley","RB","PHI",1,1,6,9],
  ["CeeDee Lamb","WR","DAL",1,1,5,10],
  ["Christian McCaffrey","RB","SF",2,2,7,14],
  ["Puka Nacua","WR","LAR",2,1,9,8],
  ["Amon-Ra St. Brown","WR","DET",2,1,8,8],
  ["Ashton Jeanty","RB","LV",2,2,11,8],
  ["Malik Nabers","WR","NYG",2,2,13,14],
  ["De'Von Achane","RB","MIA",2,2,10,12],
  ["Nico Collins","WR","HOU",3,2,12,6],
  ["A.J. Brown","WR","PHI",3,2,16,9],
  ["Brian Thomas Jr.","WR","JAX",3,2,15,8],
  ["Breece Hall","RB","NYJ",3,3,19,9],
  ["Drake London","WR","ATL",3,3,14,5],
  ["Brock Bowers","TE","LV",1,1,17,8],
  ["Derrick Henry","RB","BAL",3,3,20,7],
  ["Josh Jacobs","RB","GB",3,3,22,5],
  ["Ladd McConkey","WR","LAC",4,3,24,12],
  ["Jonathan Taylor","RB","IND",4,3,18,11],
  ["Tee Higgins","WR","CIN",4,3,27,10],
  ["Trey McBride","TE","ARI",1,1,21,8],
  ["Bucky Irving","RB","TB",4,4,25,9],
  ["Davante Adams","WR","LAR",4,4,31,8],
  ["Chase Brown","RB","CIN",4,4,26,10],
  ["Garrett Wilson","WR","NYJ",4,4,29,9],
  ["Kyren Williams","RB","LAR",5,4,23,8],
  ["Marvin Harrison Jr.","WR","ARI",5,4,35,8],
  ["Terry McLaurin","WR","WAS",5,4,30,12],
  ["James Cook","RB","BUF",5,5,33,7],
  ["DJ Moore","WR","CHI",5,5,28,5],
  ["Josh Allen","QB","BUF",1,1,39,7],
  ["Lamar Jackson","QB","BAL",1,1,37,7],
  ["Jaxon Smith-Njigba","WR","SEA",5,5,41,8],
  ["DK Metcalf","WR","PIT",5,5,36,5],
  ["George Kittle","TE","SF",2,2,45,14],
  ["Kenneth Walker III","RB","SEA",5,5,34,8],
  ["Alvin Kamara","RB","NO",6,6,40,11],
  ["Jayden Daniels","QB","WAS",1,2,42,12],
  ["Jalen Hurts","QB","PHI",2,2,44,9],
  ["Mike Evans","WR","TB",6,5,32,9],
  ["Sam LaPorta","TE","DET",2,2,47,8],
  ["Calvin Ridley","WR","TEN",6,6,52,10],
  ["Chuba Hubbard","RB","CAR",6,6,46,14],
  ["Patrick Mahomes","QB","KC",2,3,54,10],
  ["Zay Flowers","WR","BAL",6,6,43,7],
  ["James Conner","RB","ARI",6,6,49,8],
  ["Drake Maye","QB","NE",3,3,50,14],
  ["DeVonta Smith","WR","PHI",6,6,38,9],
  ["Aaron Jones","RB","MIN",7,7,58,6],
  ["Courtland Sutton","WR","DEN",7,6,53,12],
  ["Jordan Addison","WR","MIN",7,7,61,6],
  ["David Montgomery","RB","DET",7,7,55,8],
  ["Jerry Jeudy","WR","CLE",7,7,57,9],
  ["T.J. Hockenson","TE","MIN",3,3,56,6],
  ["Joe Burrow","QB","CIN",3,3,48,10],
  ["Jameson Williams","WR","DET",7,7,51,8],
  ["Dak Prescott","QB","DAL",3,4,61,10],
  ["Tony Pollard","RB","TEN",8,8,64,10],
  ["Xavier Worthy","WR","KC",7,8,59,10],
  ["Travis Kelce","TE","KC",3,4,66,10],
  ["Jaylen Waddle","WR","MIA",8,8,63,12],
  ["Isiah Pacheco","RB","KC",8,8,60,10],
  ["Rome Odunze","WR","CHI",8,8,62,5],
  ["Caleb Williams","QB","CHI",4,4,70,5],
].map((r, i) => ({
  id: i + 1, name: r[0], pos: r[1], team: r[2],
  tier: r[4], ecr: i + 1, posrank: 0, adp: r[5], bye: r[6],
}));
// assign positional rank for display
(() => {
  const c = {};
  SEED.forEach((p) => { c[p.pos] = (c[p.pos] || 0) + 1; p.posrank = c[p.pos]; });
})();

// Give a raw list stable ids + positional ranks (used for imported / players.json data)
function prepPool(list) {
  const c = {};
  return list
    .slice()
    .sort((a, b) => (a.ecr ?? a.adp ?? 0) - (b.ecr ?? b.adp ?? 0))
    .map((p, i) => {
      const pos = String(p.pos || p.position || "").toUpperCase();
      c[pos] = (c[pos] || 0) + 1;
      return {
        id: i + 1,
        name: p.name,
        pos,
        team: p.team || "",
        ecr: Number(p.ecr ?? i + 1),
        tier: Number(p.tier ?? 1),
        adp: Number(p.adp ?? p.ecr ?? i + 1),
        bye: Number(p.bye ?? 0),
        injury: p.injury || "",
        posrank: c[pos],
      };
    });
}

// Prefer players.json; fall back to the built-in sample if it's empty
const INITIAL_POOL = Array.isArray(DATA) && DATA.length ? prepPool(DATA) : SEED;

// ---- persistence (survives refresh / phone-lock during a live draft) ----
const LS_KEY = "dwr-state-v1";
function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}

const POS = ["ALL", "QB", "RB", "WR", "TE"];
const POS_COLOR = { QB: "#e0709a", RB: "#47c2c7", WR: "#7c8cf0", TE: "#e0a33c" };
const STARTERS = [
  { slot: "QB", accepts: ["QB"] },
  { slot: "RB", accepts: ["RB"] },
  { slot: "RB", accepts: ["RB"] },
  { slot: "WR", accepts: ["WR"] },
  { slot: "WR", accepts: ["WR"] },
  { slot: "TE", accepts: ["TE"] },
  { slot: "FLEX", accepts: ["RB", "WR", "TE"] },
];

function onClock(pick, teams) {
  const idx = (pick - 1) % teams;
  const round = Math.floor((pick - 1) / teams) + 1;
  const slot = round % 2 === 1 ? idx + 1 : teams - idx;
  return { round, slot, pickInRound: idx + 1 };
}

function assignRoster(myPlayers) {
  const sorted = [...myPlayers].sort((a, b) => a.ecr - b.ecr);
  const slots = STARTERS.map((s) => ({ ...s, player: null }));
  const bench = [];
  sorted.forEach((p) => {
    const open = slots.find((s) => !s.player && s.accepts.includes(p.pos));
    if (open) open.player = p; else bench.push(p);
  });
  return { slots, bench };
}

export default function DraftWarRoom() {
  const boot = loadState();
  const [players, setPlayers] = useState(boot.players?.length ? boot.players : INITIAL_POOL);
  const [log, setLog] = useState(boot.log || []); // {id, by:'me'|'other', pick}
  const [teams, setTeams] = useState(boot.teams || 12);
  const [mySlot, setMySlot] = useState(boot.mySlot || 1);
  const [scoring, setScoring] = useState(boot.scoring || "PPR");
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("rank");
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState("");

  // autosave everything so a refresh or phone-lock never wipes the board
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ players, log, teams, mySlot, scoring }));
    } catch { /* storage full or unavailable — draft still works in memory */ }
  }, [players, log, teams, mySlot, scoring]);

  const draftedIds = useMemo(() => new Set(log.map((l) => l.id)), [log]);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const currentPick = log.length + 1;
  const clock = onClock(currentPick, teams);
  const isMyPick = clock.slot === mySlot;

  const available = useMemo(
    () => players.filter((p) => !draftedIds.has(p.id)),
    [players, draftedIds]
  );

  const valued = useMemo(
    () => available.map((p) => ({ ...p, delta: currentPick - p.adp })),
    [available, currentPick]
  );

  const recByRank = useMemo(
    () => [...available].sort((a, b) => a.ecr - b.ecr)[0],
    [available]
  );
  const bestValue = useMemo(
    () => [...valued].sort((a, b) => b.delta - a.delta).find((p) => p.delta >= 3),
    [valued]
  );

  // tier scarcity: for each pos, the current (lowest) tier still on the board
  const tierAlerts = useMemo(() => {
    const out = [];
    ["RB", "WR", "TE", "QB"].forEach((pos) => {
      const rem = available.filter((p) => p.pos === pos);
      if (!rem.length) return;
      const curTier = Math.min(...rem.map((p) => p.tier));
      const left = rem.filter((p) => p.tier === curTier).length;
      if (left <= 2) out.push({ pos, tier: curTier, left });
    });
    return out.sort((a, b) => a.left - b.left);
  }, [available]);

  // position run: last 5 picks
  const runAlert = useMemo(() => {
    const last = log.slice(-5).map((l) => byId[l.id]?.pos).filter(Boolean);
    const c = {};
    last.forEach((p) => (c[p] = (c[p] || 0) + 1));
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 3 ? { pos: top[0], n: top[1] } : null;
  }, [log, byId]);

  const myPlayers = useMemo(
    () => log.filter((l) => l.by === "me").map((l) => byId[l.id]).filter(Boolean),
    [log, byId]
  );
  const roster = useMemo(() => assignRoster(myPlayers), [myPlayers]);
  const byeClash = useMemo(() => {
    const byes = roster.slots.filter((s) => s.player).map((s) => s.player.bye);
    return byes.filter((b, i) => byes.indexOf(b) !== i);
  }, [roster]);

  const shown = useMemo(() => {
    let list = valued;
    if (posFilter !== "ALL") list = list.filter((p) => p.pos === posFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => (p.name + " " + p.team).toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => (sortBy === "value" ? b.delta - a.delta : a.ecr - b.ecr));
    return list.slice(0, 60);
  }, [valued, posFilter, query, sortBy]);

  const draft = useCallback((id, by) => {
    setLog((l) => [...l, { id, by, pick: l.length + 1 }]);
  }, []);
  const undo = useCallback(() => setLog((l) => l.slice(0, -1)), []);
  const reset = useCallback(() => setLog([]), []);

  const loadData = () => {
    setImportErr("");
    const txt = importText.trim();
    if (!txt) { setImportErr("Paste JSON or CSV first."); return; }
    try {
      let rows;
      if (txt[0] === "[" || txt[0] === "{") {
        rows = JSON.parse(txt);
      } else {
        const lines = txt.split(/\r?\n/).filter(Boolean);
        const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
        rows = lines.slice(1).map((ln) => {
          const c = ln.split(",");
          const o = {};
          head.forEach((h, i) => (o[h] = (c[i] || "").trim()));
          return o;
        });
      }
      const norm = rows.map((r, i) => ({
        id: i + 1,
        name: r.name || r.player || "?",
        pos: (r.pos || r.position || "").toUpperCase(),
        team: r.team || "",
        ecr: Number(r.ecr ?? r.rank ?? i + 1),
        tier: Number(r.tier ?? 1),
        adp: Number(r.adp ?? r.ecr ?? i + 1),
        bye: Number(r.bye ?? 0),
        injury: r.injury || r.injury_status || "",
        posrank: 0,
      })).filter((p) => p.name && p.pos);
      if (!norm.length) throw new Error("No valid rows found.");
      const c = {};
      norm.sort((a, b) => a.ecr - b.ecr).forEach((p) => { c[p.pos] = (c[p.pos] || 0) + 1; p.posrank = c[p.pos]; });
      setPlayers(norm);
      setLog([]);
      setShowImport(false);
      setImportText("");
    } catch (e) {
      setImportErr("Couldn't parse that: " + e.message);
    }
  };

  const valuePill = (delta) => {
    if (delta >= 3) return <span className="pill go">▼ {delta} value</span>;
    if (delta <= -6) return <span className="pill cold">▲ {-delta} early</span>;
    return <span className="pill neutral">≈ adp</span>;
  };

  return (
    <div className="warroom">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="brand">
          <span className="mark">◆</span>
          <span className="brandname">WAR ROOM</span>
          <span className="brandsub">draft assistant · prototype</span>
        </div>
        <div className="settings">
          <label>Teams
            <select value={teams} onChange={(e) => setTeams(+e.target.value)}>
              {[8, 10, 12, 14].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>My slot
            <select value={mySlot} onChange={(e) => setMySlot(+e.target.value)}>
              {Array.from({ length: teams }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Scoring
            <select value={scoring} onChange={(e) => setScoring(e.target.value)}>
              {["PPR", "Half", "Standard"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <button className="ghost" onClick={() => setShowImport(true)}><Upload size={13} /> Load data</button>
        </div>
      </header>

      {/* signature: ON THE CLOCK recommendation ticker */}
      <section className={"clock" + (isMyPick ? " mine" : "")}>
        <div className="clock-meta">
          <span className="dot" />
          <span className="pickno">{clock.round}.{String(clock.pickInRound).padStart(2, "0")}</span>
          <span className="clock-label">
            {available.length === 0 ? "Draft complete" : isMyPick ? "You're on the clock" : `Team ${clock.slot} on the clock`}
          </span>
        </div>
        {recByRank ? (
          <div className="clock-rec">
            <div className="rec-primary">
              <span className="rec-verb">Take</span>
              <span className="rec-name">{recByRank.name}</span>
              <span className="rec-tag" style={{ color: POS_COLOR[recByRank.pos] }}>
                {recByRank.pos}{recByRank.posrank} · tier {recByRank.tier}
              </span>
            </div>
            <div className="rec-value">
              {bestValue
                ? <>best value on board: <b>{bestValue.name}</b> <span className="go">▼ {bestValue.delta} past ADP</span></>
                : <span className="muted">values appear as players fall past their ADP</span>}
            </div>
          </div>
        ) : <div className="clock-rec"><span className="muted">Board is empty.</span></div>}
      </section>

      <div className="grid">
        {/* LEFT: alerts */}
        <aside className="col alerts">
          <div className="eyebrow">Signals</div>
          {runAlert && (
            <div className="alert hot">
              <Flame size={14} />
              <div><b>{runAlert.pos} run</b><span>{runAlert.n} of the last 5 picks — get ahead of it</span></div>
            </div>
          )}
          {tierAlerts.map((a) => (
            <div key={a.pos} className={"alert" + (a.left === 1 ? " hot" : "")}>
              <TriangleAlert size={14} />
              <div>
                <b>{a.pos} tier {a.tier}: {a.left} left</b>
                <span>{a.left === 1 ? "last one — reach or lose the tier" : "thinning out"}</span>
              </div>
            </div>
          ))}
          {!runAlert && tierAlerts.length === 0 && (
            <div className="empty-note">No scarcity yet. Alerts fire when a tier drops to ≤2 or a position runs.</div>
          )}

          <div className="eyebrow mt">Top values</div>
          {valued.filter((p) => p.delta >= 3).sort((a, b) => b.delta - a.delta).slice(0, 5).map((p) => (
            <button key={p.id} className="valrow" onClick={() => draft(p.id, "me")}>
              <span className="vn">{p.name}</span>
              <span className="go">▼ {p.delta}</span>
            </button>
          ))}
          {valued.filter((p) => p.delta >= 3).length === 0 && (
            <div className="empty-note">None have fallen past ADP yet.</div>
          )}
        </aside>

        {/* CENTER: best available */}
        <main className="col board">
          <div className="board-head">
            <div className="tabs">
              {POS.map((p) => (
                <button key={p} className={"tab" + (posFilter === p ? " on" : "")} onClick={() => setPosFilter(p)}>{p}</button>
              ))}
            </div>
            <div className="board-tools">
              <div className="sortsw">
                <button className={sortBy === "rank" ? "on" : ""} onClick={() => setSortBy("rank")}>Rank</button>
                <button className={sortBy === "value" ? "on" : ""} onClick={() => setSortBy("value")}>Value</button>
              </div>
              <div className="searchbox">
                <Search size={14} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search player" aria-label="Search player" />
                {query && <button className="clr" onClick={() => setQuery("")} aria-label="Clear"><X size={13} /></button>}
              </div>
            </div>
          </div>

          <div className="rows">
            {shown.map((p) => (
              <div key={p.id} className={"prow" + (recByRank && p.id === recByRank.id ? " rec" : "")}>
                <span className="rk">{p.ecr}</span>
                <span className="pbadge" style={{ background: POS_COLOR[p.pos] }}>{p.pos}</span>
                <span className="pmain">
                  <span className="pname">{p.name}{p.injury && <span className="inj">{p.injury}</span>}{recByRank && p.id === recByRank.id && <Star size={12} className="recstar" />}</span>
                  <span className="pmeta">{p.team} · {p.pos}{p.posrank} · tier {p.tier} · bye {p.bye}</span>
                </span>
                <span className="padp">{valuePill(p.delta)}<span className="adpn">adp {p.adp}</span></span>
                <span className="pacts">
                  <button className="mine" onClick={() => draft(p.id, "me")}>Mine</button>
                  <button className="gone" onClick={() => draft(p.id, "other")}>Gone</button>
                </span>
              </div>
            ))}
            {shown.length === 0 && <div className="empty-note pad">No players match. Clear the search or switch positions.</div>}
          </div>
        </main>

        {/* RIGHT: roster */}
        <aside className="col roster">
          <div className="eyebrow">My roster · slot {mySlot}</div>
          <div className="slots">
            {roster.slots.map((s, i) => (
              <div key={i} className={"slot" + (s.player ? " filled" : "")}>
                <span className="slabel">{s.slot}</span>
                {s.player
                  ? <span className="splayer">{s.player.name} <em>{s.player.team} · bye {s.player.bye}</em></span>
                  : <span className="sempty">open</span>}
              </div>
            ))}
          </div>
          {roster.bench.length > 0 && (
            <>
              <div className="eyebrow mt">Bench</div>
              <div className="bench">{roster.bench.map((p) => <span key={p.id} className="bpill">{p.name}</span>)}</div>
            </>
          )}
          {byeClash.length > 0 && (
            <div className="alert hot mt"><TriangleAlert size={14} /><div><b>Bye stack</b><span>starters share bye week {byeClash.join(", ")}</span></div></div>
          )}
        </aside>
      </div>

      {/* draft log */}
      <footer className="logbar">
        <div className="eyebrow inline">Log</div>
        <div className="logscroll">
          {log.length === 0 && <span className="muted">Pick players above — "Mine" adds to your team, "Gone" marks taken.</span>}
          {log.map((l, i) => {
            const c = onClock(l.pick, teams);
            const p = byId[l.id];
            return <span key={i} className={"logitem" + (l.by === "me" ? " me" : "")}>{c.round}.{String(c.pickInRound).padStart(2, "0")} {p?.name}</span>;
          })}
        </div>
        <div className="logacts">
          <button className="ghost" onClick={undo} disabled={!log.length}><Undo2 size={13} /> Undo</button>
          <button className="ghost" onClick={reset} disabled={!log.length}><RotateCcw size={13} /> Reset</button>
        </div>
      </footer>

      <div className="sampletag">Board loaded from players.json · re-run the snapshot script for the latest ADP, tiers &amp; injuries · ADP by Fantasy Football Calculator</div>

      {showImport && (
        <div className="modal" onClick={() => setShowImport(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h3>Load your player pool</h3>
              <button className="clr" onClick={() => setShowImport(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <p className="sheet-help">Paste JSON (array of objects) or CSV with a header row. Recognized columns: <code>name, pos, team, ecr, tier, adp, bye</code>. This replaces the pool and clears the current draft.</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='[{"name":"Ja&apos;Marr Chase","pos":"WR","team":"CIN","ecr":1,"tier":1,"adp":1,"bye":10}, ...]' />
            {importErr && <div className="sheet-err">{importErr}</div>}
            <div className="sheet-acts">
              <button className="ghost" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="primary" onClick={loadData}>Load pool</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
.warroom{
  --field:#0c1512; --panel:#13201b; --panel2:#1a2b23; --line:#2a3f35;
  --chalk:#eaf2ec; --dim:#8fa79a; --go:#3ed598; --flag:#f2b441; --cold:#ff6b57;
  font-family:'Inter',system-ui,sans-serif; color:var(--chalk);
  background:
    radial-gradient(1200px 400px at 80% -10%, rgba(62,213,152,.06), transparent 60%),
    var(--field);
  min-height:100%; padding:14px; box-sizing:border-box;
}
.warroom *{box-sizing:border-box}
.warroom button{font-family:inherit; cursor:pointer}
.warroom :focus-visible{outline:2px solid var(--go); outline-offset:2px}
.disp,.pickno,.rk,.brandname,.eyebrow,.rec-verb{font-family:'Oswald','Inter',sans-serif}

/* header */
.topbar{display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px}
.brand{display:flex; align-items:baseline; gap:8px}
.mark{color:var(--go); font-size:15px}
.brandname{font-weight:700; letter-spacing:.14em; font-size:19px}
.brandsub{color:var(--dim); font-size:11px; letter-spacing:.04em}
.settings{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
.settings label{display:flex; flex-direction:column; font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); gap:3px}
.settings select{background:var(--panel2); color:var(--chalk); border:1px solid var(--line); border-radius:6px; padding:5px 7px; font-family:inherit; font-size:13px}
.ghost{background:var(--panel2); color:var(--chalk); border:1px solid var(--line); border-radius:6px; padding:7px 10px; font-size:12px; display:inline-flex; align-items:center; gap:6px}
.ghost:hover{border-color:var(--go)}
.ghost:disabled{opacity:.4; cursor:default}

/* signature clock bar */
.clock{
  border:1px solid var(--line); border-left:3px solid var(--dim);
  background:linear-gradient(90deg, rgba(255,255,255,.02), transparent);
  border-radius:10px; padding:12px 16px; margin-bottom:12px;
  display:flex; align-items:center; gap:22px; flex-wrap:wrap;
}
.clock.mine{border-left-color:var(--go); background:linear-gradient(90deg, rgba(62,213,152,.12), transparent)}
.clock-meta{display:flex; align-items:center; gap:9px; min-width:180px}
.dot{width:9px; height:9px; border-radius:50%; background:var(--dim)}
.clock.mine .dot{background:var(--go); box-shadow:0 0 0 0 rgba(62,213,152,.6); animation:pulse 1.8s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 8px rgba(62,213,152,0)}100%{box-shadow:0 0 0 0 rgba(62,213,152,0)}}
@media (prefers-reduced-motion:reduce){.clock.mine .dot{animation:none}}
.pickno{font-size:26px; font-weight:700; letter-spacing:.02em; line-height:1}
.clock-label{font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--dim)}
.clock.mine .clock-label{color:var(--go)}
.clock-rec{display:flex; flex-direction:column; gap:3px}
.rec-primary{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
.rec-verb{font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--dim)}
.rec-name{font-size:20px; font-weight:600}
.rec-tag{font-size:12px; font-weight:600}
.rec-value{font-size:12px; color:var(--dim)}
.rec-value b{color:var(--chalk); font-weight:600}

/* grid */
.grid{display:grid; grid-template-columns:230px 1fr 250px; gap:12px; align-items:start}
.col{background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px}
.eyebrow{font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--dim); margin-bottom:9px; padding-bottom:7px; border-bottom:1px solid var(--line)}
.eyebrow.mt{margin-top:16px}
.eyebrow.inline{border:none; padding:0; margin:0}

/* alerts */
.alert{display:flex; gap:8px; align-items:flex-start; background:var(--panel2); border:1px solid var(--line); border-radius:8px; padding:8px 9px; margin-bottom:7px}
.alert svg{color:var(--flag); flex-shrink:0; margin-top:1px}
.alert.hot{border-color:rgba(242,180,65,.5)}
.alert.hot svg{color:var(--flag)}
.alert div{display:flex; flex-direction:column}
.alert b{font-size:12px; font-weight:600}
.alert span{font-size:10.5px; color:var(--dim)}
.empty-note{font-size:11px; color:var(--dim); line-height:1.5}
.empty-note.pad{padding:20px 8px; text-align:center}
.valrow{display:flex; justify-content:space-between; align-items:center; width:100%; background:none; border:none; border-bottom:1px dashed var(--line); padding:7px 2px; color:var(--chalk); text-align:left}
.valrow:hover{background:var(--panel2)}
.vn{font-size:12.5px}
.go{color:var(--go); font-weight:600}
.cold{color:var(--cold)}

/* board */
.board-head{display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap}
.tabs{display:flex; gap:4px}
.tab{background:var(--panel2); border:1px solid var(--line); color:var(--dim); border-radius:6px; padding:5px 11px; font-size:12px; font-weight:600; letter-spacing:.03em}
.tab.on{color:var(--field); background:var(--chalk); border-color:var(--chalk)}
.board-tools{display:flex; gap:8px; align-items:center}
.sortsw{display:flex; border:1px solid var(--line); border-radius:6px; overflow:hidden}
.sortsw button{background:var(--panel2); color:var(--dim); border:none; padding:5px 10px; font-size:11px}
.sortsw button.on{background:var(--go); color:var(--field); font-weight:600}
.searchbox{display:flex; align-items:center; gap:6px; background:var(--panel2); border:1px solid var(--line); border-radius:6px; padding:5px 8px}
.searchbox svg{color:var(--dim)}
.searchbox input{background:none; border:none; color:var(--chalk); font-family:inherit; font-size:13px; width:120px; outline:none}
.clr{background:none; border:none; color:var(--dim); display:inline-flex; padding:2px}

.rows{display:flex; flex-direction:column}
.prow{display:grid; grid-template-columns:30px 30px 1fr auto auto; align-items:center; gap:10px; padding:7px 6px; border-bottom:1px solid var(--line)}
.prow:hover{background:var(--panel2)}
.prow.rec{background:linear-gradient(90deg, rgba(62,213,152,.10), transparent); border-left:2px solid var(--go); padding-left:4px}
.rk{font-size:13px; font-weight:600; color:var(--dim); text-align:center}
.pbadge{color:#0c1512; font-size:9.5px; font-weight:700; text-align:center; border-radius:4px; padding:3px 0; letter-spacing:.03em}
.pmain{display:flex; flex-direction:column; min-width:0}
.pname{font-size:14px; font-weight:600; display:flex; align-items:center; gap:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.recstar{color:var(--go)}
.inj{font-size:8.5px; font-weight:700; letter-spacing:.03em; color:var(--cold); border:1px solid rgba(255,107,87,.5); border-radius:3px; padding:0 3px; line-height:1.4}
.pmeta{font-size:10.5px; color:var(--dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.padp{display:flex; flex-direction:column; align-items:flex-end; gap:2px}
.pill{font-size:10px; font-weight:600; padding:2px 7px; border-radius:20px; white-space:nowrap}
.pill.go{background:rgba(62,213,152,.14); color:var(--go)}
.pill.cold{background:rgba(255,107,87,.12); color:var(--cold)}
.pill.neutral{background:var(--panel2); color:var(--dim)}
.adpn{font-size:9.5px; color:var(--dim); letter-spacing:.02em}
.pacts{display:flex; gap:5px}
.pacts button{border-radius:6px; padding:6px 10px; font-size:11.5px; font-weight:600; border:1px solid var(--line)}
.mine{background:rgba(62,213,152,.14); color:var(--go); border-color:rgba(62,213,152,.4)!important}
.mine:hover{background:var(--go); color:var(--field)}
.gone{background:var(--panel2); color:var(--dim)}
.gone:hover{color:var(--chalk); border-color:var(--dim)}

/* roster */
.slots{display:flex; flex-direction:column; gap:5px}
.slot{display:flex; align-items:center; gap:9px; background:var(--panel2); border:1px solid var(--line); border-radius:7px; padding:7px 9px}
.slot.filled{border-color:rgba(62,213,152,.3)}
.slabel{font-family:'Oswald',sans-serif; font-size:10px; font-weight:600; letter-spacing:.1em; color:var(--dim); width:34px}
.slot.filled .slabel{color:var(--go)}
.splayer{font-size:12.5px; font-weight:500}
.splayer em{font-style:normal; color:var(--dim); font-size:10.5px}
.sempty{font-size:11.5px; color:var(--dim); font-style:italic}
.bench{display:flex; flex-wrap:wrap; gap:5px}
.bpill{font-size:11px; background:var(--panel2); border:1px solid var(--line); border-radius:20px; padding:3px 9px; color:var(--dim)}

/* log */
.logbar{display:flex; align-items:center; gap:12px; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:9px 12px; margin-top:12px}
.logscroll{flex:1; display:flex; gap:7px; overflow-x:auto; padding:2px}
.logitem{font-size:11px; white-space:nowrap; color:var(--dim); background:var(--panel2); border:1px solid var(--line); border-radius:5px; padding:3px 8px}
.logitem.me{color:var(--go); border-color:rgba(62,213,152,.4)}
.logacts{display:flex; gap:6px}
.muted{color:var(--dim); font-size:11.5px}

.sampletag{text-align:center; font-size:10px; color:var(--dim); margin-top:10px; letter-spacing:.03em}

/* modal */
.modal{position:fixed; inset:0; background:rgba(6,11,9,.7); display:flex; align-items:center; justify-content:center; padding:20px; z-index:50}
.sheet{background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:18px; max-width:520px; width:100%}
.sheet-head{display:flex; justify-content:space-between; align-items:center; margin-bottom:8px}
.sheet-head h3{margin:0; font-family:'Oswald',sans-serif; font-weight:600; letter-spacing:.04em; font-size:17px}
.sheet-help{font-size:12px; color:var(--dim); line-height:1.6; margin:0 0 10px}
.sheet-help code{background:var(--panel2); padding:1px 5px; border-radius:4px; color:var(--chalk); font-size:11px}
.sheet textarea{width:100%; height:150px; background:var(--field); border:1px solid var(--line); border-radius:8px; color:var(--chalk); font-family:ui-monospace,monospace; font-size:12px; padding:10px; resize:vertical}
.sheet-err{color:var(--cold); font-size:12px; margin-top:8px}
.sheet-acts{display:flex; justify-content:flex-end; gap:8px; margin-top:12px}
.primary{background:var(--go); color:var(--field); border:none; border-radius:7px; padding:8px 16px; font-size:13px; font-weight:600}

@media (max-width:900px){
  .grid{grid-template-columns:1fr}
  .col.alerts{order:2} .col.board{order:1} .col.roster{order:3}
}
@media (max-width:560px){
  .prow{grid-template-columns:26px 26px 1fr; row-gap:6px}
  .padp{grid-column:2 / -1; flex-direction:row; align-items:center; gap:8px; justify-content:flex-start}
  .pacts{grid-column:1 / -1; justify-content:flex-end}
  .clock-meta{min-width:0}
}
`;
