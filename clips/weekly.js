/* NFL Week in Review, the long-form video (8+ minutes, moves fast): every final score in quick grids, the games
   everyone's talking about, the week by the numbers, the passing/rushing/receiving leaders on a football field, the
   defense, the player of the week, fantasy, the best records, the NBA's best games on a shot chart, and next week's
   schedule with the matchups to watch. Writes the data weekly.html draws, the narration, the YouTube title,
   description and hashtags. Stats only: no odds, no picks.
   usage: node weekly.js out/data.json [week]        node weekly.js --check   (exit 0 = the latest week is all final) */
"use strict";
const fs = require("fs"), F = require("./fetch.js");
const NFL = F.BASE + "football/nfl/", STAND = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";
const n = v => { const x = parseFloat(String(v).replace(/,/g, "")); return isFinite(x) ? x : 0; };
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen"];
const W_ = v => WORDS[v] || String(v);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const cnt = (v, w) => v === 1 ? `a ${w}` : v === 0 ? `no ${w}s` : `${v} ${w}s`;
const r1 = x => Math.round(x * 10) / 10;
// team colour that reads on graphite (same rule as the shorts)
function lum(h) { if (!/^[0-9a-f]{6}$/i.test(h || "")) return 0; const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const hex = (h, f) => "#" + [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - f) + 255 * f).toString(16).padStart(2, "0")).join("");
const col = t => { if (lum(t.color) > .045) return "#" + t.color; if (lum(t.alt) > .045 && !/^ffffff$/i.test(t.alt)) return "#" + t.alt;
  if (!/^[0-9a-f]{6}$/i.test(t.color || "")) return "#a1a1aa"; for (let f = .1; f < .9; f += .1) { const c = hex(t.color, f); if (lum(c.slice(1)) > .06) return c; } return "#a1a1aa"; };
const nick = t => t.short || String(t.name || t.ab).split(" ").pop();
const ET = (iso, o) => new Date(iso).toLocaleString("en-US", Object.assign({ timeZone: "America/New_York" }, o));
const dow = iso => ET(iso, { weekday: "short" }).toUpperCase();
const md = iso => ET(iso, { month: "short", day: "numeric" });
const tme = iso => ET(iso, { hour: "numeric", minute: "2-digit" }).replace(":00", "");
// stable "random" choice so the same week reads the same, but different games read differently
const pick = (arr, key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };

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
const CAT = { pass: "passing", rush: "rushing", rec: "receiving" };
const fieldViz = (p, k) => { k = k || main(p); const s = p[CAT[k]] || {}; return { t: "field", k, yds: n(s.YDS), td: n(s.TD) }; };
function statLine(p) {
  const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {}, m = main(p);
  if (m === "pass") return { txt: `${a["C/ATT"] || ""} · ${n(a.YDS)} yds · ${n(a.TD)} TD${n(a.INT) ? ` · ${n(a.INT)} INT` : ""}`,
    say: `${p.n} threw for ${n(a.YDS)} yards and ${cnt(n(a.TD), "touchdown")}${n(a.INT) === 0 && n(a.TD) >= 2 ? " without an interception" : n(a.INT) >= 2 ? `, but threw ${n(a.INT)} interceptions` : ""}.` };
  if (m === "rush") return { txt: `${n(r.CAR)} car · ${n(r.YDS)} yds · ${n(r.TD)} TD`, say: `${p.n} ran for ${n(r.YDS)} yards${n(r.TD) ? " and " + cnt(n(r.TD), "touchdown") : ""}.` };
  return { txt: `${n(c.REC)} rec · ${n(c.YDS)} yds · ${n(c.TD)} TD`, say: `${p.n} caught ${n(c.REC)} passes for ${n(c.YDS)} yards${n(c.TD) ? " and " + cnt(n(c.TD), "touchdown") : ""}.` };
}
const rs = r => { const [w, l, t] = String(r || "").split("-"); return t && +t ? `${w}, ${l} and ${t}` : `${w} and ${l}`; };
const pctOf = r => { const [w, l, t] = String(r || "0-0").split("-").map(Number); const g = w + l + (t || 0); return g ? (w + (t || 0) / 2) / g : .5; };

