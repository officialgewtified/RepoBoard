/* NFL Week in Review, the long-form video: every game of the finished week (score, quarter by quarter, the story of the
   game, its stars), the week's passing/rushing/receiving leaders, top fantasy scorers, the best records in the
   league, and the NBA's best performances of the last 7 days. Writes the data weekly.html draws, the narration, the
   YouTube title, description and hashtags. Stats only: no odds, no picks.
   usage: node weekly.js out/data.json [week]        node weekly.js --check   (exit 0 = the latest week is all final) */
"use strict";
const fs = require("fs"), F = require("./fetch.js");
const NFL = F.BASE + "football/nfl/", STAND = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";
const n = v => { const x = parseFloat(String(v).replace(/,/g, "")); return isFinite(x) ? x : 0; };
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const cnt = (v, w) => v === 1 ? `a ${w}` : v === 0 ? `no ${w}s` : `${v} ${w}s`;
const r1 = x => Math.round(x * 10) / 10;
// team colour that reads on graphite (same rule as the shorts)
function lum(h) { if (!/^[0-9a-f]{6}$/i.test(h || "")) return 0; const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const hex = (h, f) => "#" + [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - f) + 255 * f).toString(16).padStart(2, "0")).join("");
const col = t => { if (lum(t.color) > .045) return "#" + t.color; if (lum(t.alt) > .045 && !/^ffffff$/i.test(t.alt)) return "#" + t.alt;
  if (!/^[0-9a-f]{6}$/i.test(t.color || "")) return "#a1a1aa"; for (let f = .1; f < .9; f += .1) { const c = hex(t.color, f); if (lum(c.slice(1)) > .06) return c; } return "#a1a1aa"; };
const nick = t => t.short || String(t.name || t.ab).split(" ").pop();
const dow = iso => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }).toUpperCase();
const md = iso => new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

// the latest week where every game is final (ESPN moves to the next week early in the week)
async function findWeek(force) {
  const sb = await F.get(NFL + "scoreboard"), season = (sb.season || {}).year, st = (sb.season || {}).type || 2;
  let wk = force || (sb.week || {}).number || 1;
  for (let i = 0; i < 3 && wk >= 1; i++, wk--) {
    const w = await F.get(`${NFL}scoreboard?dates=${season}&seasontype=${st}&week=${wk}&limit=40`), evs = w.events || [];
    if (!evs.length) continue;
    const done = evs.every(e => ((e.competitions[0].status || {}).type || {}).state === "post");
    if (done || force) return { wk, season, st, evs: evs.filter(e => e.competitions[0].status.type.state === "post"), done };
  }
  return null;
}

const ppr = p => { const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {};
  return n(a.YDS) / 25 + 4 * n(a.TD) - 2 * n(a.INT) + n(r.YDS) / 10 + 6 * n(r.TD) + n(c.YDS) / 10 + 6 * n(c.TD) + n(c.REC); };
function main(p) {   // the category that made the player's day
  const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {};
  const s = { pass: n(a.YDS) / 25 + 4 * n(a.TD), rush: n(r.YDS) / 10 + 6 * n(r.TD), rec: n(c.YDS) / 10 + 6 * n(c.TD) + n(c.REC) };
  return Object.keys(s).sort((x, y) => s[y] - s[x])[0];
}
function statLine(p) {
  const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {}, m = main(p);
  if (m === "pass") return { txt: `${a["C/ATT"] || ""} · ${n(a.YDS)} yds · ${n(a.TD)} TD${n(a.INT) ? ` · ${n(a.INT)} INT` : ""}`,
    say: `${p.n} threw for ${n(a.YDS)} yards and ${cnt(n(a.TD), "touchdown")}${n(a.INT) === 0 && n(a.TD) >= 2 ? " without an interception" : n(a.INT) >= 2 ? `, but threw ${n(a.INT)} interceptions` : ""}.` };
  if (m === "rush") return { txt: `${n(r.CAR)} car · ${n(r.YDS)} yds · ${n(r.TD)} TD`, say: `${p.n} ran for ${n(r.YDS)} yards${n(r.TD) ? " and " + cnt(n(r.TD), "touchdown") : ""}.` };
  return { txt: `${n(c.REC)} rec · ${n(c.YDS)} yds · ${n(c.TD)} TD`, say: `${p.n} caught ${n(c.REC)} passes for ${n(c.YDS)} yards${n(c.TD) ? " and " + cnt(n(c.TD), "touchdown") : ""}.` };
}

