/* "Tonight's games" preview: today's NBA slate (plus NFL on game days), with start times, TV, records, each team's
   top scorer and how they've played over their last 5 games, and who's ruled out. Stats only: no odds, no picks.
   Writes the data recap.html draws in preview mode, the narration, and a caption.
   usage: node preview.js [YYYY-MM-DD, default today Eastern] out/data.json      (exit 3 when there are no games) */
"use strict";
const fs = require("fs");
const SITE = "https://site.api.espn.com/apis/site/v2/sports/", WEB = "https://site.web.api.espn.com/apis/common/v3/sports/";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const NATIONAL = /ESPN|ABC|TNT|NBC|Prime|Peacock|NBA TV|CBS|FOX|NFL Net/i;
const n = v => { const x = parseFloat(String(v).replace(/,/g, "")); return isFinite(x) ? x : 0; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const r1 = x => Math.round(x * 10) / 10;
async function get(url, tries = 3) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", accept: "application/json" } }); if (!r.ok) throw new Error(r.status + " " + url); return await r.json(); }
    catch (e) { if (i >= tries - 1) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
// team colour that reads on graphite (same rule as the recap)
function lum(h) { if (!/^[0-9a-f]{6}$/i.test(h || "")) return 0; const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
const hex = (h, f) => "#" + [0, 2, 4].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - f) + 255 * f).toString(16).padStart(2, "0")).join("");
const col = t => { if (lum(t.color) > .045) return "#" + t.color; if (lum(t.alt) > .045 && !/^ffffff$/i.test(t.alt)) return "#" + t.alt;
  if (!/^[0-9a-f]{6}$/i.test(t.color || "")) return "#a1a1aa"; for (let f = .1; f < .9; f += .1) { const c = hex(t.color, f); if (lum(c.slice(1)) > .06) return c; } return "#a1a1aa"; };
const et = iso => { const d = new Date(iso); return d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).replace(" ", "").replace(/:00(?=[AP]M)/, ""); };
// start time in words ("eight fifteen", "seven o'clock"): voices misread "8:15" as a number
const NUMW = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { 2: "twenty", 3: "thirty", 4: "forty", 5: "fifty" };
const etSay = iso => { const [h, m] = new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).split(" ")[0].split(":").map(Number);
  const mm = m === 0 ? "o'clock" : m < 10 ? "oh " + NUMW[m] : m < 20 ? NUMW[m] : TENS[Math.floor(m / 10)] + (m % 10 ? "-" + NUMW[m % 10] : "");
  return `${NUMW[h]} ${mm} Eastern`; };

// the last 5 regular-season games for one player: points, rebounds, assists per game
async function last5(sport, id) {
  try {
    const d = await get(`${WEB}${sport}/athletes/${id}/gamelog`);
    const L = d.labels || d.names || [], ip = L.indexOf("PTS"), ir = L.indexOf("REB"), ia = L.indexOf("AST");
    if (ip < 0) return null;
    const rows = [];
    for (const st of d.seasonTypes || []) {
      if (/pre/i.test(st.displayName || "")) continue;
      for (const c of st.categories || []) for (const e of c.events || []) {
        const ev = (d.events || {})[e.eventId] || {};
        if (e.stats && e.stats.length) rows.push({ t: Date.parse(ev.gameDate || 0) || 0, p: n(e.stats[ip]), r: ir >= 0 ? n(e.stats[ir]) : 0, a: ia >= 0 ? n(e.stats[ia]) : 0 });
      }
    }
    rows.sort((a, b) => b.t - a.t);
    const k = rows.slice(0, 5); if (k.length < 3) return null;
    const avg = f => r1(k.reduce((s, x) => s + x[f], 0) / k.length);
    return { g: k.length, p: avg("p"), r: avg("r"), a: avg("a") };
  } catch (e) { return null; }
}

async function outList(sport) {
  try { const d = await get(`${SITE}${sport}/injuries`); const m = {};
    for (const t of d.injuries || []) m[String(t.id)] = (t.injuries || []).filter(i => /^out$/i.test(i.status || "")).map(i => (i.athlete || {}).displayName).filter(Boolean);
    return m; } catch (e) { return {}; }
}

