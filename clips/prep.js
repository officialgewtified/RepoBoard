/* Turns a day of box scores (fetch.js output) into what recap.html shows and what the narrator says: the hook stat,
   final scores with a couple of notes, the best stat lines for each sport and a few more big games. Pure: same box
   scores, same video.
   usage: node prep.js <day YYYY-MM-DD> <nfl.json|-> <nba.json|-> [cfb.json] > data.json */
"use strict";
const fs = require("fs");
const n = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];

function lum(h) { if (!/^[0-9a-f]{6}$/i.test(h || "")) return 0; const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
// team colour that reads on a dark background: the primary, else the alternate, else the primary lightened (purple stays purple)
const hex = (h, f) => "#" + [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - f) + 255 * f).toString(16).padStart(2, "0")).join("");
const col = t => { if (lum(t.color) > .045) return "#" + t.color; if (lum(t.alt) > .045 && !/^(ffffff|fff)$/i.test(t.alt)) return "#" + t.alt;
  if (!/^[0-9a-f]{6}$/i.test(t.color || "")) return "#a1a1aa"; for (let f = .1; f < .9; f += .1) { const c = hex(t.color, f); if (lum(c.slice(1)) > .06) return c; } return "#a1a1aa"; };
function split(name) { const p = String(name).trim().split(/\s+/); return p.length < 2 ? { first: "", last: p[0] } : { first: p[0], last: p.slice(1).join(" ") }; }
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// how the narrator names a team: "the Ravens" in the pros, "Georgia" in college
const nick = t => t.short || String(t.name || t.ab).split(" ").pop();
const loc = t => t.loc || (t.short && t.name && t.name.endsWith(" " + t.short) && t.name.length > t.short.length ? t.name.slice(0, -t.short.length - 1) : String(t.name || t.ab).split(" ").slice(0, -1).join(" ")) || t.short || t.ab;
// the team as the photo finder needs it (to look for the player in that jersey)
const tinfo = t => ({ name: t.name || "", short: nick(t), loc: loc(t) });
const tname = (t, sport) => sport === "CFB" ? loc(t) : "the " + nick(t);
// "a touchdown", "3 touchdowns", "no touchdowns"
const cnt = (v, w) => v === 1 ? `a ${w}` : v === 0 ? `no ${w}${/s$/.test(w) ? "es" : "s"}` : `${v} ${w}${/s$/.test(w) ? "es" : "s"}`;

// where a player's team stands in their game: "CIN at BAL · W 35-13", and the narrator's "in a 35 to 13 win at the Ravens"
function where(g, tm, sport) {
  const home = g.home.ab === tm, me = home ? g.home : g.away, op = home ? g.away : g.home, ms = n(me.score), os = n(op.score);
  const res = ms > os ? "W" : ms < os ? "L" : "T", o = tname(op, sport), hi = Math.max(ms, os), lo = Math.min(ms, os);
  // the score is on screen, so the narrator just says who it was against
  const poss = x => x + (/s$/.test(x) ? "'" : "'s");
  const mine = sport === "CFB" ? poss(loc(me)) : "the " + poss(nick(me)), opp = loc(op);
  const say = res === "W" ? `in ${mine} ${hi} to ${lo} win ${home ? "over" : "at"} ${opp}` : res === "L" ? `in ${mine} ${hi} to ${lo} loss ${home ? "to" : "at"} ${opp}` : `in a ${ms} to ${os} tie with ${opp}`;
  return { me, op, home, res, say, txt: `<b>${esc(me.ab)}</b> ${home ? "vs" : "at"} ${esc(op.ab)} · <b>${res} ${hi}-${lo}</b>`, plain: `${res === "W" ? "win" : res === "L" ? "loss" : "tie"}`, score: `${hi}-${lo}` };
}
const raw = t => /^[0-9a-f]{6}$/i.test(t.color || "") ? "#" + t.color : null;
const finals = G => (G || []).filter(g => g.state === "post");
const scoreRows = G => G.map(g => { const as = n(g.away.score), hs = n(g.home.score), d = String(g.detail || "");
  return { a: { ab: g.away.ab, s: g.away.score, w: as > hs, c: col(g.away), rk: g.away.rank || null }, h: { ab: g.home.ab, s: g.home.score, w: hs > as, c: col(g.home), rk: g.home.rank || null }, note: /OT/.test(d) ? d.replace(/^Final\/?/, "Final ") : "" }; });