function story(g) {
  const hs = n(g.home.score), as = n(g.away.score), W = hs > as ? g.home : g.away, L = W === g.home ? g.away : g.home;
  const ws = Math.max(hs, as), ls = Math.min(hs, as), m = ws - ls, ot = /OT/.test(g.detail || "");
  const after3 = t => (t.ls || []).slice(0, 3).reduce((s, x) => s + x, 0), deficit = (W.ls || []).length >= 3 ? after3(L) - after3(W) : 0;
  const venue = W === g.home ? "at home" : "on the road";
  if (hs === as) return { tag: "Tie", head: `${g.away.nick} and ${g.home.nick} tie`, say: `The ${g.away.nick} and the ${g.home.nick} played to a ${hs} to ${as} tie.`, W, L };
  if (deficit >= 7) return { tag: "Comeback", head: `${W.nick} rally past ${L.nick}`, say: `The ${W.nick} trailed by ${deficit} going into the fourth quarter, and came back to beat the ${L.nick}, ${ws} to ${ls}!`, W, L };
  if (ot) return { tag: "Overtime", head: `${W.nick} win it in OT`, say: `The ${W.nick} beat the ${L.nick} in overtime, ${ws} to ${ls}!`, W, L };
  if (m >= 21) return { tag: "Blowout", head: `${W.nick} roll ${L.nick}`, say: `The ${W.nick} rolled past the ${L.nick} ${venue}, ${ws} to ${ls}.`, W, L };
  if (m <= 3) return { tag: "Nail-biter", head: `${W.nick} edge ${L.nick}`, say: `A nail-biter! The ${W.nick} held off the ${L.nick}, ${ws} to ${ls}.`, W, L };
  return { tag: "Final", head: `${W.nick} beat ${L.nick}`, say: `The ${W.nick} beat the ${L.nick} ${venue}, ${ws} to ${ls}.`, W, L };
}

async function standings() {
  try {
    const d = await F.get(STAND), rows = [];
    const walk = o => { for (const c of o.children || []) walk(c); for (const e of ((o.standings || {}).entries || [])) {
      const S = {}; for (const s of e.stats || []) S[s.name] = s.value; const t = e.team || {};
      rows.push({ ab: t.abbreviation, nick: t.shortDisplayName || t.name, w: S.wins || 0, l: S.losses || 0, t: S.ties || 0, pct: S.winPercent || 0,
        color: col({ color: t.color, alt: t.alternateColor }) }); } };
    walk(d);
    return rows.sort((a, b) => b.pct - a.pct || b.w - a.w).slice(0, 8).map(r => ({ ...r, rec: `${r.w}-${r.l}${r.t ? "-" + r.t : ""}` }));
  } catch (e) { console.error("standings:", e.message); return []; }
}

async function nbaWeek(endIso) {
  const out = [], end = new Date(endIso);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(end); d.setUTCDate(d.getUTCDate() - i + 1); const ymd = d.toISOString().slice(0, 10);
    try { for (const g of await F.day("nba", ymd)) for (const p of g.players) if (p.PTS != null && n(p.MIN) > 0) {
      const home = g.home.ab === p.tm, op = home ? g.away : g.home;
      out.push({ name: p.n, tm: p.tm, color: col(home ? g.home : g.away), pts: n(p.PTS), reb: n(p.REB), ast: n(p.AST), stl: n(p.STL), blk: n(p.BLK),
        opp: nick(op), date: md(ymd + "T17:00:00Z"), sc: n(p.PTS) + 1.2 * n(p.REB) + 1.5 * n(p.AST) + 2 * n(p.STL) + 2 * n(p.BLK) }); } }
    catch (e) { console.error("nba", ymd, e.message); }
  }
  const seen = new Set();
  return out.sort((a, b) => b.sc - a.sc).filter(p => !seen.has(p.name) && seen.add(p.name)).slice(0, 5);
}

async function build(force, brand) {
  const W = await findWeek(force);
  if (!W || !W.evs.length) return null;
  const games = (await F.pool(W.evs, 6, async ev => {
    const c = ev.competitions[0], T = {};
    for (const x of c.competitors) T[x.homeAway] = F.team(x);
    const sum = await F.get(`${NFL}summary?event=${ev.id}`);
    return { id: ev.id, date: ev.date, detail: c.status.type.shortDetail, away: T.away, home: T.home, players: F.players(sum, "fb") };
  })).filter(Boolean).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const std = await standings();
  const lastDay = new Date(games[games.length - 1].date), nba = await nbaWeek(new Date(lastDay.getTime() - 5 * 36e5).toISOString().slice(0, 10));
  return assemble(W.wk, W.season, games, std, nba, brand);
}