function story(g) {
  const hs = n(g.home.score), as = n(g.away.score), W = hs > as ? g.home : g.away, L = W === g.home ? g.away : g.home;
  const ws = Math.max(hs, as), ls = Math.min(hs, as), m = ws - ls, ot = /OT/.test(g.detail || "");
  const after3 = t => (t.ls || []).slice(0, 3).reduce((s, x) => s + x, 0), deficit = (W.ls || []).length >= 3 ? after3(L) - after3(W) : 0;
  const venue = W === g.home ? "at home" : "on the road";
  // pre-game records: take this game back out
  const pre = (t, won) => { const [w, l, tt] = String(t.rec || "").split("-").map(Number); return isFinite(w) ? pctOf(`${won ? w - 1 : w}-${won ? l : l - 1}-${tt || 0}`) : .5; };
  const upset = pre(L, false) - pre(W, true) >= .3 && pre(L, false) >= .5 && (String(L.rec || "").split("-").map(Number).reduce((a, b) => a + (b || 0), 0) >= 4);
  if (hs === as) return { tag: "Tie", head: `${g.away.nick} and ${g.home.nick} tie`, say: `The ${g.away.nick} and the ${g.home.nick} played to a ${hs} to ${as} tie.`, W, L, ws, ls, m, pri: 2 };
  if (deficit >= 7) return { tag: "Comeback", head: `${W.nick} rally past ${L.nick}`, say: `The ${W.nick} trailed by ${deficit} going into the fourth quarter, and came all the way back to beat the ${L.nick}, ${ws} to ${ls}!`, W, L, ws, ls, m, pri: 1 };
  if (ot) return { tag: "Overtime", head: `${W.nick} win it in OT`, say: `This one needed overtime! The ${W.nick} beat the ${L.nick}, ${ws} to ${ls}.`, W, L, ws, ls, m, pri: 1 };
  if (upset) return { tag: "Upset", head: `${W.nick} stun ${L.nick}`, say: `Upset alert! The ${W.nick} took down the ${L.nick} ${venue}, ${ws} to ${ls}.`, W, L, ws, ls, m, pri: 2 };
  if (m <= 3) return { tag: "Nail-biter", head: `${W.nick} edge ${L.nick}`, say: `A nail-biter! The ${W.nick} held off the ${L.nick}, ${ws} to ${ls}.`, W, L, ws, ls, m, pri: 3 };
  if (ws + ls >= 60) return { tag: "Shootout", head: `${W.nick} win a shootout`, say: `A shootout! The ${W.nick} outscored the ${L.nick}, ${ws} to ${ls}.`, W, L, ws, ls, m, pri: 3 };
  if (m >= 21) return { tag: "Blowout", head: `${W.nick} roll ${L.nick}`, say: `The ${W.nick} rolled past the ${L.nick} ${venue}, ${ws} to ${ls}.`, W, L, ws, ls, m, pri: 4 };
  return { tag: "Final", head: `${W.nick} beat ${L.nick}`, say: `The ${W.nick} beat the ${L.nick} ${venue}, ${ws} to ${ls}.`, W, L, ws, ls, m, pri: 5 };
}
// one quick sentence per final, for the score grids, with who carried the winner
const STAR_SAY = p => { const k = main(p), s = p[CAT[k]] || {}; return `${n(s.YDS)} ${{ pass: "passing", rush: "rushing", rec: "receiving" }[k]} yards from ${p.n}`; };
function scoreSay(g) { const s = scoreSay0(g), st = story(g), star = g.players.filter(p => p.tm === st.W.ab).sort((a, b) => ppr(b) - ppr(a))[0];
  return st.tag !== "Tie" && star && ppr(star) >= 15 ? s.replace(/\.$/, `, behind ${STAR_SAY(star)}.`) : s; }
function scoreSay0(g) {
  const st = story(g), { W, L, ws, ls, m } = st;
  if (st.tag === "Tie") return `The ${g.away.nick} and the ${g.home.nick} tied at ${ws}.`;
  if (/OT/.test(g.detail || "")) return `The ${W.nick} beat the ${L.nick} in overtime, ${ws} to ${ls}.`;
  if (m >= 21) return `${pick(["The ${W} crushed the ${L}", "The ${W} rolled the ${L}", "The ${W} blew out the ${L}"], g.id)}, ${ws} to ${ls}.`.replace("${W}", W.nick).replace("${L}", L.nick);
  if (m <= 3) return `${pick(["The ${W} edged the ${L}", "The ${W} squeaked past the ${L}", "The ${W} held off the ${L}"], g.id)}, ${ws} to ${ls}.`.replace("${W}", W.nick).replace("${L}", L.nick);
  return `${pick(["The ${W} beat the ${L}", "The ${W} took down the ${L}", "The ${W} handled the ${L}", "The ${W} got past the ${L}"], g.id)}, ${ws} to ${ls}.`.replace("${W}", W.nick).replace("${L}", L.nick);
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
      const home = g.home.ab === p.tm, me = home ? g.home : g.away, op = home ? g.away : g.home, won = n(me.score) > n(op.score);
      out.push({ name: p.n, tm: p.tm, color: col(me), pts: n(p.PTS), reb: n(p.REB), ast: n(p.AST), stl: n(p.STL), blk: n(p.BLK), fg: p.FG, tp: p["3PT"], ft: p.FT,
        shots: p.shots || [], opp: nick(op), won, score: `${won ? "W" : "L"} ${Math.max(n(me.score), n(op.score))}-${Math.min(n(me.score), n(op.score))}`,
        date: md(ymd + "T17:00:00Z"), sc: n(p.PTS) + 1.2 * n(p.REB) + 1.5 * n(p.AST) + 2 * n(p.STL) + 2 * n(p.BLK) }); } }
    catch (e) { console.error("nba", ymd, e.message); }
  }
  const seen = new Set();
  return out.sort((a, b) => b.sc - a.sc).filter(p => !seen.has(p.name) && seen.add(p.name)).slice(0, 6);
}