// a couple of things worth saying about the scores: upsets, overtime, blowouts, big and tiny totals
const BIG = { NFL: { m: 17, hi: 40, lo: 7 }, CFB: { m: 28, hi: 56, lo: 3 }, NBA: { m: 20, hi: 135, lo: 90 } };
function scoreNotes(G, sport) {
  const T = BIG[sport], out = [], used = new Set();
  const gs = G.map(g => { const hs = n(g.home.score), as = n(g.away.score), W = hs > as ? g.home : g.away, L = hs > as ? g.away : g.home; return { g, W, L, ws: Math.max(hs, as), ls: Math.min(hs, as), m: Math.abs(hs - as) }; });
  const add = (g, s) => { if (out.length < 1 && !used.has(g.g.id)) { used.add(g.g.id); out.push(cap(s)); } };
  if (sport === "CFB") for (const x of gs.filter(x => x.L.rank && (!x.W.rank || x.W.rank > x.L.rank)).sort((a, b) => a.L.rank - b.L.rank))
    add(x, `${x.W.rank ? "number " + x.W.rank : "unranked"} ${loc(x.W)} knocked off number ${x.L.rank} ${loc(x.L)}, ${x.ws} to ${x.ls}.`);
  for (const x of gs.filter(x => /OT/.test(String(x.g.detail || "")))) add(x, `${tname(x.W, sport)} beat ${tname(x.L, sport)} in overtime, ${x.ws} to ${x.ls}.`);
  const bl = gs.filter(x => x.m >= T.m).sort((a, b) => b.m - a.m)[0]; if (bl) add(bl, `${tname(bl.W, sport)} beat ${tname(bl.L, sport)} by ${bl.m}.`);
  const hi = gs.filter(x => x.ws >= T.hi).sort((a, b) => b.ws - a.ws)[0]; if (hi) add(hi, `${tname(hi.W, sport)} scored ${hi.ws} against ${tname(hi.L, sport)}.`);
  const lo = gs.filter(x => x.ls <= T.lo).sort((a, b) => a.ls - b.ls)[0]; if (lo) add(lo, `${tname(lo.L, sport)} were held to ${lo.ls} by ${tname(lo.W, sport)}.`);
  return out;
}

// season context from records.json: "Most points this season". Needs a few game days logged before it says anything.
const REC_LABEL = { NBA: { PTS: "points", REB: "rebounds", AST: "assists", BLK: "blocks", STL: "steals", "3PM": "threes" },
  NFL: { passYds: "passing yards", passTD: "touchdown passes", rushYds: "rushing yards", rushTD: "rushing touchdowns", recYds: "receiving yards", rec: "catches" } };
