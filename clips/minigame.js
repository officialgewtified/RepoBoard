/* The day's mini-game video for Crossover or Liftoff. The game rotates by day (Crossover: higher or lower, true or false,
   who has more, odd one out; Liftoff: higher or lower, true or false, which planet, guess the planet), every number comes
   from a checked fact table (clips/game/legends.json, space/game/planets.json), and questions used in the last two weeks
   are skipped (read back from the published videos).
   usage: node clips/minigame.js crossover|liftoff out/data.json [YYYY-MM-DD]   (env GAME=hol|tf|mc|odd|guess to force one) */
"use strict";
const fs = require("fs"), path = require("path");
const HERE = __dirname;
const com = n => Math.round(n).toLocaleString("en-US");
const ET = (d, o) => new Date(d).toLocaleString("en-US", Object.assign({ timeZone: "America/New_York" }, o));
function rng(seed) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const list = (a, w = "or") => a.length < 3 ? a.join(` ${w} `) : a.slice(0, -1).join(", ") + `, ${w} ` + a[a.length - 1];

// questions already used lately: every published mini game lists its own (data.json "used")
async function recent(prefix, day) {
  const repo = process.env.GITHUB_REPOSITORY || "officialgewtified/RepoBoard", used = new Set();
  await Promise.all(Array.from({ length: 14 }, (_, i) => i + 1).map(async ago => {
    const d = new Date(Date.parse(day + "T12:00:00Z") - ago * 864e5).toISOString().slice(0, 10);
    try { const r = await fetch(`https://github.com/${repo}/releases/download/${prefix}-${d}/data.json`, { signal: AbortSignal.timeout(15000) });
      if (r.ok) for (const k of ((await r.json()).used || [])) used.add(k); } catch (e) {} }));
  console.log(`${used.size} questions used in the last 14 days`);
  return used;
}