// next week's schedule: kickoff, TV, records, and each team's season leaders when ESPN lists them
async function nextWeek(W) {
  try {
    const d = await F.get(`${NFL}scoreboard?dates=${W.season}&seasontype=${W.st}&week=${W.wk + 1}&limit=40`);
    return (d.events || []).map(ev => {
      const c = ev.competitions[0], T = {};
      for (const x of c.competitors) { const t = F.team(x); t.nick = nick(t); t.color = col(t); t.lead = {};
        for (const L of x.leaders || []) { const a = (L.leaders || [])[0]; if (a && a.athlete) t.lead[L.name] = { n: a.athlete.displayName || a.athlete.fullName, v: a.displayValue || "" }; }
        T[x.homeAway] = t; }
      for (const L of c.leaders || []) { const a = (L.leaders || [])[0]; if (!a || !a.athlete) continue; const tid = String((a.team || a.athlete.team || {}).id || "");
        for (const x of c.competitors) if (String(x.team.id) === tid && !T[x.homeAway].lead[L.name]) T[x.homeAway].lead[L.name] = { n: a.athlete.displayName || a.athlete.fullName, v: a.displayValue || "" }; }
      return { id: ev.id, date: ev.date, away: T.away, home: T.home, tv: [...new Set((c.broadcasts || []).flatMap(b => b.names || []))].join(" / ") };
    }).filter(g => g.away && g.home).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  } catch (e) { console.error("next week:", e.message); return []; }
}

async function build(force, brand) {
  const W = await findWeek(force);
  if (!W || !W.evs.length) return null;
  const games = (await F.pool(W.evs, 6, async ev => {
    const c = ev.competitions[0], T = {};
    for (const x of c.competitors) T[x.homeAway] = F.team(x);
    const sum = await F.get(`${NFL}summary?event=${ev.id}`), ts = F.teamStats(sum);
    for (const k of ["away", "home"]) Object.assign(T[k], ts[T[k].ab] || {});
    return { id: ev.id, date: ev.date, detail: c.status.type.shortDetail, away: T.away, home: T.home, players: F.players(sum, "fb", true) };
  })).filter(Boolean).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const std = await standings(), next = await nextWeek(W);
  const lastDay = new Date(games[games.length - 1].date), nba = await nbaWeek(new Date(lastDay.getTime() - 5 * 36e5).toISOString().slice(0, 10));
  if (process.env.RAW) fs.writeFileSync(process.env.RAW, JSON.stringify({ wk: W.wk, season: W.season, games, std, nba, next }));   // for testing the layout offline
  return assemble(W.wk, W.season, games, std, nba, brand, next);
}