let REC = null, DAY = "";
// rotating phrasing so the narration sounds like a person and no two days read the same (stable for a given day)
const pick = (arr, key) => { let h = 0; for (const c of DAY + key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };
const firstName = nm => String(nm).split(" ")[0];
function seasonNote(sport, keys, name) {
  const S = REC && REC[sport]; if (!S || !S.top || (S.dates || []).length < 5) return null;
  let best = null;
  for (const k of keys) { const L = S.top[k] || [], e = L.find(x => x[1] === name && x[3] === DAY); if (!e) continue;
    const higher = L.filter(x => x[0] > e[0]).length, ties = L.filter(x => x[0] === e[0]).length;
    // a tie only counts if it is shared with one other game; "tied for most" with five others says nothing
    if (higher < 3 && ties <= 2 && (!best || higher < best.higher)) best = { k, higher, ties }; }
  if (!best) return null;
  const lab = REC_LABEL[sport][best.k], ord = ["most", "second-most", "third-most"][best.higher], tie = best.ties > 1;
  return { k: best.k, top: best.higher === 0, chip: `${tie ? "Tied for " + ord : cap(ord)} ${lab} this season`,
    say: tie ? `That ties the ${ord} ${lab} in a game this season!` : best.higher === 0 ? `That's the most ${lab} by any player this season!` : `That's the ${ord} ${lab} in a game this season!` };
}
const withNote = (card, note) => { if (note) { card.note = note.chip; card.say += " " + note.say; } return card; };

// half-PPR-style fantasy points, used to find the next-best football games after the three cards
const ppr = p => { const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {};
  return n(a.YDS) / 25 + 4 * n(a.TD) - 2 * n(a.INT) + n(r.YDS) / 10 + 6 * n(r.TD) + n(c.YDS) / 10 + 6 * n(c.TD) + n(c.REC); };
function fbLine(p) { const a = p.passing || {}, r = p.rushing || {}, c = p.receiving || {}, parts = [], says = [];
  const td = v => v ? ` and ${v === 1 ? "a touchdown" : v + " touchdowns"}` : "";
  if (n(a.YDS) >= 150) { parts.push(`${n(a.YDS)} pass yds, ${n(a.TD)} TD`); says.push(`threw for ${n(a.YDS)}${td(n(a.TD))}`); }
  if (n(r.YDS) >= 40 || n(r.TD) >= 2) { parts.push(`${n(r.YDS)} rush yds${n(r.TD) ? `, ${n(r.TD)} TD` : ""}`); says.push(`ran for ${n(r.YDS)}${td(n(r.TD))}`); }
  if (n(c.YDS) >= 40 || n(c.TD) >= 2) { parts.push(`${n(c.REC)} rec, ${n(c.YDS)} yds${n(c.TD) ? `, ${n(c.TD)} TD` : ""}`); says.push(`had ${n(c.YDS)} receiving yards${td(n(c.TD))}`); }
  return { txt: parts.slice(0, 2).join(" · "), say: says.slice(0, 2).join(" and ") };
}

// football: the best passer, rusher and receiver of the day. N is roughly a great game at that level (college runs hotter).
const FB_NORM = { NFL: { py: 360, pt: 3.4, ry: 140, rt: 2.4, cy: 150, cr: 12 }, CFB: { py: 420, pt: 4.5, ry: 190, rt: 3.2, cy: 180, cr: 13 } };
function fb(G, sport) {
  G = finals(G); if (!G.length) return null; const N = FB_NORM[sport];
  const P = []; for (const g of G) for (const p of g.players) P.push(Object.assign({ g }, p));
  const best = (k, f) => P.filter(p => p[k]).map(p => [f(p[k], p), p]).sort((a, b) => b[0] - a[0])[0];
  const top = [], hooks = [], shownP = new Set();
  const pa = best("passing", s => n(s.YDS) + 20 * n(s.TD) - 25 * n(s.INT));
  if (pa) { const p = pa[1], s = p.passing, w = where(p.g, p.tm, sport), sub = [`${s["C/ATT"]} comp`, `${n(s.INT)} INT`]; shownP.add(p);
    if (n(s.RTG)) sub.push(`${s.RTG} rating`); if (p.rushing && n(p.rushing.YDS) >= 25) sub.push(`${n(p.rushing.YDS)} rush yds`);
    const big = n(s.TD) >= 4 || n(s.YDS) >= 350, picks = n(s.INT) === 0 && n(s.TD) >= 2 ? ", no picks" : n(s.INT) >= 2 ? `, but ${n(s.INT)} picks` : "";
    const hype = n(s.TD) >= 3 || n(s.YDS) >= 300;
    const say = `${hype ? `What a day for ${p.n}! ` : `${p.n} threw for `}${hype ? `${n(s.YDS)} passing yards` : `${n(s.YDS)} yards`} and ${cnt(n(s.TD), "touchdown")}${n(s.INT) === 0 && n(s.TD) >= 2 ? ", no interceptions," : n(s.INT) >= 2 ? `, with ${n(s.INT)} interceptions,` : ""} ${w.say}${hype && w.res === "W" ? "!" : "."}`;
    top.push(withNote(Object.assign(split(p.n), { tag: "Top passer", tm: p.tm, team: tinfo(w.me), ctx: w.txt, color: col(w.me), bg: raw(w.me), stats: [[n(s.YDS), "Pass yds"], [n(s.TD), n(s.TD) === 1 ? "TD" : "TDs"], [s.AVG, "Yds/att"]], sub, say, viz: { t: "field", k: "pass", yds: n(s.YDS), td: n(s.TD) } }), sport === "NFL" && seasonNote("NFL", ["passTD", "passYds"], p.n)));
    hooks.push([n(s.YDS) / N.py, n(s.YDS), "passing yards", p, w], [n(s.TD) / N.pt, n(s.TD), "touchdown passes", p, w]); }
  const ru = best("rushing", (s, p) => n(s.YDS) + 20 * n(s.TD) + .5 * n((p.receiving || {}).YDS));
  if (ru) { const p = ru[1], s = p.rushing, w = where(p.g, p.tm, sport), sub = [`${s.AVG} per carry`, `Long of ${s.LONG}`]; shownP.add(p);
    if (p.receiving && n(p.receiving.REC)) sub.push(`${p.receiving.REC} catches, ${n(p.receiving.YDS)} yds`);
    const hype = n(s.YDS) >= 120 || n(s.TD) >= 2;
    const say = `${hype ? `${p.n} was unstoppable on the ground! ${n(s.YDS)} rushing yards` : `${p.n} ran for ${n(s.YDS)} yards`}${n(s.TD) ? " and " + cnt(n(s.TD), "touchdown") : ""} ${w.say}${hype && w.res === "W" ? "!" : "."}`;
    top.push(withNote(Object.assign(split(p.n), { tag: "Top rusher", tm: p.tm, team: tinfo(w.me), ctx: w.txt, color: col(w.me), bg: raw(w.me), stats: [[n(s.YDS), "Rush yds"], [n(s.TD), n(s.TD) === 1 ? "TD" : "TDs"], [n(s.CAR), "Carries"]], sub, say, viz: { t: "field", k: "rush", yds: n(s.YDS), td: n(s.TD) } }), sport === "NFL" && seasonNote("NFL", ["rushYds", "rushTD"], p.n)));
    hooks.push([n(s.YDS) / N.ry, n(s.YDS), "rushing yards", p, w], [n(s.TD) / N.rt, n(s.TD), "rushing touchdowns", p, w]); }
  const re = best("receiving", s => n(s.YDS) + 20 * n(s.TD) + 2 * n(s.REC));
  if (re) { const p = re[1], s = p.receiving, w = where(p.g, p.tm, sport), sub = [`${s.TGTS} targets`, `Long of ${s.LONG}`, `${s.AVG} per catch`]; shownP.add(p);
    const hype = n(s.YDS) >= 120;
    const say = `${hype ? `A monster game from ${p.n}! ${n(s.REC)} catches for ${n(s.YDS)} yards` : `${p.n} caught ${cnt(n(s.REC), "pass")} for ${n(s.YDS)} yards`}${n(s.TD) ? " and " + cnt(n(s.TD), "touchdown") : ""} ${w.say}${hype && w.res === "W" ? "!" : "."}`;
    top.push(withNote(Object.assign(split(p.n), { tag: "Top receiver", tm: p.tm, team: tinfo(w.me), ctx: w.txt, color: col(w.me), bg: raw(w.me), stats: [[n(s.YDS), "Rec yds"], [n(s.REC), "Catches"], [n(s.TD), n(s.TD) === 1 ? "TD" : "TDs"]], sub, say, viz: { t: "field", k: "rec", yds: n(s.YDS), td: n(s.TD) } }), sport === "NFL" && seasonNote("NFL", ["recYds", "rec"], p.n)));
    hooks.push([n(s.YDS) / N.cy, n(s.YDS), "receiving yards", p, w], [n(s.REC) / N.cr, n(s.REC), "catches", p, w]); }
  const more = P.filter(p => !shownP.has(p)).sort((a, b) => ppr(b) - ppr(a)).slice(0, 2).map(p => { const l = fbLine(p);
    return { sport, name: p.n, tm: p.tm, team: tinfo(where(p.g, p.tm, sport).me), color: col(where(p.g, p.tm, sport).me), txt: l.txt, say: `${p.n} ${l.say}.` }; }).filter(r => r.txt);
  // college has 50+ games on a Saturday: show the ones with a ranked team (best ranks first), else the first few
  let shown = G, when = "";
  if (sport === "CFB") { const rk = g => Math.min(g.home.rank || 99, g.away.rank || 99), R = G.filter(g => rk(g) < 99).sort((a, b) => rk(a) - rk(b));
    shown = (R.length ? R : G).slice(0, 12); when = R.length ? "Top 25" : ""; }
  const notes = scoreNotes(G, sport);
  const lead = sport === "CFB" ? "Let's go to college football!" : `Let's start in the NFL, where ${G.length === 1 ? "one game went final" : (WORDS[G.length] || G.length) + " games went final"}.`;
  return { sport, games: scoreRows(shown), total: G.length, when, top, hooks, more, note: notes[0] ? notes[0].replace(/\.$/, "") : "", say: [lead, ...notes].join(" ") };
}

const courtViz = p => ({ t: "court", shots: p.shots || [], fg: p.FG, tp: p["3PT"], ft: p.FT });
// the graphic for the hook's stat: the court for basketball, the field (in that kind of yards) for football
function hookViz(label, p) {
  if (p.PTS != null) return courtViz(p);
  const k = /rush/.test(label) ? "rush" : /receiv|catch/.test(label) ? "rec" : "pass", s = p[{ pass: "passing", rush: "rushing", rec: "receiving" }[k]] || {};
  return { t: "field", k, yds: n(s.YDS), td: n(s.TD) };
}
function nba(G) {
  G = finals(G); if (!G.length) return null;
  const P = []; for (const g of G) for (const p of g.players) if (p.PTS != null && n(p.MIN) > 0) P.push(Object.assign({ g }, p));
  const sc = p => n(p.PTS) + 1.2 * n(p.REB) + 1.5 * n(p.AST) + 2 * n(p.STL) + 2 * n(p.BLK);
  const NORM = { REB: [16, "Rebounds"], AST: [12, "Assists"], STL: [5, "Steals"], BLK: [5, "Blocks"] };
  const all = P.sort((a, b) => sc(b) - sc(a)), ranked = all.slice(0, 3), hooks = [];
  const ORD = ["And the top performance of the night...", "At number two,", "Coming in at number three,"];
  const top = ranked.map((p, i) => { const w = where(p.g, p.tm, "NBA");
    const two = Object.keys(NORM).sort((a, b) => n(p[b]) / NORM[b][0] - n(p[a]) / NORM[a][0]).slice(0, 2);
    const sub = [`${p.FG} FG`, `${p["3PT"]} from three`];
    for (const k of ["STL", "BLK", "AST", "REB"]) if (!two.includes(k) && n(p[k]) >= 3 && sub.length < 4) sub.push(`${n(p[k])} ${NORM[k][1].toLowerCase()}`);
    if (p["+/-"] && sub.length < 4) sub.push(`${p["+/-"]} on court`);
    const td = ["PTS", "REB", "AST", "STL", "BLK"].filter(k => n(p[k]) >= 10).length;
    const [fm, fa] = String(p.FG || "0-0").split("-").map(n), tm3 = n(String(p["3PT"] || "0").split("-")[0]);
    const flair = tm3 >= 5 ? `, with ${tm3} threes,` : fa >= 12 && fm / fa >= .6 ? `, on ${fm} of ${fa} shooting,` : "";
    const say = `${ORD[i]} ${p.n}${td >= 3 ? ", with a triple-double" : ""}! ${n(p.PTS)} points, ${n(p[two[0]])} ${NORM[two[0]][1].toLowerCase()} and ${n(p[two[1]])} ${NORM[two[1]][1].toLowerCase()}${flair} ${w.say}.`;
    return withNote(Object.assign(split(p.n), { rank: "#" + (i + 1), tm: p.tm, team: tinfo(w.me), tag: td >= 3 ? "Triple-double" : td === 2 ? "Double-double" : "Top performer", ctx: w.txt + ` · ${n(p.MIN)} min`, color: col(w.me), bg: raw(w.me),
      stats: [[n(p.PTS), "Points"], ...two.map(k => [n(p[k]), NORM[k][1]])], sub, say, viz: courtViz(p) }), seasonNote("NBA", ["PTS", "REB", "AST", "BLK", "STL", "3PM"], p.n)); });
  for (const p of P) { const w = where(p.g, p.tm, "NBA");
    hooks.push([n(p.PTS) / 32, n(p.PTS), "points", p, w], [n(p.REB) / 17, n(p.REB), "rebounds", p, w], [n(p.AST) / 14, n(p.AST), "assists", p, w], [n(p.BLK) / 6.5, n(p.BLK), "blocks", p, w]); }
  const more = all.slice(3, 5).map(p => ({ sport: "NBA", name: p.n, tm: p.tm, team: tinfo(where(p.g, p.tm, "NBA").me), color: col(where(p.g, p.tm, "NBA").me),
    txt: `${n(p.PTS)} pts · ${n(p.REB)} reb · ${n(p.AST)} ast`, say: `${p.n} had ${[`${n(p.PTS)} points`, n(p.REB) >= 8 ? `${n(p.REB)} rebounds` : "", n(p.AST) >= 6 ? `${n(p.AST)} assists` : ""].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1")}.` }));
  const notes = scoreNotes(G, "NBA");
  const lead = `Now to the NBA, with ${G.length === 1 ? "one game" : (WORDS[G.length] || G.length) + " games"} on the board.`;
  // the countdown runs #3, #2, #1
  return { sport: "NBA", games: scoreRows(G), total: G.length, when: "", top: top.reverse(), hooks, more, note: notes[0] ? notes[0].replace(/\.$/, "") : "", say: [lead, ...notes].join(" ") };
}

const HOOK_SAY = { points: v => `scored ${v} points`, rebounds: v => `grabbed ${v} rebounds`, assists: v => `recorded ${v} assists`, blocks: v => `blocked ${v} shots`,
  "passing yards": v => `threw for ${v} yards`, "touchdown passes": v => `threw ${v} touchdown passes`, "rushing yards": v => `ran for ${v} yards`,
  "rushing touchdowns": v => `ran for ${v} touchdowns`, "receiving yards": v => `had ${v} receiving yards`, catches: v => `caught ${v} passes` };

const HOOK_KEY = { points: "PTS", rebounds: "REB", assists: "AST", blocks: "BLK", "passing yards": "passYds", "touchdown passes": "passTD",
  "rushing yards": "rushYds", "rushing touchdowns": "rushTD", "receiving yards": "recYds", catches: "rec" };

function build(day, nflGames, nbaGames, opts, cfbGames) {
  opts = opts || {}; REC = opts.records || null; DAY = day;
  const d = new Date(day + "T12:00:00Z"), wd = DAYS[d.getUTCDay()], md = `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const sections = [fb(nflGames, "NFL"), fb(cfbGames, "CFB"), nba(nbaGames)].filter(Boolean);
  if (!sections.length) return null;
  const h = sections.flatMap(s => s.hooks.map(x => x.concat(s.sport))).sort((a, b) => b[0] - a[0])[0];
  const more = sections.flatMap(s => s.more.slice(0, sections.length > 1 ? 2 : 3)).slice(0, 3);
  const hs = h[5] !== "CFB" && seasonNote(h[5], [HOOK_KEY[h[2]]], h[3].n);
  const voice = { hook: `${h[1]} ${h[2]}! ${h[3].n} ${hs && hs.top ? "just had the biggest night in the league this season" : "just had the night of " + wd + ""}. Here's everything you missed!` };
  sections.forEach((s, si) => { voice["s" + si] = s.say; s.top.forEach((p, i) => voice[`p${si}_${i}`] = p.say); });
  if (more.length) voice.more = "A few more big performances. " + more.map(r => r.say).join(" ");
  voice.outro = `That's your recap! Follow ${opts.brand || "Crossover"} for tomorrow's best stats!`;
  for (const s of sections) { delete s.hooks; delete s.more; delete s.say; s.when = s.when ? s.when + " · " + md : md; }
  return {
    brand: opts.brand || "Crossover", day, date: md, title: `${wd}'s best stats`,
    source: "Stats: official box scores via ESPN",
    hook: { big: String(h[1]), label: h[2], who: h[3].n, ctx: h[4].txt, color: col(h[4].me), bg: raw(h[4].me), tm: h[4].me.ab, sport: h[5], viz: hookViz(h[2], h[3]) },
    sections, more, voice,
    caption: caption(wd, md, sections, h, hs),
    ytTitle: ytTitle(wd, sections, h, hs)
  };
}

// a ready-to-paste caption built to get engagement: hook, the stat lines, a question for the comments, and hashtags
// for the leagues, the day's stars and their teams. Still no hype beyond the numbers and no betting talk.
const tag = s => "#" + String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "");
function caption(wd, md, sections, h, hs) {
  const icon = sp => sp === "NBA" ? "🏀" : "🏈", last = c => c.last || "";
  const lines = [`${h[3].n} ${HOOK_SAY[h[2]](h[1])} on ${wd} 🔥${hs && hs.top ? " The most by anyone this season." : ""}`, "", `${wd}'s best stats (${md}) 📊`];
  const lab = l => /^TDs?$/.test(l) ? l : l.toLowerCase();
  for (const s of sections) for (const p of (s.sport === "NBA" ? s.top.slice().reverse() : s.top))
    lines.push(`${icon(s.sport)} ${p.rank ? p.rank + " " : ""}${p.first} ${last(p)}: ${p.stats.map(x => `${x[0]} ${lab(x[1])}`).join(", ")}`);
  const sp = sections.map(s => s.sport);
  lines.push("", sp.length > 1 ? "Who had the best night? Drop it in the comments 👇" : "Who was the best on " + wd + "? Comments 👇", "Follow for tomorrow's best stats ✅");
  // hashtags: leagues first (YouTube shows the first three), then the stars and their teams, then reach tags
  const stars = [h[3].n, ...sections.map(s => { const t = s.sport === "NBA" ? s.top[s.top.length - 1] : s.top[0]; return t && `${t.first} ${t.last}`; })];
  const teams = [nick(h[4].me)];
  const tags = [...sp.map(x => x === "CFB" ? "#CollegeFootball" : "#" + x), ...stars.filter(Boolean).map(tag), ...teams.map(tag),
    ...(sp.some(x => x !== "NBA") ? ["#FantasyFootball"] : []), ...(sp.includes("NBA") ? ["#NBAStats"] : []), "#SportsStats", "#fyp"];
  return lines.join("\n") + "\n\n" + [...new Set(tags)].slice(0, 11).join(" ");
}