// ---------------- Crossover: retired NBA and NFL legends' career totals
const TOP = { rush: "Emmitt Smith", rec: "Jerry Rice", ptd: "Tom Brady", pyd: "Tom Brady", reb: "Wilt Chamberlain", ast: "John Stockton" };   // all-time #1, actives included
function nice(hi, lo) {   // a round number between two values (hi > T > lo): thousands for big totals, fifties for touchdowns
  for (const st of [10000, 5000, 1000, 500, 100, 50]) { if (st < (hi >= 5000 ? 1000 : 50)) break; const T = Math.floor(hi / st) * st; if (T > lo && T < hi) return T; }
  return null;
}
function crossover(game, day, used, R) {
  const L = JSON.parse(fs.readFileSync(path.join(HERE, "game/legends.json"), "utf8")).stats;
  const pick = a => a[Math.floor(R() * a.length)], shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const byLg = lg => L.filter(s => s.lg === lg), seen = new Set(), U = [], rounds = [], voice = {}, facts = [];
  const sh = p => p.short || p.name;
  let tries = 0;
  const fresh = (k) => (tries > 2500 || !used.has(k)) && !U.includes(k);
  const free = p => !seen.has(p.name), statsUsed = new Set();
  const off = R() < .5 ? 0 : 1, leagues = n => Array.from({ length: n }, (_, i) => (i + off) % 2 ? "NFL" : "NBA");   // NBA and NFL take turns
  const LGS = leagues(6);
  const want = { hol: 6, tf: 4, mc: 4, odd: 4 }[game];
  while (rounds.length < want && tries++ < 4000) {
    const i = rounds.length, pool = byLg(LGS[i % LGS.length]), unusedS = pool.filter(x => !statsUsed.has(x.key));
    const S = pick(unusedS.length && tries < 3000 ? unusedS : pool), P = S.players.filter(free), n0 = rounds.length;
    if (game === "hol") {
      if (P.length < 2) continue;
      const [A, B] = shuffle(P).slice(0, 2), k = `hol:${S.key}:${[A.name, B.name].sort().join("|")}`; if (!fresh(k) || A.v === B.v) continue;
      const hi = B.v > A.v, top = TOP[S.key] === B.name;
      rounds.push({ lg: S.lg, stat: S.label, a: { name: A.name, short: sh(A), v: A.v, c: A.c }, b: { name: B.name, short: sh(B), v: B.v, c: B.c },
        q: `Did <b>${sh(B)}</b> ${S.verb} <b>more</b> or <b>less</b>?`, ...(top ? { fact: `<b>${com(B.v)}</b> · the most ever` } : {}) });
      voice["q" + i] = `${A.name} ${S.past} ${com(A.v)} ${S.noun}. Did ${B.name} ${S.verb} more, or less?`;
      voice["r" + i] = `It's ${hi ? "higher" : "lower"}, ${sh(B)} finished with ${com(B.v)}${top ? ", the most ever" : ""}.`;
      facts.push(`${A.name} ${com(A.v)} vs ${B.name} ${com(B.v)} ${S.noun}`); seen.add(A.name); seen.add(B.name); U.push(k);
    } else if (game === "tf") {
      const truth = R() < .5, kind = R() < .55 ? "cmp" : "thr";
      if (kind === "cmp") {
        if (P.length < 2) continue;
        let [A, B] = shuffle(P).slice(0, 2); if (A.v === B.v) continue; if ((A.v > B.v) !== truth) [A, B] = [B, A];
        const k = `tf:${S.key}:${[A.name, B.name].sort().join("|")}`; if (!fresh(k)) continue;
        rounds.push({ type: "mc", tf: true, lg: S.lg, stat: S.label, q: `<b>${sh(A)}</b> ${S.past} more ${S.noun} than <b>${sh(B)}</b>`,
          opts: [{ t: "True" }, { t: "False" }], ans: truth ? 0 : 1, verdict: truth ? "True!" : "False!", fact: `<b>${sh(A)} ${com(A.v)}</b> · ${sh(B)} ${com(B.v)}` });
        voice["q" + i] = `${A.name} ${S.past} more ${S.noun} than ${B.name}, true or false?`;
        voice["r" + i] = `That's ${truth ? "true" : "false"}, ${sh(A)} finished with ${com(A.v)}, and ${sh(B)} with ${com(B.v)}.`;
        facts.push(`${A.name} ${com(A.v)} vs ${B.name} ${com(B.v)} ${S.noun}`); seen.add(A.name); seen.add(B.name); U.push(k);
      } else {
        if (!P.length) continue;
        const p = pick(P), st = p.v >= 20000 ? 5000 : p.v >= 5000 ? 1000 : 50;
        let T = truth ? Math.floor(p.v / st) * st : Math.ceil(p.v / st) * st; if (T === p.v || T <= 0) continue;
        const k = `tf:${S.key}:${p.name}:${T}`; if (!fresh(k)) continue;
        rounds.push({ type: "mc", tf: true, lg: S.lg, stat: S.label, q: `<b>${sh(p)}</b> ${S.past} more than <b>${com(T)}</b> ${S.noun}`,
          opts: [{ t: "True" }, { t: "False" }], ans: truth ? 0 : 1, verdict: truth ? "True!" : "False!", fact: `<b>${p.name}: ${com(p.v)}</b> ${S.noun}` });
        voice["q" + i] = `${p.name} ${S.past} more than ${com(T)} ${S.noun}, true or false?`;
        voice["r" + i] = `That's ${truth ? "true" : "false"}, ${sh(p)} finished with ${com(p.v)}.`;
        facts.push(`${p.name} ${com(p.v)} ${S.noun}`); seen.add(p.name); U.push(k);
      }
    } else if (game === "mc") {
      const sorted = S.players.slice().sort((a, b) => b.v - a.v), at = Math.floor(R() * Math.max(1, sorted.length - 6));
      const four = shuffle(sorted.slice(at, at + 7).filter(free)).slice(0, 4); if (four.length < 4) continue;
      const k = `mc:${S.key}:${four.map(p => p.name).sort().join("|")}`; if (!fresh(k)) continue;
      const best = four.reduce((a, b) => b.v > a.v ? b : a);
      rounds.push({ type: "mc", lg: S.lg, stat: S.label, q: `Who has the most <b>${S.noun}</b>?`, opts: four.map(p => ({ t: p.name, c: p.c, v: com(p.v) })),
        ans: four.indexOf(best), verdict: sh(best) + "!", fact: `<b>${best.name}: ${com(best.v)}</b> ${S.noun}` });
      voice["q" + i] = `Who has the most ${S.noun}: ${list(four.map(p => p.name))}?`;
      voice["r" + i] = `It's ${best.name}, with ${com(best.v)}.`;
      facts.push(four.map(p => `${p.name} ${com(p.v)}`).join(", ") + ` ${S.noun}`); four.forEach(p => seen.add(p.name)); U.push(k);
    } else if (game === "odd") {
      const sorted = S.players.slice().sort((a, b) => b.v - a.v), cut = 2 + Math.floor(R() * Math.max(1, sorted.length - 4));
      const T = nice(sorted[cut].v, sorted[cut + 1] ? sorted[cut + 1].v : 0); if (!T) continue;
      const over = shuffle(sorted.filter(p => p.v > T && free(p))).slice(0, 3), under = sorted.filter(p => p.v < T && free(p)).slice(0, 3);
      if (over.length < 3 || !under.length) continue;
      const odd = pick(under), four = shuffle([...over, odd]), k = `odd:${S.key}:${T}:${odd.name}`; if (!fresh(k)) continue;
      rounds.push({ type: "mc", lg: S.lg, stat: S.label, q: `Three of them ${S.past} over <b>${com(T)}</b> ${S.noun}. Who didn't?`, opts: four.map(p => ({ t: p.name, c: p.c, v: com(p.v) })),
        ans: four.indexOf(odd), verdict: sh(odd) + "!", fact: `<b>${odd.name}: ${com(odd.v)}</b> · under ${com(T)}` });
      voice["q" + i] = `Which of these four didn't ${S.verb} over ${com(T)} ${S.noun}: ${list(four.map(p => p.name))}?`;
      voice["r" + i] = `It's ${odd.name}, who finished with ${com(odd.v)}.`;
      facts.push(four.map(p => `${p.name} ${com(p.v)}`).join(", ") + ` ${S.noun} (line: ${com(T)})`); four.forEach(p => seen.add(p.name)); U.push(k);
    }
    if (rounds.length > n0) statsUsed.add(S.key);
  }
  if (rounds.length < want) throw new Error(`only made ${rounds.length} of ${want} ${game} rounds`);
  const G = { hol: ["Higher or lower", ["Higher", "or lower"], ["up", "dn"], "Here are six legends and six guesses, so keep score as you go: is it higher, or lower?"],
    tf: ["True or false", ["True", "or false"], ["yes", "no"], "Here are four legend stats, so keep score as you go: is it true, or false?"],
    mc: ["Who has more", ["Who has", "more?"], [], "Here are four questions on NBA and NFL legends, so keep score as you go: who has more?"],
    odd: ["Odd one out", ["Odd one", "out"], [], "It's Odd One Out, so find the legend who doesn't belong, and keep score as you go."] }[game];
  voice.hook = G[3]; voice.outro = "Comment how many you got, and follow for more!";
  const r0 = rounds[0], title = game === "hol" ? `Higher or Lower: ${r0.a.name} vs ${r0.b.name} 🏀🏈` : { tf: "True or False: NBA & NFL Legends 🏀🏈", mc: "Who Has More? NBA & NFL Legends Quiz 🏀🏈", odd: "Odd One Out: Can You Spot It? 🏀🏈" }[game];
  return { template: "hol.html", min: 62, gameName: G[0], hookWords: G[1], hookIcons: G[2], kicker: "NBA + NFL legends", thumbTag: "NBA + NFL legends",
    hookLine: "guess before the clock hits zero", source: "Regular-season career totals", rounds, voice, used: U,
    facts: ["Regular-season career totals of retired players (NBA-only for basketball), from Wikipedia's career-leader lists, checked against a second source.", ...facts],
    ytTitle: `${title} #shorts`, caption: `${title.replace(/ 🏀🏈$/, "")}? 🏀🏈 ${rounds.length} questions. Comment your score 👇\n\n#NBA #NFL #sportstrivia #${G[0].replace(/ /g, "")} #basketball #football`.replace("?? ", "? ") };
}

