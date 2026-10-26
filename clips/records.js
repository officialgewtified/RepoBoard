/* Season bests, so a video can say "the most points by anyone this season". Keeps the top 25 single-game marks per
   stat for the current NFL and NBA regular seasons in records.json. The first run of a season fills in every game
   so far, and re-running a day replaces that day's marks instead of counting them twice.
   usage: node records.js <YYYY-MM-DD> <outdir with today's nfl.json / nba.json> */
"use strict";
const fs = require("fs"), path = require("path"), { day: fetchDay } = require("./fetch.js");
const FILE = path.join(__dirname, "records.json"), KEEP = 25;
const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const STATS = {
  NBA: { PTS: p => n(p.PTS), REB: p => n(p.REB), AST: p => n(p.AST), BLK: p => n(p.BLK), STL: p => n(p.STL), "3PM": p => n(String(p["3PT"] || "0").split("-")[0]) },
  NFL: { passYds: p => n((p.passing || {}).YDS), passTD: p => n((p.passing || {}).TD), rushYds: p => n((p.rushing || {}).YDS), rushTD: p => n((p.rushing || {}).TD),
    recYds: p => n((p.receiving || {}).YDS), rec: p => n((p.receiving || {}).REC) }
};
const season = (sport, ymd) => { const [y, m] = ymd.split("-").map(Number);
  return sport === "NBA" ? (m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`) : String(m >= 3 ? y : y - 1); };
const start = (sport, ymd) => { const s = season(sport, ymd); return sport === "NBA" ? `${s.slice(0, 4)}-10-01` : `${s}-09-01`; };
const days = (a, b) => { const out = []; for (let d = new Date(a + "T12:00:00Z"); d.toISOString().slice(0, 10) <= b; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)); return out; };
const prev = ymd => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

function merge(R, sport, ymd, games) {
  const S = R[sport];
  for (const k of Object.keys(STATS[sport])) S.top[k] = (S.top[k] || []).filter(e => e[3] !== ymd);
  for (const g of games || []) {
    if (g.state !== "post" || (g.type && g.type !== 2)) continue;   // regular season only
    for (const p of g.players) for (const [k, f] of Object.entries(STATS[sport])) { const v = f(p); if (v > 0) S.top[k].push([v, p.n, p.tm, ymd]); }
  }
  for (const k of Object.keys(STATS[sport])) S.top[k] = S.top[k].sort((a, b) => b[0] - a[0] || a[3].localeCompare(b[3])).slice(0, KEEP);
  // game days counted so far: "most this season" means little on opening night
  if ((games || []).some(g => g.state === "post" && (!g.type || g.type === 2))) S.dates = [...new Set([...(S.dates || []), ymd])].sort();
  if (!S.upTo || ymd > S.upTo) S.upTo = ymd;
}

module.exports = { season, STATS };
if (require.main === module) (async () => {
  const [ymd, out] = process.argv.slice(2);
  let R = {}; try { R = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { }
  for (const sport of ["NFL", "NBA"]) {
    const key = season(sport, ymd), file = path.join(out, sport.toLowerCase() + ".json");
    if (!R[sport] || R[sport].season !== key) {
      // new season (or first run): fill in every day from the start of the season up to yesterday
      R[sport] = { season: key, top: {}, dates: [], upTo: null };
      const D = days(start(sport, ymd), prev(ymd));
      let found = 0;
      for (const d of D) { try { const g = await fetchDay(sport.toLowerCase(), d); if (g.length) { merge(R, sport, d, g); found += g.length; } } catch (e) { console.error(sport, d, e.message); } }
      console.log(`${sport} ${key}: filled in ${found} games from ${D[0]} to ${D[D.length - 1]}`);
    }
    if (fs.existsSync(file)) { merge(R, sport, ymd, JSON.parse(fs.readFileSync(file, "utf8"))); console.log(`${sport}: added ${ymd}`); }
  }
  fs.writeFileSync(FILE, JSON.stringify(R));
})();