// the YouTube Shorts title: the day's biggest stat as a headline, then what the video is (kept under YouTube's 100 characters)
const TITLE_VERB = { points: (w, v) => `${w} Drops ${v}`, rebounds: (w, v) => `${w} Grabs ${v} Boards`, assists: (w, v) => `${w} Dishes ${v} Assists`,
  blocks: (w, v) => `${w} Blocks ${v} Shots`, "passing yards": (w, v) => `${w} Throws for ${v} Yards`, "touchdown passes": (w, v) => `${w} Throws ${v} TDs`,
  "rushing yards": (w, v) => `${w} Runs for ${v} Yards`, "rushing touchdowns": (w, v) => `${w} Runs for ${v} TDs`, "receiving yards": (w, v) => `${w} Goes for ${v} Yards`,
  catches: (w, v) => `${w} Catches ${v} Passes` };
function ytTitle(wd, sections, h, hs) {
  const sp = sections.map(s => s.sport === "CFB" ? "College" : s.sport).join(" & ");
  const head = (TITLE_VERB[h[2]] || ((w, v) => `${w}: ${v} ${h[2]}`))(h[3].n, h[1]);
  const t = `${head} 🔥 ${wd}'s Best ${sp} Stats${hs && hs.top ? " (Season High)" : ""}`;
  return t.length <= 100 ? t : `${head} 🔥 ${wd}'s Best Stats`.slice(0, 100);
}

module.exports = { build };
if (require.main === module) {
  const [day, a, b, c] = process.argv.slice(2);
  const rd = f => f && f !== "-" && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  const out = build(day, rd(a), rd(b), { brand: process.env.BRAND, records: rd(require("path").join(__dirname, "records.json")) }, rd(c));
  if (!out) { console.error("No finished games on " + day); process.exit(3); }
  process.stdout.write(JSON.stringify(out, null, 1));
}