// ---------------- Liftoff: NASA's planetary fact sheet
function liftoff(game, day, used, R) {
  const B = JSON.parse(fs.readFileSync(path.join(HERE, "../space/game/planets.json"), "utf8")).bodies, PL = B.filter(b => !b.moon);
  const pick = a => a[Math.floor(R() * a.length)], shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nm = b => b.name, cap = s => s.charAt(0).toUpperCase() + s.slice(1), dn = b => b.short || b.name;   // dn: on screen ("Moon")
  const lc = s => /^(A|The) /.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const deg = b => `${b.temp < 0 ? "minus " + com(-b.temp) : com(b.temp)} degrees Fahrenheit`;
  const wt = b => Math.round(100 * b.grav / 32.1), yrs = b => b.orbit / 365.25;
  const orbitS = b => b.orbit > 700 ? { v: +yrs(b).toFixed(1), s: yrs(b).toFixed(1), u: "years", say: `about ${yrs(b).toFixed(1).replace(/\.0$/, "")} Earth years` } : { v: b.orbit, s: com(b.orbit), u: "days", say: `about ${com(b.orbit)} Earth days` };
  // each stat: who it applies to, the label, the value shown, and how she says it
  const ST = {
    diam: { at: b => `at about ${com(b.diam)} miles wide`, topic: "Size", lab: "Width", who: B, v: b => b.diam, u: "mi", say: b => `about ${com(b.diam)} miles wide`, more: "bigger", most: "the biggest", least: "the smallest" },
    temp: { at: b => `at about ${deg(b)} on average`, topic: "Temperature", lab: "Average temp", who: B, v: b => b.temp, u: "°F", say: b => `about ${b.temp < 0 ? "minus " + com(-b.temp) : com(b.temp)} degrees Fahrenheit on average`, more: "hotter", most: "the hottest", least: "the coldest" },
    dist: { at: b => `at about ${com(b.dist)} million miles from the Sun`, topic: "Distance", lab: "From the Sun", who: PL, v: b => b.dist, s: b => b.dist >= 100 ? com(b.dist) : b.dist.toFixed(1), u: "million mi", say: b => `about ${com(b.dist)} million miles from the Sun`, more: "farther from the Sun", most: "the farthest from the Sun", least: "the closest to the Sun" },
    wt: { at: b => `where a 100 pound person would weigh about ${wt(b)} pounds`, topic: "Gravity", lab: "100 lb on Earth weighs", who: B.filter(b => b.id !== "earth"), v: wt, u: "lb", say: b => `a 100 pound person would weigh about ${wt(b)} pounds on ${nm(b)}`, more: "heavier", most: "where you'd weigh the most", least: "where you'd weigh the least" },
    day: { at: b => `where a day lasts about ${b.day.toFixed(1).replace(/\.0$/, "")} hours`, topic: "Day length", lab: "One day", who: B.filter(b => b.day), v: b => b.day, s: b => b.day.toFixed(1), u: "hours", say: b => `a day on ${nm(b)} lasts about ${b.day.toFixed(1).replace(/\.0$/, "")} hours`, more: "longer", most: "the longest day", least: "the shortest day" }
  };
  const U = [], rounds = [], voice = {}, facts = [], seen = new Set(), keys = new Set();
  let tries = 0;
  const fresh = k => (tries > 2500 || !used.has(k)) && !U.includes(k);
  const want = { hol: 2, tf: 3, mc: 3, guess: 2 }[game], kinds = new Set();
  const newKey = (key, t) => t > 300 || !keys.has(key);   // a different stat each round (relaxed if it can't be done)
  let hookPlanet = null;
  while (rounds.length < want && tries++ < 4000) {
    const i = rounds.length;
    if (game === "hol") {
      const key = pick(["diam", "temp", "dist", "wt", "day"]), S = ST[key], [a, b] = shuffle(S.who.filter(x => !seen.has(x.id))).slice(0, 2);
      if (!a || !b || S.v(a) === S.v(b) || !newKey(key, tries)) continue;
      const k = `hol:${key}:${[a.id, b.id].sort().join("|")}`; if (!fresh(k)) continue; keys.add(key);
      const hi = S.v(b) > S.v(a), side = x => ({ icon: x.id, lab: S.lab, name: dn(x), v: S.v(x), u: S.u, ...(S.s ? { s: S.s(x) } : {}) });
      rounds.push({ topic: S.topic, a: side(a), b: side(b), q: `<b>${dn(b)}</b>: higher or lower than <b>${S.s ? S.s(a) : com(S.v(a))}${S.u === "°F" ? "°F" : " " + S.u}</b>?` });
      voice["q" + i] = `${cap(key === "wt" || key === "day" ? S.say(a) : nm(a) + " is " + S.say(a))}, so is ${nm(b)} higher, or lower?`;
      voice["r" + i] = `It's ${hi ? "higher" : "lower"}, ${lc(key === "wt" || key === "day" ? S.say(b) : nm(b) + " is " + S.say(b))}.`;
      facts.push(`${a.name}: ${S.lab} ${S.s ? S.s(a) : com(S.v(a))} ${S.u}; ${b.name}: ${S.s ? S.s(b) : com(S.v(b))} ${S.u}`); seen.add(a.id); seen.add(b.id); U.push(k); hookPlanet = hookPlanet || b.id;
    } else if (game === "tf") {
      const truth = R() < .5, kind = pick(["cmp", "cmp", "rings", "moons", "year", "wt"]);
      if (kinds.has(kind) && tries < 1500) continue;
      let text, say, fact, k, x, rsay;
      const fu = (S, z) => `${S.s ? S.s(z) : com(S.v(z))}${S.u === "°F" ? "°F" : " " + S.u}`;
      if (kind === "cmp") {
        const key = pick(["diam", "temp", "dist", "day"]), S = ST[key]; let [a, b] = shuffle(S.who.filter(z => !seen.has(z.id))).slice(0, 2);
        if (!a || !b || S.v(a) === S.v(b)) continue; if ((S.v(a) > S.v(b)) !== truth) [a, b] = [b, a];
        const phr = key === "day" ? `A day on ${nm(a)} is longer than a day on ${nm(b)}` : `${cap(nm(a))} is ${S.more} than ${nm(b)}`;
        text = phr; say = phr + "."; k = `tf:${key}:${[a.id, b.id].sort().join("|")}`; x = [a, b];
        fact = `<b>${dn(a)} ${fu(S, a)}</b> · ${dn(b)} ${fu(S, b)}`;
        rsay = key === "day" ? `${cap(S.say(a))}, and ${S.say(b)}.` : `${cap(nm(a))} is ${S.say(a)}, and ${nm(b)} is ${S.say(b)}.`;
        facts.push(`${a.name} ${S.v(a)} vs ${b.name} ${S.v(b)} (${S.lab}, ${S.u})`);
      } else if (kind === "rings") {
        const c = PL.filter(z => !seen.has(z.id) && z.rings === truth); if (!c.length) continue; const a = pick(c);
        text = `${a.name} has rings`; say = text + "."; k = `tf:rings:${a.id}`; x = [a]; fact = `<b>${a.name}</b> ${a.rings ? "has" : "has no"} rings`; rsay = `${a.name} ${a.rings ? "has" : "has no"} rings.`; facts.push(`${a.name} ring system: ${a.rings ? "yes" : "no"}`);
      } else if (kind === "moons") {
        const c = B.filter(z => z.moons != null && !seen.has(z.id) && (z.moons === 0) === truth); if (!c.length) continue; const a = pick(c);
        text = `${a.name} has no moons`; say = text + "."; k = `tf:moons:${a.id}`; x = [a];
        fact = `<b>${a.name}</b> has ${a.moons === 0 ? "no moons" : a.moons === 1 ? "one moon" : "two moons"}`; rsay = fact.replace(/<[^>]+>/g, "") + "."; facts.push(`${a.name} moons: ${a.moons}`);
      } else if (kind === "year") {
        let [a, b] = shuffle(PL.filter(z => !seen.has(z.id))).slice(0, 2); if (!a || !b) continue; if ((a.orbit > b.orbit) !== truth) [a, b] = [b, a];
        text = `A year on ${a.name} is longer than a year on ${b.name}`; say = text + "."; k = `tf:year:${[a.id, b.id].sort().join("|")}`; x = [a, b];
        const oa = orbitS(a), ob = orbitS(b); fact = `<b>${a.name} ${oa.s} ${oa.u}</b> · ${b.name} ${ob.s} ${ob.u}`; rsay = `A year on ${a.name} lasts ${oa.say}, and on ${b.name}, ${ob.say}.`; facts.push(`${a.name} orbit ${a.orbit} days, ${b.name} ${b.orbit} days`);
      } else {
        const c = B.filter(z => z.id !== "earth" && !seen.has(z.id) && (z.grav > 32.1) === truth); if (!c.length) continue; const a = pick(c);
        text = `You'd weigh more on ${nm(a)} than on Earth`; say = text + "."; k = `tf:wt:${a.id}`; x = [a];
        fact = `<b>100 lb on Earth = about ${wt(a)} lb</b> on ${dn(a)}`; rsay = `${cap(ST.wt.say(a))}.`; facts.push(`${a.name} gravity ${a.grav} ft/s2 vs Earth 32.1 ft/s2 (100 lb -> ${wt(a)} lb)`);
      }
      if (!fresh(k)) { facts.pop(); continue; }
      rounds.push({ type: "mc", tf: true, ids: x.map(z => z.id), topic: "True or false", q: text.replace(new RegExp(`\\b(${x.map(z => dn(z)).join("|")})\\b`, "g"), "<b>$1</b>"), opts: [{ t: "True" }, { t: "False" }], ans: truth ? 0 : 1, verdict: truth ? "True!" : "False!", fact });
      voice["q" + i] = `${say.replace(/\.$/, "")}, true or false?`;
      voice["r" + i] = `That's ${truth ? "true" : "false"}, ${lc(rsay)}`;
      x.forEach(z => seen.add(z.id)); U.push(k); kinds.add(kind); hookPlanet = hookPlanet || x[0].id;
    } else if (game === "mc") {
      const key = pick(["diam", "temp", "temp", "dist", "wt", "day"]), S = ST[key], dir = R() < .6 ? "most" : "least";
      if (!newKey(key, tries)) continue;
      const four = shuffle(S.who.filter(z => !seen.has(z.id))).slice(0, 4); if (four.length < 4) continue;
      const best = four.reduce((a, b) => (dir === "most" ? S.v(b) > S.v(a) : S.v(b) < S.v(a)) ? b : a);
      const k = `mc:${key}:${dir}:${four.map(z => z.id).sort().join("|")}`; if (!fresh(k)) continue; keys.add(key);
      const q = key === "wt" ? `Where would you weigh ${dir === "most" ? "the most" : "the least"}?` : key === "day" ? `Which has ${S[dir]}?` : `Which is ${S[dir]}?`;
      rounds.push({ type: "mc", topic: S.topic, q, opts: four.map(z => ({ t: dn(z), icon: z.id, v: `${S.s ? S.s(z) : com(S.v(z))}${S.u === "°F" ? "°F" : " " + S.u}` })), ans: four.indexOf(best),
        verdict: dn(best) + "!", fact: cap(key === "wt" || key === "day" ? S.say(best) : nm(best) + " is " + S.say(best)) + "." });
      voice["q" + i] = `${q.replace(/\?$/, "")}: ${list(four.map(nm))}?`;
      voice["r" + i] = `It's ${nm(best)}, ${S.at(best)}.`;
      facts.push(four.map(z => `${z.name} ${S.v(z)}`).join(", ") + ` (${S.lab}, ${S.u})`); U.push(k); hookPlanet = hookPlanet || best.id;
    } else if (game === "guess") {
      const left = PL.filter(z => !seen.has(z.id) && z.id !== "earth"); if (!left.length) break;
      const nw = left.filter(z => fresh(`guess:${z.id}`)), a = pick(nw.length ? nw : left), k = `guess:${a.id}`;
      const C = [`It's about ${com(Math.round(a.diam / 100) * 100)} miles wide.`, `Its average temperature is about ${a.temp < 0 ? "minus " + com(-a.temp) : com(a.temp)} degrees Fahrenheit.`,
        `A 100 pound person would weigh about ${wt(a)} pounds there.`];
      const late = [];
      if (a.day) late.push(`A day there lasts about ${a.day.toFixed(1).replace(/\.0$/, "")} hours.`);
      if (a.moons != null) late.push(`It has ${a.moons === 0 ? "no moons" : a.moons === 1 ? "one moon" : "two moons"}.`);
      if (a.rings) late.push("It has rings.");
      late.push(`A year there lasts ${orbitS(a).say}.`);
      const clues = [...shuffle(C).slice(0, 2), pick(late)];
      const four = shuffle([a, ...shuffle(PL.filter(z => z !== a)).slice(0, 3)]);
      rounds.push({ type: "mc", topic: "Guess the planet", clues: clues.map(c => c.replace(/ degrees Fahrenheit/, "°F").replace(/minus (\d)/, "-$1").replace(/\.$/, "")), opts: four.map(z => ({ t: z.name, icon: z.id })), ans: four.indexOf(a),
        verdict: a.name + "!", fact: `${a.name} is the ${ORD[a.order]} planet from the Sun` });
      voice["q" + i] = `${clues.join(" ")} Which planet is it?`;
      voice["r" + i] = `It's ${a.name}, the ${ORD[a.order]} planet from the Sun.`;
      facts.push(`${a.name}: diameter ${a.diam} mi, mean temp ${a.temp} F, gravity ${a.grav} ft/s2, day ${a.day || "-"} h, orbit ${a.orbit} days, moons ${a.moons ?? "-"}, rings ${a.rings}`);
      seen.add(a.id); U.push(k); hookPlanet = hookPlanet || a.id;
    }
  }
  if (rounds.length < want) throw new Error(`only made ${rounds.length} of ${want} ${game} rounds`);
  for (const r of rounds) if (r.fact) r.fact = r.fact.replace(/<[^>]+>/g, "");   // the "did you know" line is typed out as plain text
  const G = { hol: [["Higher", "or lower"], ["up", "dn"], ["Higher ▲", "or lower?"], "It's Higher or Lower, space edition, so try to beat the clock.", "Higher or Lower: Planet Edition 🪐"],
    tf: [["True", "or false"], ["yes", "no"], ["True", "or false?"], "It's True or False, space edition, so try to beat the clock.", "True or False: Space Edition 🪐"],
    mc: [["Which", "planet?"], [], ["Which", "planet?"], "Can you pick the right planet before the clock runs out?", "Which Planet? Space Quiz 🪐"],
    guess: [["Guess the", "planet"], [], ["Guess the", "planet"], `Can you guess the planet from three clues before the clock runs out?`, "Guess the Planet in 3 Clues 🪐"] }[game];
  voice.hook = G[3]; voice.outro = "Comment how many you got, and follow Liftoff for more.";
  return { template: "../space/hol.html", music: "../space/music", brand: "Liftoff", hookWords: G[0], hookIcons: G[1], thumbWords: G[2], thumbColor2: game === "tf" ? "var(--red)" : "var(--sol)",
    kicker: "Space edition", hookSub: `${rounds.length} rounds · beat the clock`, thumbSub: `${rounds.length} rounds · beat the clock`, hookPlanet: hookPlanet || "saturn", hs: "FACTS · NASA",
    source: "Source: NASA Planetary Fact Sheet", rounds, voice, used: U,
    facts: ["Every number: NASA Planetary Fact Sheet, US units (nssdc.gsfc.nasa.gov/planetary/factsheet/planet_table_british.html). Rounded as shown.", ...facts],
    ytTitle: `${G[4]} #shorts`, caption: `${G[4]} Comment your score 👇\n\nFacts: NASA Planetary Fact Sheet\n\n#space #NASA #planets #spacetrivia #astronomy #quiz` };
}

