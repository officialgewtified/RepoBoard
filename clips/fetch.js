/* Pulls one day of finished games from ESPN's public scoreboard + box scores: NFL, college football (FBS) and NBA.
   Writes <out>/nfl.json, cfb.json, nba.json (only the sports that played). Runs on GitHub (ESPN isn't reachable from everywhere).
   usage: node fetch.js <YYYY-MM-DD> <outdir> */
"use strict";
const fs = require("fs"), path = require("path");
const BASE = "https://site.api.espn.com/apis/site/v2/sports/";
const SPORTS = {
  nfl: { p: "football/nfl", q: "", kind: "fb" },
  cfb: { p: "football/college-football", q: "&groups=80", kind: "fb" },
  nba: { p: "basketball/nba", q: "", kind: "bb" }
};
async function get(url, tries = 3) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (stats recap)" } }); if (!r.ok) throw new Error(r.status + " " + url); return await r.json(); }
    catch (e) { if (i >= tries - 1) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
async function pool(items, n, f) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]).catch(e => (console.error(String(e)), null)); } })); return out; }

function team(x) {
  const t = x.team || {};
  return { ab: t.abbreviation, name: t.displayName, short: t.shortDisplayName, loc: t.location, color: t.color, alt: t.alternateColor, score: x.score,
    rank: x.curatedRank && x.curatedRank.current <= 25 ? x.curatedRank.current : null, rec: ((x.records || [])[0] || {}).summary || null,
    ls: (x.linescores || []).map(l => +l.value || 0) };
}
function players(sum, kind) {
  const out = kind === "bb" ? [] : {};
  for (const t of ((sum.boxscore || {}).players || [])) {
    const tab = t.team.abbreviation;
    for (const cat of t.statistics || []) {
      const L = cat.labels || cat.names || [];
      for (const a of cat.athletes || []) {
        if (!a.stats || !a.stats.length) continue;
        const d = {}; L.forEach((l, i) => d[l] = a.stats[i]);
        const name = a.athlete.displayName;
        if (kind === "bb") { d.n = name; d.tm = tab; out.push(d); continue; }
        if (!["passing", "rushing", "receiving"].includes(cat.name)) continue;
        const key = tab + "|" + name, p = out[key] || (out[key] = { n: name, tm: tab });
        p[cat.name] = d;
      }
    }
  }
  return kind === "bb" ? out : Object.values(out);
}
async function day(sport, ymd) {
  const S = SPORTS[sport], d = ymd.replace(/-/g, "");
  const sb = await get(`${BASE}${S.p}/scoreboard?dates=${d}&limit=300${S.q}`);
  // regular season and playoffs only (preseason games are skipped)
  const evs = (sb.events || []).filter(e => ((e.competitions[0].status || {}).type || {}).state === "post" && [2, 3].includes((e.season || {}).type || 2));
  const games = await pool(evs, 6, async ev => {
    const c = ev.competitions[0], st = c.status.type, T = {};
    for (const x of c.competitors) T[x.homeAway] = team(x);
    const sum = await get(`${BASE}${S.p}/summary?event=${ev.id}`);
    return { id: ev.id, type: (ev.season || {}).type || 2, state: st.state, detail: st.shortDetail, home: T.home, away: T.away, players: players(sum, S.kind) };
  });
  return games.filter(Boolean);
}
// is the day over? exit 0 when there were games and every one is final, 4 while any is still scheduled or live, 3 when there were none
async function check(ymd) {
  let fin = 0, left = 0;
  for (const s of Object.keys(SPORTS)) {
    const S = SPORTS[s], sb = await get(`${BASE}${S.p}/scoreboard?dates=${ymd.replace(/-/g, "")}&limit=300${S.q}`);
    for (const e of sb.events || []) { if (![2, 3].includes((e.season || {}).type || 2)) continue;
      const st = ((e.competitions[0].status || {}).type || {}).state; if (st === "post") fin++; else left++; }
  }
  console.log(`${ymd}: ${fin} final, ${left} not finished`);
  process.exit(fin + left === 0 ? 3 : left ? 4 : 0);
}
module.exports = { day, get, pool, team, players, BASE, SPORTS };
if (require.main === module && process.argv[2] === "--check") check(process.argv[3]).catch(e => { console.error(e.message); process.exit(4); });
else if (require.main === module) (async () => {
  const [ymd, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  for (const s of Object.keys(SPORTS)) {
    try { const g = await day(s, ymd); if (g.length) fs.writeFileSync(path.join(out, s + ".json"), JSON.stringify(g)); console.log(`${s}: ${g.length} finals`); }
    catch (e) { console.error(`${s}: ${e.message}`); }
  }
})();