// everything after the downloads (separate so it can be tested offline)
function assemble(wk, season, games, std, nba, brand, next) {
  next = next || [];
  for (const g of games) for (const t of [g.away, g.home]) { t.nick = nick(t); t.bg = /^[0-9a-f]{6}$/i.test(t.color || "") ? "#" + t.color : null; t.color = col(t); }
  const all = games.flatMap(g => g.players.map(p => Object.assign({ g }, p)));
  const tcol = p => (p.g.home.ab === p.tm ? p.g.home : p.g.away).color;
  const voice = {}, scenes = [];
  const scene = (s, v) => { scenes.push(s); voice[s.id] = v; };

  // ---- hook: the biggest stat line of the week (and the player of the week)
  const hooks = [];
  for (const p of all) { const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {};
    hooks.push([n(a.YDS) / 360, n(a.YDS), "passing yards", p, "pass"], [n(a.TD) / 3.4, n(a.TD), "touchdown passes", p, "pass"], [n(r.YDS) / 140, n(r.YDS), "rushing yards", p, "rush"],
      [n(r.TD) / 2.4, n(r.TD), "rushing touchdowns", p, "rush"], [n(c.YDS) / 150, n(c.YDS), "receiving yards", p, "rec"], [n(c.REC) / 12, n(c.REC), "catches", p, "rec"]); }
  const h = hooks.sort((a, b) => b[0] - a[0])[0], hp = h[3], hteam = hp.g.home.ab === hp.tm ? hp.g.home : hp.g.away;
  const nx = next.length ? ` and the matchups you can't miss in Week ${wk + 1}` : "";
  scene({ kind: "hook", id: "hook", chapter: "Intro", big: String(h[1]), label: h[2], who: hp.n, tm: hp.tm, color: hteam.color, bg: hteam.bg, line: statLine(hp).txt, viz: fieldViz(hp, h[4]) },
    `${h[1]} ${h[2]}! ${hp.n} just had the biggest day of Week ${wk}. We've got every score, the games everyone is talking about, our player of the week,${nx ? "" : " and"} the stat leaders${nx}. Let's go!`);

  // ---- every final, in quick grids
  const per = games.length <= 8 ? games.length : games.length <= 16 ? Math.ceil(games.length / 2) : Math.ceil(games.length / 3);
  for (let i = 0, k = 0; i < games.length; i += per, k++) {
    const G = games.slice(i, i + per);
    const intro = k === 0 ? `Let's run through every final from Week ${wk}.` : pick(["Here's the rest of the week.", "And the rest of the scoreboard.", "Here's the rest."], wk + "r" + k);
    scene({ kind: "finals", id: "f" + k, chapter: k === 0 ? `Every Week ${wk} score` : undefined, part: k, games: G.map(g => ({ away: g.away, home: g.home, ot: /OT/.test(g.detail || ""), day: dow(g.date) })) },
      `${intro} ${G.map(scoreSay).join(" ")}`);
  }

  // ---- the games everyone's talking about (comebacks, overtime, upsets, close ones, shootouts, then the best star power)
  const S = games.map(g => ({ g, st: story(g), power: g.players.map(ppr).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) }));
  const want = Math.min(games.length, games.length >= 12 ? 6 : 5);
  let ups = 0; const chosen = S.filter(x => x.st.pri <= 3).sort((a, b) => a.st.pri - b.st.pri || b.power - a.power).filter(x => x.st.tag !== "Upset" || ++ups <= 2).slice(0, want);
  const bl = S.filter(x => x.st.tag === "Blowout" && !chosen.includes(x)).sort((a, b) => b.st.m - a.st.m)[0]; if (bl && chosen.length < want) chosen.push(bl);
  for (const x of S.slice().sort((a, b) => b.power - a.power)) if (chosen.length < want && !chosen.includes(x)) chosen.push(x);
  chosen.sort((a, b) => Date.parse(a.g.date) - Date.parse(b.g.date)).forEach((x, i) => {
    const { g, st } = x, stars = g.players.slice().sort((a, b) => ppr(b) - ppr(a)).slice(0, 3);
    const lines = stars.map(p => ({ name: p.n, tm: p.tm, color: (g.home.ab === p.tm ? g.home : g.away).color, line: statLine(p).txt }));
    const rec = st.W.rec && st.L.rec ? ` The ${st.W.nick} move to ${rs(st.W.rec)}, and the ${st.L.nick} fall to ${rs(st.L.rec)}.` : "";
    const lead = i === 0 ? "Now, the games everyone is talking about. " : "";
    const q = t => t.ls || [], h1 = t => q(t).slice(0, 2).reduce((a, b) => a + b, 0), q4w = q(st.W)[3], q4l = q(st.L)[3];
    const flow = /Comeback|Overtime|Nail-biter/.test(st.tag) && q4w != null && q4w > q4l ? ` The ${st.W.nick} won the fourth quarter, ${q4w} to ${q4l}.`
      : q(st.W).length >= 2 ? (h1(st.W) === h1(st.L) ? ` It was tied at ${h1(st.W)} at the half.` : ` It was ${Math.max(h1(st.W), h1(st.L))} to ${Math.min(h1(st.W), h1(st.L))}, ${h1(st.W) > h1(st.L) ? st.W.nick : st.L.nick}, at the half.`) : "";
    scene({ kind: "game", id: "g" + i, chapter: i === 0 ? "Games of the week" : undefined, tag: st.tag, head: st.head, day: dow(g.date), date: md(g.date),
      away: g.away, home: g.home, ot: /OT/.test(g.detail || ""), stars: lines, winner: st.W.ab, viz: fieldViz(stars[0]), vizWho: stars[0].n, vizTm: stars[0].tm },
      `${lead}${st.say}${flow} ${stars.slice(0, 2).map(p => statLine(p).say).join(" ")}${rec}`);
  });

  // ---- the week by the numbers
  const pts = games.reduce((s, g) => s + n(g.away.score) + n(g.home.score), 0);
  const oneScore = games.filter(g => Math.abs(n(g.away.score) - n(g.home.score)) <= 8).length, ots = games.filter(g => /OT/.test(g.detail || "")).length;
  let long = null; for (const p of all) for (const [k, w] of [["rushing", "run"], ["receiving", "catch"]]) if (p[k] && (!long || n(p[k].LONG) > long.v)) long = { v: n(p[k].LONG), w, p };
  const topT = games.flatMap(g => [g.away, g.home]).sort((a, b) => n(b.score) - n(a.score))[0];
  const tiles = [[pts, "Points scored", `${games.length} games`], [oneScore, "One-score games", ots ? `${ots} in overtime` : "decided by 8 or less"]];
  if (long && long.v) tiles.push([long.v, `Longest ${long.w}`, long.p.n]);
  tiles.push([n(topT.score), "Most by a team", topT.nick]);
  scene({ kind: "numbers", id: "num", chapter: "By the numbers", tiles: tiles.map(([v, l, s]) => ({ v, l, s })) },
    `Week ${wk} by the numbers. ${pts} points were scored across ${games.length} games. ${cap(W_(oneScore))} of them were one-score games${ots ? `, and ${ots === 1 ? "one" : W_(ots)} went to overtime` : ""}.` +
    `${long && long.v ? ` The longest play of the week was a ${long.v} yard ${long.w} by ${long.p.n}.` : ""} And the ${topT.nick} put up the most points, with ${n(topT.score)}.`);

  // ---- offense and defense of the week (team box score totals)
  const T = games.flatMap(g => [[g.away, g.home], [g.home, g.away]]).filter(([t]) => t.yds).map(([t, o]) => ({ t, o, yds: n(t.yds), allowed: n(o.yds), take: n(o.to), pa: n(o.score) }));
  if (T.length >= 4) {
    const off = T.slice().sort((x, y) => y.yds - x.yds)[0], dfn = T.slice().sort((x, y) => x.allowed - y.allowed || x.pa - y.pa)[0], tk = T.slice().sort((x, y) => y.take - x.take)[0];
    const big = games.map(g => { const st = story(g); return { st }; }).sort((x, y) => y.st.m - x.st.m)[0].st;
    const tiles = [{ v: off.yds, l: "Total yards", s: `${off.t.nick} vs ${off.o.nick}` }, { v: dfn.allowed, l: "Yards allowed", s: `${dfn.t.nick} defense` }];
    if (tk.take >= 2) tiles.push({ v: tk.take, l: "Takeaways", s: `${tk.t.nick} vs ${tk.o.nick}` });
    tiles.push({ v: big.m, l: "Biggest win", s: `${big.W.nick} over ${big.L.nick}` });
    scene({ kind: "numbers", id: "tm", chapter: "Offense & defense of the week", title: "Offense & defense", tiles },
      `The best offense of the week belonged to the ${off.t.nick}, with ${off.yds} total yards against the ${off.o.nick}. The toughest defense? The ${dfn.t.nick}, who allowed just ${dfn.allowed} yards.` +
      `${tk.take >= 2 ? ` The ${tk.t.nick} forced ${tk.take} turnovers.` : ""} And the biggest win of the week was the ${big.W.nick}, by ${big.m} points over the ${big.L.nick}.`);
  }

  // ---- the leaders, each on the field
  const L = (k, f, fmt) => all.filter(p => p[k]).map(p => [f(p[k]), p]).sort((a, b) => b[0] - a[0]).slice(0, 5)
    .map(([v, p]) => ({ name: p.n, tm: p.tm, color: tcol(p), v, sub: fmt(p[k]), td: n(p[k].TD) }));
  const fieldsSay = y => { const f = y / 100, w = Math.floor(f); return y < 140 ? "" : f - w < .08 ? ` That's ${W_(w)} full football fields!` : f - w > .4 && f - w < .6 ? ` That's ${w === 1 ? "a field" : W_(w) + " fields"} and a half!` : ` That's more than ${w === 1 ? "a full football field" : W_(w) + " football fields"}!`; };
  [["pass", "Passing yards", L("passing", s => n(s.YDS), s => `${s["C/ATT"]} · ${n(s.TD)} TD · ${n(s.INT)} INT`), "passer"],
   ["rush", "Rushing yards", L("rushing", s => n(s.YDS), s => `${n(s.CAR)} car · ${n(s.TD)} TD · long ${n(s.LONG)}`), "rusher"],
   ["rec", "Receiving yards", L("receiving", s => n(s.YDS), s => `${n(s.REC)} rec · ${n(s.TD)} TD · long ${n(s.LONG)}`), "receiver"]].forEach(([k, title, rows], i) => {
    if (!rows.length) return;
    scene({ kind: "leader", id: "l" + i, chapter: i === 0 ? "Stat leaders" : undefined, title, rows, viz: { t: "field", k, yds: rows[0].v, td: rows[0].td } },
      `${i === 0 ? "On to the stat leaders. " : ""}The top ${title === "Passing yards" ? "passer" : title === "Rushing yards" ? "rusher" : "receiver"} of the week was ${rows[0].name}, with ${rows[0].v} yards.${fieldsSay(rows[0].v)}` +
      `${rows[1] ? ` ${rows[1].name} was next with ${rows[1].v}` : ""}${rows[2] ? `, followed by ${rows[2].name} with ${rows[2].v}.` : rows[1] ? "." : ""}` +
      `${rows[4] ? ` ${rows[3].name} and ${rows[4].name} round out the top five.` : ""}`);
  });

  // ---- defense
  const D = all.filter(p => p.defensive || p.interceptions).map(p => { const d = p.defensive || {}, x = p.interceptions || {};
    return { p, sk: n(d.SACKS), int: n(x.INT), tot: n(d.TOT), tfl: n(d.TFL), pd: n(d.PD), td: n(d.TD) + n(x.TD) }; });
  if (D.length >= 5) {
    const sc = d => 4.5 * d.sk + 5 * d.int + 6 * d.td + d.tfl + .2 * d.tot + .5 * d.pd;
    const rows = D.slice().sort((a, b) => sc(b) - sc(a)).slice(0, 5).map(d => ({ name: d.p.n, tm: d.p.tm, color: tcol(d.p),
      v: d.sk >= 1 ? d.sk : d.int >= 1 ? d.int : d.tot, u: d.sk >= 1 ? "SK" : d.int >= 1 ? "INT" : "TKL", sub: [`${d.tot} tackles`, d.sk ? `${d.sk} sacks` : "", d.int ? `${d.int} INT` : "", d.tfl ? `${d.tfl} TFL` : ""].filter(Boolean).join(" · ") }));
    const by = k => D.slice().sort((a, b) => b[k] - a[k])[0], s1 = by("sk"), i1 = by("int"), t1 = by("tot"), parts = [];
    if (s1.sk >= 1) parts.push(`${s1.p.n} led everyone with ${s1.sk === 1 ? "a sack" : s1.sk + " sacks"}`);
    if (i1.int >= 1) parts.push(`${i1.p.n} picked off ${i1.int === 1 ? "a pass" : i1.int + " passes"}`);
    if (t1.tot >= 8) parts.push(`${t1.p.n} was everywhere, with ${t1.tot} tackles`);
    scene({ kind: "board", id: "def", chapter: "Defense", title: "Defensive standouts", unit: "", rows },
      `On defense, ${parts.length > 1 ? parts.slice(0, -1).join(". ") + ". And " + parts[parts.length - 1] : parts[0] || "it was a big week"}.`);
  }

  // ---- player of the week
  const hw = hp.g.home.ab === hp.tm ? hp.g.home : hp.g.away, ho = hw === hp.g.home ? hp.g.away : hp.g.home, won = n(hw.score) > n(ho.score);
  const hon = all.filter(p => p !== hp).sort((a, b) => ppr(b) - ppr(a)).slice(0, 2);
  const chips = []; const a = hp.passing || {}, r = hp.rushing || {}, c = hp.receiving || {};
  if (n(a.YDS)) chips.push(`${a["C/ATT"]} passing`, `${n(a.YDS)} pass yds`, n(a.TD) && `${n(a.TD)} pass TD`); if (n(r.YDS) >= 20 || n(r.TD)) chips.push(`${n(r.YDS)} rush yds${n(r.TD) ? ` · ${n(r.TD)} TD` : ""}`);
  if (n(c.REC)) chips.push(`${n(c.REC)} catches · ${n(c.YDS)} yds`, n(c.TD) && `${n(c.TD)} rec TD`);
  scene({ kind: "pow", id: "pow", chapter: "Player of the week", who: hp.n, tm: hp.tm, color: hteam.color, chips: chips.filter(Boolean).slice(0, 4), fan: r1(ppr(hp)),
    result: `${won ? "W" : "L"} ${Math.max(n(hw.score), n(ho.score))}-${Math.min(n(hw.score), n(ho.score))} ${hw === hp.g.home ? "vs" : "at"} ${ho.nick}`, viz: fieldViz(hp, h[4]),
    hon: hon.map(p => ({ name: p.n, tm: p.tm, color: tcol(p), line: statLine(p).txt })) },
    `And now, our player of the week... ${hp.n}! ${statLine(hp).say.replace(hp.n + " ", "He ")} The ${hw.nick} ${won ? "beat" : "lost to"} the ${ho.nick}, ${Math.max(n(hw.score), n(ho.score))} to ${Math.min(n(hw.score), n(ho.score))}, and he scored ${r1(ppr(hp))} fantasy points.` +
    `${hon.length === 2 ? ` Honorable mentions go to ${hon[0].n} and ${hon[1].n}.` : ""}`);

  // ---- fantasy (full PPR)
  const fan = all.slice().sort((a, b) => ppr(b) - ppr(a)).slice(0, 5).map(p => ({ name: p.n, tm: p.tm, color: tcol(p), v: r1(ppr(p)), sub: statLine(p).txt }));
  scene({ kind: "board", id: "fan", chapter: "Fantasy top 5", title: "Fantasy points (PPR)", unit: "PTS", rows: fan },
    `In fantasy football, ${fan[0].name} led everyone with ${fan[0].v} points in PPR leagues. ${fan[1].name} had ${fan[1].v}, ${fan[2].name} had ${fan[2].v}, and ${fan[3].name} and ${fan[4].name} rounded out the top five.`);

  // ---- best records
  if (std.length >= 4) scene({ kind: "standings", id: "std", chapter: "Best records", rows: std },
    `After Week ${wk}, the ${std[0].nick} have the best record in the league at ${rs(std[0].rec)}. The ${std[1].nick}, the ${std[2].nick} and the ${std[3].nick} are right behind them${std[7] ? `, with the ${std[4].nick}, ${std[5].nick}, ${std[6].nick} and ${std[7].nick} close behind` : ""}.`);

  // ---- around the NBA, on the shot chart
  const nb = nba.slice(0, 3);
  nb.forEach((p, i) => {
    const [fm, fa] = String(p.fg || "0-0").split("-").map(Number), t3 = Number(String(p.tp || "0").split("-")[0]) || 0;
    const shoot = fa ? `, on ${fm} of ${fa} shooting` : "", threes = t3 >= 4 ? `, with ${t3} threes` : "";
    const say = i === 0 ? `Around the NBA this week, nobody was better than ${p.name}. ${p.pts} points, ${p.reb} rebounds and ${p.ast} assists against the ${p.opp}${shoot}!`
      : i === 1 ? `${p.name} dropped ${p.pts} on the ${p.opp}${threes || shoot}, with ${p.reb} rebounds and ${p.ast} assists.`
      : `And ${p.name} had ${p.pts} points, ${p.reb} rebounds and ${p.ast} assists against the ${p.opp}${shoot}.`;
    const sh = p.shots || [], at = f => { const z = sh.filter(f); return [z.filter(x => x[2]).length, z.length]; };
    const [rm, ra] = at(x => Math.hypot(x[0] - 25, x[1]) <= 5.5), [tm_, ta] = at(x => x[3]), [mm, ma] = at(x => !x[3] && Math.hypot(x[0] - 25, x[1]) > 5.5);
    const chart = ra >= 6 && rm / ra >= .6 ? ` He was a problem at the rim, making ${rm} of ${ra} up close.` : tm_ >= 4 ? ` He hit ${tm_} of ${ta} from three.` : mm >= 5 ? ` He lived in the midrange, making ${mm} of ${ma}.` : "";
    scene({ kind: "nbap", id: "n" + i, chapter: i === 0 ? "Around the NBA" : undefined, rank: i + 1, name: p.name, tm: p.tm, color: p.color, pts: p.pts, reb: p.reb, ast: p.ast,
      stl: p.stl, blk: p.blk, fg: p.fg, tp: p.tp, opp: p.opp, date: p.date, score: p.score, viz: { t: "court", shots: p.shots, fg: p.fg, tp: p.tp, ft: p.ft } }, say + chart);
  });

  if (nba.length >= 6) { const rest = nba.slice(3, 6);
    scene({ kind: "board", id: "nbr", title: "More big NBA games", unit: "PTS", rows: rest.map(p => ({ name: p.name, tm: p.tm, color: p.color, v: p.pts, sub: `${p.reb} reb · ${p.ast} ast · ${p.fg} FG · vs ${p.opp} · ${p.date}` })) },
      `A few more big NBA games this week. ${rest.map(p => `${p.name} scored ${p.pts} against the ${p.opp}.`).join(" ")}`); }

  // ---- next week
  if (next.length) {
    const nw = wk + 1, first = next[0], when = iso => { const d = ET(iso, { weekday: "long" }), hr = +ET(iso, { hour: "numeric", hour12: false }) % 24;
      return d === "Sunday" ? (hr >= 19 ? "Sunday night" : hr >= 15 ? "Sunday afternoon" : `Sunday at ${hr > 12 ? hr - 12 : hr}`) : d === "Monday" || d === "Thursday" ? d + " night" : d; };
    scene({ kind: "slate", id: "sl", chapter: `Week ${nw} preview`, week: nw, games: next.map(g => ({ away: g.away, home: g.home, day: dow(g.date), time: tme(g.date), tv: g.tv })) },
      `Now let's look ahead to Week ${nw}. ${cap(W_(next.length))} games are on the schedule, starting ${when(first.date)} with the ${first.away.nick} at the ${first.home.nick}.`);
    const prime = g => /night/.test(when(g.date)) ? .12 : 0;
    const top = next.slice().sort((x, y) => (pctOf(y.away.rec) + pctOf(y.home.rec) + prime(y) - Math.abs(pctOf(y.away.rec) - pctOf(y.home.rec)) * .5) -
      (pctOf(x.away.rec) + pctOf(x.home.rec) + prime(x) - Math.abs(pctOf(x.away.rec) - pctOf(x.home.rec)) * .5)).slice(0, Math.min(5, next.length));
    const LK = [["passingYards", "passing yards"], ["rushingYards", "rushing yards"], ["receivingYards", "receiving yards"]];
    top.forEach((g, i) => {
      const A = g.away, H = g.home, good = [A, H].filter(t => pctOf(t.rec) > .5).length;
      const unb = [A, H].find(t => pctOf(t.rec) === 1 && n(String(t.rec).split("-")[0]) >= 3);
      const frame = unb ? `The ${unb.nick} haven't lost yet. Can the ${(unb === A ? H : A).nick} change that?`
        : good === 2 ? ["Two winning teams, and a big one for the standings.", "Both teams come in with winning records.", "Two of the better teams in the league, head to head.", "A big one at the top of the standings.", "Two winning teams, and only one can leave happy."][i % 5]
        : ["Both teams need this one.", "A big one for both sides.", "Plenty on the line here.", "One team gets back on track here.", "This one could swing the standings."][i % 5];
      let watch = ""; for (const [k, w] of LK.slice(i % 3).concat(LK.slice(0, i % 3))) { const t = [A, H][i % 2], l = t.lead && (t.lead[k.replace("Yards", "Leader")] || t.lead[k]), y = l && String(l.v).match(/([\d,]+) YDS/), td = l && String(l.v).match(/(\d+) TD/);
        if (y) { watch = ` Keep an eye on ${l.n}, with ${n(y[1])} ${w}${td && +td[1] ? ` and ${cnt(+td[1], "touchdown")}` : ""} this season.`; break; } }
      const lastSay = t => { const G = games.find(x => x.away.ab === t.ab || x.home.ab === t.ab); if (!G) return `the ${t.nick} are coming off a bye`; const me = G.home.ab === t.ab ? G.home : G.away, op = me === G.home ? G.away : G.home, a = n(me.score), b = n(op.score);
        return a > b ? `the ${t.nick} beat the ${op.nick} last week, ${a} to ${b}` : a < b ? `the ${t.nick} lost to the ${op.nick}, ${b} to ${a}` : `the ${t.nick} tied the ${op.nick}`; };
      const lastOf = t => { const G = games.find(x => x.away.ab === t.ab || x.home.ab === t.ab); if (!G) return "Bye"; const me = G.home.ab === t.ab ? G.home : G.away, op = me === G.home ? G.away : G.home;
        return `${n(me.score) > n(op.score) ? "W" : n(me.score) < n(op.score) ? "L" : "T"} ${me.score}-${op.score} ${me === G.home ? "vs" : "at"} ${op.ab}`; };
      scene({ kind: "matchup", id: "m" + i, away: A, home: H, last: [lastOf(A), lastOf(H)], day: ET(g.date, { weekday: "long" }), time: tme(g.date) + " ET", tv: g.tv, frame,
        lead: [A, H].map(t => { const l = t.lead && (t.lead.passingLeader || t.lead.passingYards || t.lead.rushingLeader); return l ? { n: l.n, v: l.v, tm: t.ab, color: t.color } : null; }).filter(Boolean) },
        `${i === 0 ? "Here are the matchups you can't miss. " : ""}${cap(when(g.date))}, the ${A.nick}${A.rec ? `, at ${rs(A.rec)},` : ""} visit the ${H.nick}${H.rec ? `, at ${rs(H.rec)}` : ""}. ${frame} ${cap(lastSay(A))}, and ${lastSay(H)}.${watch}`);
    });
  }

  scene({ kind: "outro", id: "outro", chapter: "Outro" },
    `That's Week ${wk}! Drop your player of the week in the comments, subscribe to ${brand} for daily stats, and we'll see you next week!`);

  const range = `${md(games[0].date)} – ${md(games[games.length - 1].date)}`;
  const title = `NFL Week ${wk} Recap: ${hp.n.split(" ").slice(-1)[0]}'s ${h[1]} ${cap(h[2]).replace(/ (\w)/g, (m, x) => " " + x.toUpperCase())}, Every Score & Week ${wk + 1} Preview`;
  const desc = [`${hp.n}: ${h[1]} ${h[2]} 🔥 Every score from NFL Week ${wk} (${range}), the games everyone is talking about, the stat leaders, defense, fantasy top 5, the player of the week, the best records, the NBA's best games${next.length ? `, and the Week ${wk + 1} matchups to watch` : ""}.`, "",
    "CHAPTERS", "{{chapters}}", "", "Who's your player of the week? Tell us in the comments 👇", "New stat recaps every day. Subscribe for next week's recap!", "",
    `#NFL #NFLWeek${wk} #FantasyFootball #NFLHighlights #${hp.n.replace(/[^A-Za-z0-9]/g, "")} #Crossover`].join("\n");
  return { mode: "weekly", template: "weekly.html", w: 1920, h: 1080, brand, day: games[games.length - 1].date.slice(0, 10), week: wk, season, range,
    title: `NFL Week ${wk} Recap`, ytTitle: title.length <= 100 ? title : `NFL Week ${wk} Recap: Every Score, Top Performers & Week ${wk + 1} Preview`, description: desc, source: "Stats: ESPN box scores", scenes, voice };
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
  console.log(`Week ${D.week}: ${D.scenes.length} scenes, ${Object.values(D.voice).join(" ").split(/\s+/).length} words`);
})().catch(e => { console.error(e); process.exit(1); });