const GAMES = { crossover: ["hol", "tf", "mc", "odd"], liftoff: ["hol", "tf", "mc", "guess"] };
async function make(ch, day) {
  const idx = Math.floor(Date.parse(day + "T12:00:00Z") / 864e5), list2 = GAMES[ch];
  // the two channels are two games apart on any day, so the morning's quizzes are different games
  const game = process.env.GAME || list2[(idx + (ch === "liftoff" ? 2 : 0)) % list2.length];
  const used = await recent(ch === "crossover" ? "hol" : "space-hol", day), R = rng(ch + day + game);
  const D = (ch === "crossover" ? crossover : liftoff)(game, day, used, R);
  return { ...D, game, day, date: ET(day + "T16:00:00Z", { month: "short", day: "numeric" }) };
}
module.exports = { make };
if (require.main === module) (async () => {
  const [ch, out, dayArg] = process.argv.slice(2), day = dayArg || ET(Date.now(), { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
  if (!GAMES[ch]) { console.error("channel must be crossover or liftoff"); process.exit(2); }
  const D = await make(ch, day);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(D, null, 1));
  console.log(`${ch} ${day}: ${D.game} · ${D.ytTitle}`); for (const [k, v] of Object.entries(D.voice)) console.log(`  ${k}: ${v}`);
})().catch(e => { console.error(e); process.exit(1); });