// everything after the downloads (separate so it can be tested offline)
function assemble(wk, season, games, std, nba, brand) {
  const all = games.flatMap(g => g.players.map(p => Object.assign({ g }, p)));
  for (const g of games) for (const t of [g.away, g.home]) { t.nick = nick(t); t.color = col(t); }

  const voice = {}, scenes = [];
  // hook: the rarest stat line of the week
  const hooks = [];
  for (const p of all) { const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {};
    hooks.push([n(a.YDS) / 360, n(a.YDS), "passing yards", p], [n(a.TD) / 3.4, n(a.TD), "touchdown passes", p], [n(r.YDS) / 140, n(r.YDS), "rushing yards", p],
      [n(r.TD) / 2.4, n(r.TD), "rushing touchdowns", p], [n(c.YDS) / 150, n(c.YDS), "receiving yards", p], [n(c.REC) / 12, n(c.REC), "catches", p]); }
  const h = hooks.sort((a, b) => b[0] - a[0])[0], hp = h[3], hteam = hp.g.home.ab === hp.tm ? hp.g.home : hp.g.away;
  voice.hook = `${h[1]} ${h[2]}! ${hp.n} had the biggest day of Week ${wk}. Here's every game, every star, and every number you need from Week ${wk} in the NFL!`;
  scenes.push({ kind: "hook", id: "hook", chapter: "Intro", big: String(h[1]), label: h[2], who: hp.n, tm: hp.tm, color: hteam.color, line: statLine(hp).txt });

  games.forEach((g, i) => {
    const st = story(g), stars = g.players.slice().sort((a, b) => ppr(b) - ppr(a)).slice(0, 3);
    const lines = stars.map(p => ({ name: p.n, tm: p.tm, color: (g.home.ab === p.tm ? g.home : g.away).color, line: statLine(p).txt }));
    const rs = r => { const [w, l, t] = r.split("-"); return t && +t ? `${w}, ${l} and ${t}` : `${w} and ${l}`; };
    const rec = st.W.rec && st.L.rec ? ` The ${st.W.nick} move to ${rs(st.W.rec)}, and the ${st.L.nick} fall to ${rs(st.L.rec)}.` : "";
    voice["g" + i] = `${st.say} ${stars.slice(0, 2).map(p => statLine(p).say).join(" ")}${rec}`;
    scenes.push({ kind: "game", id: "g" + i, chapter: `${g.away.nick} ${g.away.score}, ${g.home.nick} ${g.home.score}`, tag: st.tag, head: st.head, day: dow(g.date), date: md(g.date),
      away: g.away, home: g.home, ot: /OT/.test(g.detail || ""), stars: lines, winner: st.W.ab });
  });

  // the week's leaders
  const L = (k, f, lab, fmt) => all.filter(p => p[k]).map(p => [f(p[k]), p]).sort((a, b) => b[0] - a[0]).slice(0, 5)
    .map(([v, p]) => ({ name: p.n, tm: p.tm, color: (p.g.home.ab === p.tm ? p.g.home : p.g.away).color, v, sub: fmt(p[k]) }));
  const boards = [
    ["Passing yards", L("passing", s => n(s.YDS), "", s => `${s["C/ATT"]} · ${n(s.TD)} TD · ${n(s.INT)} INT`), "passer", "yards"],
    ["Rushing yards", L("rushing", s => n(s.YDS), "", s => `${n(s.CAR)} car · ${n(s.TD)} TD`), "rusher", "yards"],
    ["Receiving yards", L("receiving", s => n(s.YDS), "", s => `${n(s.REC)} rec · ${n(s.TD)} TD`), "receiver", "yards"]];
  boards.forEach(([title, rows, who, unit], i) => {
    if (!rows.length) return;
    voice["l" + i] = `The week's top ${who} was ${rows[0].name}, with ${rows[0].v} ${unit}. ${rows[1] ? `${rows[1].name} was next with ${rows[1].v}` : ""}${rows[2] ? `, followed by ${rows[2].name} with ${rows[2].v}.` : "."}`;
    scenes.push({ kind: "board", id: "l" + i, chapter: `${title} leaders`, title, unit: "YDS", rows });
  });
  // fantasy (full PPR)
  const fan = all.slice().sort((a, b) => ppr(b) - ppr(a)).slice(0, 5).map(p => ({ name: p.n, tm: p.tm, color: (p.g.home.ab === p.tm ? p.g.home : p.g.away).color, v: r1(ppr(p)), sub: statLine(p).txt }));
  voice.fan = `In fantasy football, ${fan[0].name} led everyone with ${fan[0].v} points in PPR leagues, ahead of ${fan[1].name} with ${fan[1].v}, and ${fan[2].name} with ${fan[2].v}.`;
  scenes.push({ kind: "board", id: "fan", chapter: "Fantasy top 5", title: "Fantasy points (PPR)", unit: "PTS", rows: fan });
  // best records
  if (std.length >= 4) {
    voice.std = `After Week ${wk}, the ${std[0].nick} have the best record in the league at ${std[0].rec.split("-").filter((x, i) => i < 2 || +x).join(" and ")}. ${std[1].nick}, ${std[2].nick} and ${std[3].nick} are right behind them.`;
    scenes.push({ kind: "standings", id: "std", chapter: "Best records", rows: std });
  }
  // around the NBA
  if (nba.length >= 3) {
    const line = p => `${p.pts} points, ${p.reb} rebounds and ${p.ast} assists against the ${p.opp}`;
    voice.nba = `Around the NBA this week, ${nba[0].name} had the biggest night, with ${line(nba[0])}. ${nba[1].name} had ${line(nba[1])}, and ${nba[2].name} had ${line(nba[2])}.`;
    scenes.push({ kind: "board", id: "nba", chapter: "Around the NBA", title: "NBA: best games this week", unit: "PTS", rows: nba.map(p => ({ name: p.name, tm: p.tm, color: p.color, v: p.pts, sub: `${p.reb} reb · ${p.ast} ast · vs ${p.opp} · ${p.date}` })) });
  }
  voice.outro = `That's Week ${wk}! Subscribe to ${brand} for daily stats, and we'll see you next week!`;
  scenes.push({ kind: "outro", id: "outro", chapter: "Outro" });

  const range = `${md(games[0].date)} – ${md(games[games.length - 1].date)}`;
  const title = `NFL Week ${wk} Recap: Every Game, Top Performers & Stat Leaders`;
  const desc = [`${hp.n}: ${h[1]} ${h[2]} 🔥 Every game from NFL Week ${wk} (${range}), the week's top performers, stat leaders, fantasy top 5, and the best records in the league.`, "",
    "CHAPTERS", "{{chapters}}", "", "New stat recaps every day. Subscribe for next week's recap!", "",
    `#NFL #NFLWeek${wk} #FantasyFootball #NFLHighlights #${hp.n.replace(/[^A-Za-z0-9]/g, "")} #Crossover`].join("\n");
  return { mode: "weekly", template: "weekly.html", w: 1920, h: 1080, brand, day: games[games.length - 1].date.slice(0, 10), week: wk, season, range,
    title: `NFL Week ${wk} Recap`, ytTitle: title, description: desc, source: "Stats: ESPN box scores", scenes, voice };
}

module.exports = { assemble };
if (require.main === module) (async () => {
  // ready = the latest finished week ended in the last 3 days (so a half-played week never makes last week's video again)
  if (process.argv[2] === "--check") { const W = await findWeek(); const last = W ? Math.max(...W.evs.map(e => Date.parse(e.date))) : 0;
    const ok = W && W.done && Date.now() - last < 72 * 36e5; console.log(W ? `week ${W.wk}: ${W.done ? "final" : "in progress"}, last game ${new Date(last).toISOString()}` : "no week"); process.exit(ok ? 0 : 4); }
  const out = process.argv[2], force = +process.argv[3] || 0;
  const D = await build(force, process.env.BRAND || "Crossover");
  if (!D) { console.log("No finished week found."); process.exit(3); }
  for (const [k, v] of Object.entries(D.voice)) console.log(k, "|", v);
  fs.writeFileSync(out, JSON.stringify(D, null, 1));
  console.log(`Week ${D.week}: ${D.scenes.length} scenes`);
})().catch(e => { console.error(e); process.exit(1); });