function leaders(c) {
  const out = {};
  for (const cat of c.leaders || []) { const l = (cat.leaders || [])[0]; if (!l || !l.athlete) continue;
    out[cat.name] = { name: l.athlete.displayName, short: l.athlete.shortName || l.athlete.displayName, id: l.athlete.id, value: n(l.value), show: l.displayValue }; }
  return out;
}

async function slate(sport, label, ymd) {
  const sb = await get(`${SITE}${sport}/scoreboard?dates=${ymd.replace(/-/g, "")}&limit=300${sport.includes("college") ? "&groups=80" : ""}`);
  const outs = await outList(sport), games = [];
  for (const ev of sb.events || []) {
    const c = ev.competitions[0], st = (c.status || {}).type || {};
    if (st.state !== "pre" || ![2, 3].includes((ev.season || {}).type || 2)) continue;
    const T = {};
    for (const x of c.competitors) { const t = x.team || {}, rec = ((x.records || [])[0] || {}).summary || "0-0", [w, l] = rec.split("-").map(n);
      T[x.homeAway] = { ab: t.abbreviation, nick: t.shortDisplayName || t.name, name: t.displayName, id: String(t.id), color: col({ color: t.color, alt: t.alternateColor }), bg: /^[0-9a-f]{6}$/i.test(t.color || "") ? "#" + t.color : null,
        rec, pct: w + l ? w / (w + l) : .5, rank: x.curatedRank && x.curatedRank.current <= 25 ? x.curatedRank.current : null, lead: leaders(x), out: (outs[String(t.id)] || []).slice(0, 3) }; }
    if (sport.includes("college") && !T.home.rank && !T.away.rank) continue;   // college: Top 25 games only
    const tv = [...new Set([...(c.broadcasts || []).flatMap(b => b.names || []), ...(c.geoBroadcasts || []).map(g => (g.media || {}).shortName)].filter(Boolean))];
    games.push({ sport: label, id: ev.id, date: ev.date, time: et(ev.date), say: etSay(ev.date), tv: tv.find(x => NATIONAL.test(x) && !/League Pass/i.test(x)) || "", nat: tv.some(x => NATIONAL.test(x) && !/League Pass/i.test(x)), away: T.away, home: T.home });
  }
  if (label === "NBA") for (const g of games) for (const s of [g.away, g.home]) { const p = s.lead.points || s.lead.pointsPerGame;
    if (p && p.id) { p.l5 = await last5("basketball/nba", p.id); } }
  return games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

let DAYKEY = "";
const pick = (arr, key) => { let h = 0; for (const c of DAYKEY + key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };
const pl = (v, w) => `${v} ${w}${v === 1 ? "" : "s"}`;
function star(s, sport) {
  if (sport === "NBA") { const p = s.lead.points || s.lead.pointsPerGame; if (!p) return null;
    const hot = p.l5 && p.l5.p - p.value >= 2 && p.l5.p >= 18;
    const gw = p.l5 ? (WORDS[p.l5.g] || p.l5.g) : "";
    return { name: p.name, short: p.short, big: p.l5 ? p.l5.p : r1(p.value), lab: p.l5 ? `PPG last ${p.l5.g}` : "PPG", season: r1(p.value), l5: p.l5, hot, gw,
      chip: p.l5 ? `${p.short}: ${p.l5.p} / ${p.l5.r} / ${p.l5.a} last ${p.l5.g}` : `${p.short}: ${p.show} PPG`, say: true }; }
  const p = s.lead.passingYards || s.lead.rushingYards || s.lead.receivingYards; if (!p) return null;
  return { name: p.name, short: p.short, big: null, chip: `${p.short}: ${p.show}`, say: "" };
}

// what the narrator says about a game's two players: different wording for the second one, and it rotates game to game
// so it never sounds like the same sentence twice in a row
function sayPlayers(g, i) {
  const P = x => Math.round(x.l5 ? x.l5.p : x.season), xs = [g.a, g.h].filter(x => x && x.say);
  const first = [
    x => `Keep an eye on ${x.name}, averaging ${P(x)} points over his last ${x.gw} games${x.hot ? `, up from ${Math.round(x.season)} on the season` : ""}`,
    x => `${x.name} comes in averaging ${P(x)} points over his last ${x.gw} games${x.hot ? `, up from ${Math.round(x.season)} on the season` : ""}`,
    x => `Watch for ${x.name}, who's putting up ${P(x)} a game over his last ${x.gw}${x.hot ? `, well above his ${Math.round(x.season)} for the season` : ""}`];
  const second = [
    (x, t) => `On the other side, ${x.name} is scoring ${P(x)} a game over his last ${x.gw}${x.hot ? `, above his ${Math.round(x.season)} season average` : ""}`,
    (x, t) => `For the ${t.nick}, ${x.name} has averaged ${P(x)}${x.hot ? `, up from ${Math.round(x.season)} on the season` : " over that same stretch"}`,
    (x, t) => `And ${x.name} answers with ${P(x)} points a game lately${x.hot ? `, up from ${Math.round(x.season)} on the season` : ""}`];
  const season = x => `${x.name} is averaging ${Math.round(x.season)} points per game this season`;
  let h = 0; for (const c of DAYKEY) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return xs.map((x, k) => " " + (!x.l5 ? season(x) : k === 0 ? first[(h + i) % 3](x) : second[(h + i + 1) % 3](x, x === g.h ? g.home : g.away)) + ".").join("");
}

function build(day, nba, nfl, cfb, brand) {
  const d = new Date(day + "T12:00:00Z"), wd = DAYS[d.getUTCDay()], md = `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const all = [...nfl, ...cfb, ...nba]; if (!all.length) return null;
  for (const g of all) { g.a = star(g.away, g.sport); g.h = star(g.home, g.sport); g.score = g.away.pct + g.home.pct + (g.nat ? .5 : 0) + (g.a && g.a.hot ? .4 : 0) + (g.h && g.h.hot ? .4 : 0) + (g.away.rank || g.home.rank ? .6 : 0); }
  // featured games: the best matchups by record, national TV and hot players (in start-time order)
  const pick = (G, k) => G.slice().sort((a, b) => b.score - a.score).slice(0, k).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const feat = [...pick(nfl, 2), ...pick(cfb, nfl.length ? 1 : 2), ...pick(nba, nfl.length || cfb.length ? 2 : 3)];
  const hotList = nba.flatMap(g => [g.a, g.h]).filter(x => x && x.l5).sort((a, b) => (b.hot - a.hot) || (b.big - a.big));
  const hot = hotList[0], hotTeam = hot && nba.find(g => g.a === hot || g.h === hot), hotSide = hotTeam && (hotTeam.a === hot ? hotTeam.away : hotTeam.home);
  const count = [nba.length && `${nba.length} NBA`, nfl.length && `${nfl.length} NFL`, cfb.length && `${cfb.length} Top 25`].filter(Boolean).join(" · ");
  const sayCount = [nba.length && `${WORDS[nba.length] || nba.length} NBA game${nba.length === 1 ? "" : "s"}`, nfl.length && `${WORDS[nfl.length] || nfl.length} in the NFL`, cfb.length && `${WORDS[cfb.length] || cfb.length} Top 25 college games`].filter(Boolean);
  DAYKEY = day;
  const voice = { hook: hot ? `${Math.round(hot.big)} points a game! That's what ${hot.name} is averaging over his last ${WORDS[hot.l5.g] || hot.l5.g}, and he's back on the floor tonight. ${cap(sayCount.join(sayCount.length > 2 ? ", " : " and "))} on the board. Here's what to watch!` : `${cap(sayCount.join(sayCount.length > 2 ? ", " : " and "))} ${wd === DAYS[new Date().getUTCDay()] ? "tonight" : "on " + wd}! Here's what to watch!` };
  const scenes = feat.map((g, i) => {
    const outs = [...g.away.out.map(x => [x, g.away]), ...g.home.out.map(x => [x, g.home])];
    const starOut = outs.find(([x]) => (g.a && x === g.a.name) || (g.h && x === g.h.name));
    const say = `${g.away.rank ? "Number " + g.away.rank + " " : ""}${g.sport === "CFB" ? g.away.nick : "The " + g.away.nick} at ${g.home.rank ? "number " + g.home.rank + " " : ""}${g.sport === "CFB" ? g.home.nick : "the " + g.home.nick}, ${g.sport === "NBA" ? "tip-off" : "kickoff"} at ${g.say}${g.tv ? " on " + g.tv : ""}.` +
      sayPlayers(g, i) + (starOut ? ` ${starOut[0]} is out tonight.` : "");
    voice["g" + i] = say;
    const who = x => !x ? null : x.big != null ? { v: x.big, lab: x.lab, who: x.name } : { txt: x.chip };
    return { sport: g.sport, time: g.time, tv: g.tv, away: { ab: g.away.ab, nick: g.away.nick, rec: g.away.rec, color: g.away.color, bg: g.away.bg, rank: g.away.rank, p: who(g.a) },
      home: { ab: g.home.ab, nick: g.home.nick, rec: g.home.rec, color: g.home.color, bg: g.home.bg, rank: g.home.rank, p: who(g.h) },
      chips: [g.a && g.a.chip, g.h && g.h.chip].filter(Boolean), out: outs.slice(0, 3).map(([x, t]) => `${x} (${t.ab})`),
      big: g.a && g.h && g.a.big != null && g.h.big != null ? (g.a.big >= g.h.big ? [g.a, g.away] : [g.h, g.home]) : null };
  }).map(s => { if (s.big) { const [p, t] = s.big; s.big = { v: p.big, lab: p.lab, who: p.name, tm: t.ab }; } return s; });
  voice.slate = "Here's the full slate!";
  voice.outro = `Enjoy the games! Follow ${brand} for the morning recap!`;
  const cap1 = `${wd}'s games to watch (${md}) 👀`;
  const lines = [hot ? `${hot.name}: ${hot.big} PPG over his last ${hot.l5.g} 🔥` : `${count} games tonight`, "", cap1,
    ...feat.map(g => `${g.sport === "NBA" ? "🏀" : "🏈"} ${g.away.ab} @ ${g.home.ab}, ${g.time} ET${g.tv ? " on " + g.tv : ""}`), "",
    "Who are you watching tonight? Comments 👇", "Follow for the morning recap ✅", "",
    [...new Set([...[nfl.length && "#NFL", cfb.length && "#CollegeFootball", nba.length && "#NBA"].filter(Boolean), ...(hot ? ["#" + hot.name.replace(/[^A-Za-z0-9]/g, "")] : []),
      ...feat.slice(0, 2).flatMap(g => ["#" + g.home.nick.replace(/[^A-Za-z0-9]/g, "")]), "#GameDay", "#SportsStats", "#fyp"])].slice(0, 10).join(" ")];
  const sp = [nba.length && "NBA", nfl.length && "NFL", cfb.length && "College"].filter(Boolean).join(" & ");
  const ytTitle = (hot ? `${hot.name} Is Averaging ${Math.round(hot.big)} a Game 🔥 ${wd}'s ${sp} Games to Watch` : `${wd}'s ${sp} Games to Watch: ${count} 🔥`).slice(0, 100);
  return { mode: "preview", ytTitle, brand, day, date: md, title: `${wd}'s games to watch`, source: "Schedule, stats and injuries: ESPN",
    hook: { big: hot ? String(hot.big) : String(all.length), label: hot ? "PPG last 5" : "games tonight", who: hot ? hot.name : count + " games", tm: hotSide ? hotSide.ab : "", color: hotSide ? hotSide.color : "#a1a1aa", bg: hotSide ? hotSide.bg : null, sport: hot ? "NBA" : "", ctx: count + " games tonight" },
    games: scenes, slate: all.map(g => ({ sport: g.sport, a: g.away.ab, h: g.home.ab, ac: g.away.color, hc: g.home.color, t: g.time })), voice, caption: lines.join("\n") };
}

(async () => {
  const day = process.argv[2] && /^\d{4}-\d\d-\d\d$/.test(process.argv[2]) ? process.argv[2] : new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const out = process.argv[process.argv.length - 1];
  const safe = async (s, l) => { try { return await slate(s, l, day); } catch (e) { console.error(l, e.message); return []; } };
  const nba = await safe("basketball/nba", "NBA"), nfl = await safe("football/nfl", "NFL"), cfb = await safe("football/college-football", "CFB");
  console.log(`${day}: NBA ${nba.length}, NFL ${nfl.length}, Top 25 CFB ${cfb.length}`);
  const D = build(day, nba, nfl, cfb, process.env.BRAND || "Crossover");
  if (!D) { console.log("No games today, nothing to make."); process.exit(3); }
  for (const [k, v] of Object.entries(D.voice)) console.log(k, "|", v);
  fs.writeFileSync(out, JSON.stringify(D, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
