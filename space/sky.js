/* LIFTOFF space report (@liftoffnews): the day's space data turned into what space.html draws and what the narrator says.
   Asteroid flybys (NASA JPL close-approach data), the northern lights forecast (NOAA SWPC Kp), the Sun (NOAA GOES
   flares, NASA SDO image), upcoming launches (The Space Devs Launch Library), and the Moon (phase computed here).
   Picks the most dramatic story for the hook. Every number on screen comes from those feeds.
   usage: node sky.js out/data.json [YYYY-MM-DD]     (downloads the Sun and aurora images next to data.json) */
"use strict";
const fs = require("fs"), path = require("path");
const UA = { headers: { "User-Agent": "Mozilla/5.0 (liftoff space report)" } };
async function get(u, tries = 3) { for (let i = 0; ; i++) { try { const r = await fetch(u, UA); if (!r.ok) throw new Error(r.status + " " + u); return await r.json(); } catch (e) { if (i >= tries - 1) throw e; await new Promise(r => setTimeout(r, 2000 * (i + 1))); } } }
async function save(u, f) { try { const r = await fetch(u, UA); if (!r.ok) throw new Error(r.status); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f; } catch (e) { console.error("image", u, e.message); return null; } }
const ET = (d, o) => new Date(d).toLocaleString("en-US", Object.assign({ timeZone: "America/New_York" }, o));
const etDay = d => ET(d, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");
const fmtTime = d => ET(d, { hour: "numeric", minute: "2-digit" }).replace(":00", "");
const comma = x => Math.round(x).toLocaleString("en-US");
const r1 = x => Math.round(x * 10) / 10;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const w2 = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
// "2025 UK9" read the way astronomers say it: "twenty twenty-five U K nine"
const sayDes = des => String(des).replace(/^(\d{2})(\d{2}) ([A-Z]{2})(\d*)$/, (m, a, b, L, n) => `${w2(+a)} ${+b < 10 ? "oh " + ONES[+b] : w2(+b)} ${L.split("").join(" ")}${n ? " " + n : ""}`);
// relative day words for the narrator, from the video's date (ET)
function when(d, today) {
  const a = new Date(etDay(d) + "T12:00:00Z"), b = new Date(today + "T12:00:00Z"), k = Math.round((a - b) / 864e5), h = +ET(d, { hour: "numeric", hour12: false }) % 24;
  if (k <= 0) return h >= 17 || h < 4 ? "tonight" : "today";
  if (k === 1) return h >= 18 ? "tomorrow night" : h < 4 ? "late tonight" : "tomorrow";
  if (k < 7) return h < 5 ? "early " + ET(d, { weekday: "long" }) + " morning" : "on " + ET(d, { weekday: "long" }) + (h >= 18 ? " night" : "");
  return "on " + ET(d, { month: "long", day: "numeric" });
}

// on-screen "did you know" lines, typed out in the video (timeless, checked facts; one picked per day)
const FACTS = {
  ast: ["NASA's Planetary Defense Coordination Office tracks near-Earth objects around the clock.", "One lunar distance is about 238,900 miles, the average gap between Earth and the Moon.",
    "Most shooting stars are made by bits of space dust smaller than a grain of sand.", "In 2022, NASA's DART spacecraft changed an asteroid's orbit by crashing into it on purpose."],
  aur: ["Auroras happen when charged particles from the Sun hit gases high in our atmosphere.", "Green aurora light comes from oxygen. Purple and blue come from nitrogen.",
    "Phone cameras often pick up auroras better than your eyes do.", "The Kp index runs from 0 to 9. The higher it goes, the farther south auroras can reach."],
  sun: ["Sunlight takes about 8 minutes to reach Earth.", "Each flare class is 10 times stronger than the one before it: A, B, C, M, then X.",
    "About 109 Earths would fit across the face of the Sun.", "The Sun's activity rises and falls on a cycle of about 11 years."],
  lau: ["To stay in low Earth orbit, a spacecraft has to move about 17,500 miles per hour.", "Launching toward the east gives rockets a free boost from Earth's spin.",
    "The International Space Station circles Earth about every 90 minutes.", "SpaceX lands and reuses the first stage of its Falcon 9 rockets."],
  moon: ["The Moon is slowly drifting away from Earth, about 1.5 inches every year.", "We always see the same side of the Moon from Earth.",
    "The Moon's gravity is about one-sixth of Earth's.", "A full lunar cycle, new moon to new moon, takes about 29.5 days."] };
const factFor = (k, day) => { const L = FACTS[k]; let h = 7; for (const c of day + k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return L[h % L.length]; };

// ---------- asteroids
const AU_MI = 92955807, LD = 0.00256955529;
const REFS = [["a car", 4.5, "car"], ["a school bus", 12, "bus"], ["a blue whale", 30, "whale"], ["a Boeing 747", 70, "plane"], ["a football field", 110, "field"],
  ["the Eiffel Tower", 330, "tower"], ["the Empire State Building", 443, "tower2"]];
function refFor(m) { let best = REFS[0]; for (const r of REFS) if (Math.abs(Math.log(m / r[1])) < Math.abs(Math.log(m / best[1]))) best = r; return { name: best[0], m: best[1], icon: best[2] }; }
const ft = m => m * 3.281;
async function asteroids() {
  const d = await get("https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B10&dist-max=0.05&diameter=true&fullname=true&sort=dist");
  const F = d.fields || [], at = (r, k) => r[F.indexOf(k)];
  return (d.data || []).map(r => {
    const [y, mo, dd, hm] = String(at(r, "cd")).split(/[- ]/), date = new Date(`${dd} ${mo} ${y} ${hm} UTC`);
    const H = +at(r, "h"), dia = +at(r, "diameter"), mid = dia ? dia * 1000 : 1329e3 / Math.sqrt(.14) * Math.pow(10, -H / 5);
    const lo = dia ? mid : 1329e3 / Math.sqrt(.25) * Math.pow(10, -H / 5), hi = dia ? mid : 1329e3 / Math.sqrt(.05) * Math.pow(10, -H / 5);
    const dist = +at(r, "dist"), v = +at(r, "v_rel"), sg = String(at(r, "t_sigma_f") || ""), sm = sg.match(/(?:(\d+)_)?(\d+):(\d+)/);
    const sigmaMin = /^</.test(sg.trim()) ? 1 : sm ? (+(sm[1] || 0)) * 1440 + (+sm[2]) * 60 + (+sm[3]) : 9999;
    return { des: String(at(r, "des")), date: date.toISOString(), ld: dist / LD, ldMax: +at(r, "dist_max") / LD, miles: dist * AU_MI, minMiles: +at(r, "dist_min") * AU_MI,
      mph: v * 2236.94, m: mid, lo, hi, H, known: !!dia, sigmaMin };
  }).filter(a => isFinite(a.ld));
}

// ---------- aurora (Kp forecast for tonight, 7pm-7am ET)
const VIEW = [[0, "Alaska and far northern Canada"], [4, "Alaska, Canada, and the northern edge of Montana, North Dakota and Minnesota"],
  [5, "the northern US: Washington, Montana, the Dakotas, Minnesota, Michigan and Maine"], [6, "as far south as Oregon, Wyoming, Wisconsin and New York"],
  [7, "as far south as Iowa, Illinois, Pennsylvania and northern California"], [8, "as far south as Missouri, Kentucky and Virginia"], [9, "as far south as Texas and Alabama"]];
const SHORT = { 0: "Alaska", 4: "the northern border", 5: "Minnesota and Michigan", 6: "New York and Wisconsin", 7: "Iowa and Pennsylvania", 8: "Missouri and Virginia", 9: "Texas and Alabama" };
async function aurora(today) {
  const d = await get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json");
  const rows = Array.isArray(d[0]) ? d.slice(1).map(r => ({ time_tag: r[0], kp: +r[1], observed: r[2], noaa_scale: r[3] })) : d;
  const s = Date.parse(today + "T23:00:00Z"), e = s + 12 * 36e5;   // 7pm to 7am Eastern (daylight time; close enough in winter)
  const night = rows.filter(r => { const t = Date.parse(r.time_tag + "Z"); return t >= s - 36e5 && t <= e; });
  const kp = Math.max(0, ...night.map(r => +r.kp)), k = Math.floor(kp + .34);
  const v = VIEW.filter(x => x[0] <= k).pop();
  const curve = rows.filter(r => { const t = Date.parse(r.time_tag + "Z"); return t >= s - 24 * 36e5 && t <= e + 24 * 36e5; }).map(r => ({ t: r.time_tag, kp: +r.kp, p: r.observed }));
  const gN = Math.max(0, ...night.map(r => +(String(r.noaa_scale || "").match(/G(\d)/) || [0, 0])[1]));
  const gK = k >= 5 ? Math.min(5, k - 4) : 0, g = Math.max(gN, gK);
  if (gN !== gK) console.error(`aurora: NOAA scale G${gN} vs Kp-derived G${gK}; using G${g}`);
  return { kp: r1(kp), k, g: g ? "G" + g : "", where: v[1], short: SHORT[v[0]], curve };
}

// ---------- the Sun
const FL = { A: 1e-8, B: 1e-7, C: 1e-6, M: 1e-5, X: 1e-4 };
const flux = c => { const m = String(c || "").match(/^([ABCMX])([\d.]+)/); return m ? FL[m[1]] * parseFloat(m[2]) : 0; };
async function sun() {
  const f = await get("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json");
  const sc = await get("https://services.swpc.noaa.gov/products/noaa-scales.json").catch(() => ({}));
  const now = Date.now(), day = f.filter(x => now - Date.parse(x.max_time) < 24 * 36e5), best = L => L.slice().sort((a, b) => flux(b.max_class) - flux(a.max_class))[0];
  const b24 = best(day), b7 = best(f), p = sc["1"] || {};
  return { b24: b24 ? { cls: b24.max_class, t: b24.max_time } : null, b7: b7 ? { cls: b7.max_class, t: b7.max_time } : null, n24: day.length,
    mProb: +((p.R || {}).MinorProb || 0), xProb: +((p.R || {}).MajorProb || 0), now: sc["0"] || {} };
}

// ---------- launches
const STATES = { CA: "California", FL: "Florida", TX: "Texas", VA: "Virginia", AK: "Alaska", NM: "New Mexico" };
const place = l => { const m = String(l || "").match(/^(.+?)(?: SFB| SFS| AFB| Space Force Station)?, ([A-Z]{2}), USA$/); if (m) return `${m[1].replace(/ Launch Complex.*$/, "")}, ${STATES[m[2]] || m[2]}`;
  return String(l || "").replace(/, (People's Republic of )?China$/, ", China").replace(/^Rocket Lab Launch Complex 1, Mahia Peninsula, /, "Mahia, "); };
const PROV = { "Indian Space Research Organization": "ISRO", "China Aerospace Science and Technology Corporation": "China", "Russian Federal Space Agency (ROSCOSMOS)": "Roscosmos",
  "National Aeronautics and Space Administration": "NASA", "United Launch Alliance": "ULA", "Japan Aerospace Exploration Agency": "JAXA", "Mitsubishi Heavy Industries": "Mitsubishi" };
async function launches() {
  const d = await get("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=normal");
  const now = Date.now();
  return (d.results || []).filter(r => Date.parse(r.net) > now - 36e5 && Date.parse(r.net) < now + 8 * 864e5 && /Go|TBC|TBD/.test((r.status || {}).abbrev || ""))
    .map(r => { const [rocket, mission] = String(r.name).split(" | "), prov = (r.launch_service_provider || {}).name || "";
      const crew = /crew|astronaut|soyuz ms|shenzhou|axiom/i.test(r.name + " " + ((r.mission || {}).type || ""));
      return { rocket: (rocket || "").replace(/ Block 5$/, ""), mission: mission || "", prov: PROV[prov] || prov, net: r.net, loc: place((r.pad || {}).location && r.pad.location.name),
        orbit: ((r.mission || {}).orbit || {}).abbrev || "", type: (r.mission || {}).type || "", crew,
        dayOnly: /day|week|month|quarter|half|year/i.test(((r.net_precision || {}).name) || ""), url: r.url || "", star: /starlink/i.test(mission || ""), tbd: /TBD|TBC/.test((r.status || {}).abbrev || "") }; }).slice(0, 3);
}

// ---------- the Moon (Meeus, Astronomical Algorithms ch. 49: new and full moon times to within minutes)
function phaseJD(k, full) {
  const T = k / 1236.85, rad = Math.PI / 180, E = 1 - .002516 * T - .0000074 * T * T;
  const M = (2.5534 + 29.1053567 * k) * rad, Mp = (201.5643 + 385.81693528 * k + .0107582 * T * T) * rad, F = (160.7108 + 390.67050284 * k - .0016118 * T * T) * rad, O = (124.7746 - 1.56375588 * k) * rad;
  let jd = 2451550.09766 + 29.530588861 * k + .00015437 * T * T;
  const c = full ? [-.40614, .17302, .01614, .01043, .00734, -.00515, .00209] : [-.4072, .17241, .01608, .01039, .00739, -.00514, .00208];
  jd += c[0] * Math.sin(Mp) + c[1] * E * Math.sin(M) + c[2] * Math.sin(2 * Mp) + c[3] * Math.sin(2 * F) + c[4] * E * Math.sin(Mp - M) + c[5] * E * Math.sin(Mp + M) + c[6] * E * E * Math.sin(2 * M)
    - .00111 * Math.sin(Mp - 2 * F) - .00057 * Math.sin(Mp + 2 * F) + .00056 * E * Math.sin(2 * Mp + M) - .00042 * Math.sin(3 * Mp) + .00042 * E * Math.sin(M + 2 * F)
    + .00038 * E * Math.sin(M - 2 * F) - .00024 * E * Math.sin(2 * Mp - M) - .00017 * Math.sin(O);
  return new Date((jd - 2440587.5) * 864e5 - 69e3);
}
const NAMES = ["Wolf", "Snow", "Worm", "Pink", "Flower", "Strawberry", "Buck", "Sturgeon", "Corn", "Hunter's", "Beaver", "Cold"];
function moon(at) {
  const t = at.getTime(), k0 = Math.floor((at.getUTCFullYear() + at.getUTCMonth() / 12 - 2000) * 12.3685) - 2;
  let lastNew = null, nextNew = null, nextFull = null, prevFull = null;
  for (let k = k0; k < k0 + 6; k++) { const n = phaseJD(k, false), f = phaseJD(k + .5, true);
    if (n <= at) lastNew = n; else if (!nextNew) nextNew = n; if (f > at && !nextFull) nextFull = f; if (f <= at) prevFull = f; }
  const age = (t - lastNew) / 864e5, frac = age / 29.530588853, illum = Math.round((1 - Math.cos(2 * Math.PI * frac)) / 2 * 100);
  const PH = [[1.85, "New Moon"], [5.54, "Waxing Crescent"], [9.23, "First Quarter"], [12.92, "Waxing Gibbous"], [16.61, "Full Moon"], [20.3, "Waning Gibbous"], [23.99, "Last Quarter"], [27.68, "Waning Crescent"], [99, "New Moon"]];
  // the full moon nearest the September equinox is the Harvest Moon; the one after it, the Hunter's Moon
  const y = nextFull.getUTCFullYear(), eq = Date.UTC(y, 8, 22, 18), fulls = []; for (let k = Math.floor((y - 2000 + .55) * 12.3685) - 2; k < Math.floor((y - 2000 + .9) * 12.3685) + 2; k++) fulls.push(phaseJD(k + .5, true));
  const harvest = fulls.sort((a, b) => Math.abs(a - eq) - Math.abs(b - eq))[0], hunters = fulls.filter(f => f > harvest).sort((a, b) => a - b)[0];
  const nameOf = F => { const mo = +ET(F, { month: "numeric" }) - 1;
    return Math.abs(F - harvest) < 2 * 864e5 ? "Harvest" : hunters && Math.abs(F - hunters) < 2 * 864e5 ? "Hunter's" : NAMES[mo]; };
  const name = nameOf(nextFull);
  // "full moon tonight" only when a full moon actually falls within 18 hours of this evening, named for that full moon
  const near = [prevFull, nextFull].filter(Boolean).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))[0], fullTonight = !!near && Math.abs(near - at) < 18 * 36e5;
  let phase = PH.find(p => age < p[0])[1]; if (phase === "Full Moon" && !fullTonight) phase = frac < .5 ? "Waxing Gibbous" : "Waning Gibbous";
  return { age: r1(age), frac: +frac.toFixed(4), illum, phase, waxing: frac < .5, nextFull: nextFull.toISOString(), fullName: name, fullTonight, tonightName: fullTonight ? nameOf(near) : "", nextNew: nextNew.toISOString() };
}

// the US Naval Observatory's own phase times and illumination: if they disagree with the math above, theirs win
async function usno(today, MO) {
  try {
    const p = await get(`https://aa.usno.navy.mil/api/moon/phases/date?date=${today}&nump=4`), full = (p.phasedata || []).find(x => x.phase === "Full Moon");
    if (full) { const f = new Date(Date.UTC(full.year, full.month - 1, full.day, ...full.time.split(":").map(Number)));
      if (Math.abs(f - new Date(MO.nextFull)) > 3 * 36e5) { console.error("moon: USNO full moon", f.toISOString(), "vs", MO.nextFull, "- using USNO"); MO.nextFull = f.toISOString(); } }
    const o = await get(`https://aa.usno.navy.mil/api/rstt/oneday?date=${today}&coords=40.71,-74.01&tz=-4`), fi = parseInt(((o.properties || {}).data || {}).fracillum);
    if (isFinite(fi) && Math.abs(fi - MO.illum) > 3) { console.error("moon: USNO illumination", fi, "vs", MO.illum, "- using USNO"); MO.illum = fi; }
    MO.checked = true;
  } catch (e) { console.error("moon: USNO check unavailable,", e.message); }
  return MO;
}
// last line of defence: anything outside what's physically plausible is dropped rather than posted
function sane(S) {
  const bad = [], ok = (k, c) => { if (!c) { bad.push(k); delete S[k]; } };
  if (S.ast) ok("ast", S.ast.ld > 0 && S.ast.ld < 25 && S.ast.mph > 1000 && S.ast.mph < 160000 && S.ast.ft > 1 && S.ast.ft < 70000 && S.ast.miles > 4000);
  if (S.aur) ok("aur", S.aur.kp >= 0 && S.aur.kp <= 9);
  if (S.sun) ok("sun", !S.sun.c24 || /^[ABCMX]\d/.test(S.sun.c24));
  if (S.lau) ok("lau", S.lau.items.length > 0 && S.lau.items.every(l => Date.parse(l.net) > Date.now() - 36e5 && l.rocket));
  if (S.moon) ok("moon", S.moon.illum >= 0 && S.moon.illum <= 100);
  if (bad.length) console.error("dropped (failed sanity check):", bad.join(", "));
}
async function build(today, outDir, brand) {
  const imgDir = path.join(outDir, "img"); fs.mkdirSync(imgDir, { recursive: true });
  const safe = async (f, name) => { try { return await f(); } catch (e) { console.error(name + ":", e.message); return null; } };
  const [A, AU, SU, LA] = await Promise.all([safe(asteroids, "asteroids"), safe(() => aurora(today), "aurora"), safe(sun, "sun"), safe(launches, "launches")]);
  const MO = await usno(today, moon(new Date(today + "T23:30:00Z")));
  const sunImg = await save("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg", path.join(imgDir, "sun.jpg"));
  const aurImg = await save("https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg", path.join(imgDir, "aurora.jpg"));
  const S = {}, V = {}, score = {}, hooks = [], QH = {}, QV = {};   // QH/QV: each story's own hook and short read, for the quick hits

  // asteroid: the most notable flyby (big and close), plus how many are passing
  const AS = (A || []).filter(a => a.minMiles > 10000);   // anything that could come within 10,000 miles is too big a claim to automate: skipped
  if (AS.length) {
    const pickA = AS.slice().sort((a, b) => (Math.log10(b.m) - 1.3 * Math.log10(b.ld) + (b.ld < 1 ? 1 : 0)) - (Math.log10(a.m) - 1.3 * Math.log10(a.ld) + (a.ld < 1 ? 1 : 0)))[0];
    const a = pickA, ref = refFor(a.m), w0 = when(a.date, today), w = a.sigmaMin > 360 ? "around " + w0.replace(/^on /, "") : w0, feet = ft(a.m), mi = Math.round(a.miles / 1000) * 1000, us = Math.max(1, Math.round(2800 / a.mph * 60));
    const sizeSay = a.known ? (feet < 1000 ? `about ${comma(Math.round(feet))} feet wide` : `about ${r1(a.m / 1609)} miles wide`) : feet < 100 ? `an estimated ${Math.round(feet)} feet wide` : feet < 1000 ? `an estimated ${comma(Math.round(feet / 10) * 10)} feet wide` : `an estimated ${r1(a.m / 1609)} miles wide`;
    const closer = a.ldMax < 1;   // only "closer than the Moon" when even JPL's farthest estimate is inside the Moon's distance
    const dist = closer ? `That's closer than the Moon, only about ${Math.round(a.ld * 100)} percent of the way there!` : a.ld < 1.05 ? `That's about as far as the Moon.` : a.ld < 2 ? `That's just ${r1(a.ld)} times the distance to the Moon.` : `That's about ${Math.round(a.ld)} times the distance to the Moon.`;
    S.ast = { kind: "ast", id: "ast", des: a.des, when: ET(a.date, { weekday: "short", month: "short", day: "numeric" }).toUpperCase(), closer,
      time: a.sigmaMin <= 30 ? fmtTime(a.date) + " ET" : a.sigmaMin <= 360 ? "± " + Math.ceil(a.sigmaMin / 60) + " HR" : "TIME ± " + Math.ceil(a.sigmaMin / 1440) + " DAY",
      ld: +a.ld.toFixed(2), miles: mi, mph: Math.round(a.mph / 100) * 100, ft: Math.round(feet), loFt: Math.round(ft(a.lo)), hiFt: Math.round(ft(a.hi)), ref, us, count: AS.length,
      list: AS.slice(0, 5).map(x => ({ des: x.des, ld: +x.ld.toFixed(2), ft: Math.round(ft(x.m)), when: ET(x.date, { month: "short", day: "numeric" }) })) };
    V.ast = `Asteroid watch! ${cap(w)}, asteroid ${sayDes(a.des)} will fly past Earth at about ${comma(mi)} miles away. ${dist} It's ${sizeSay}, about the size of ${ref.name}, ` +
      `and it's moving at ${comma(Math.round(a.mph / 100) * 100)} miles per hour, fast enough to cross the entire United States in ${us === 1 ? "one minute" : "about " + us + " minutes"}. ` +
      `Don't worry, it will safely miss us. ${AS.length > 1 ? `In all, ${AS.length} asteroids will pass within twenty Moon distances of Earth over the next ten days.` : ""}`;
    score.ast = closer ? 10 : a.m >= 150 && a.ld < 10 ? 6 : 3;
    if (closer) hooks.push([10, "ast", `An asteroid the size of ${ref.name} will pass closer to Earth than the Moon ${w}!`, { big: comma(mi), unit: "Miles from Earth", kicker: "Closer than the Moon", sub: `Asteroid ${a.des} · ${S.ast.when}` }]);
    else if (a.m >= 150) hooks.push([6, "ast", `An asteroid bigger than ${ref.name} is about to fly past Earth!`, { big: comma(Math.round(feet)), unit: "Feet wide", kicker: "Asteroid flyby", sub: `${a.des} · ${S.ast.when}` }]);
    QH.ast = [closer ? `An asteroid the size of ${ref.name} will pass closer to Earth than the Moon ${w}!` : `An asteroid the size of ${ref.name} is flying past Earth ${w}!`,
      { big: comma(mi), unit: "Miles from Earth", kicker: closer ? "Closer than the Moon" : "Asteroid flyby", sub: `${a.des} · ${S.ast.when}` }];
    QV.ast = `It's ${sizeSay}, moving at ${comma(Math.round(a.mph / 100) * 100)} miles per hour. ${dist} Don't worry, it will safely miss us.`;
    hooks.push([2, "ast", `${cap(w2(AS.length))} asteroids will fly past Earth in the next ten days!`, { big: String(AS.length), unit: "Asteroids flying by", kicker: "Next 10 days", sub: `Closest: ${AS[0].des}` }]);
  }
  // northern lights
  if (AU) {
    const k = AU.k;
    S.aur = { kind: "aur", id: "aur", kp: AU.kp, k, g: AU.g, where: AU.where, short: AU.short, img: aurImg ? "file://" + path.resolve(aurImg) : "", curve: AU.curve };
    V.aur = k >= 5 ? `Northern lights alert! NOAA is forecasting a Kp of ${AU.kp} tonight, a ${AU.g} geomagnetic storm. With dark, clear skies, the aurora could be visible ${/^as far/.test(AU.where) ? AU.where : "across " + AU.where}. Look north after dark!`
      : k === 4 ? `The northern lights are active tonight, with a Kp of ${AU.kp}. Best chances are in ${AU.where}. Look north after dark.`
      : `For the northern lights, it's a quiet night, with a Kp of ${AU.kp}. Your best chances are in ${AU.where}.`;
    score.aur = k >= 7 ? 10 : k >= 5 ? 8 : k === 4 ? 4 : 1;
    QH.aur = k >= 5 ? [`The northern lights could be visible as far south as ${AU.short} tonight!`, { big: "KP " + AU.kp, unit: AU.g + " geomagnetic storm", kicker: "Aurora alert", sub: "Tonight · look north" }]
      : [`Can you see the northern lights tonight? Here's the forecast.`, { big: "KP " + AU.kp, unit: "Tonight's forecast", kicker: "Aurora forecast", sub: "NOAA · tonight" }];
    QV.aur = k >= 5 ? `NOAA is forecasting a Kp of ${AU.kp} tonight, a ${AU.g} geomagnetic storm. Find a dark spot away from city lights, and look north after dark!` : V.aur;
    if (k >= 5) hooks.push([k >= 7 ? 11 : 8, "aur", `The northern lights could be visible as far south as ${AU.short} tonight!`, { big: "KP " + AU.kp, unit: AU.g + " geomagnetic storm", kicker: "Aurora alert", sub: "Tonight · look north" }]);
  }
  // the Sun
  if (SU) {
    const c24 = SU.b24 && SU.b24.cls, c7 = SU.b7 && SU.b7.cls, big = flux(c24);
    S.sun = { kind: "sun", id: "sun", img: sunImg ? "file://" + path.resolve(sunImg) : "", c24: c24 || "", c7: c7 || "", t7: SU.b7 ? ET(SU.b7.t, { month: "short", day: "numeric" }) : "", n24: SU.n24, m: SU.mProb, x: SU.xProb };
    const say = c => String(c).replace(/^([ABCMX])([\d.]+)$/, (m, L, n) => `${L} ${n}`);
    V.sun = big >= 1e-4 ? `The Sun just erupted with a powerful ${say(c24)} solar flare, the strongest class there is! Strong flares like this can cause radio blackouts on the sunny side of Earth.`
      : big >= 1e-5 ? `The Sun fired off an ${say(c24)} flare in the last day. That's a moderate flare, strong enough to cause brief radio blackouts.`
      : `The Sun has been fairly calm, with ${SU.n24 === 1 ? "one small flare" : SU.n24 + " small flares"} in the last day${c24 ? `, the biggest a ${say(c24)}` : ""}.`;
    V.sun += ` NOAA gives a ${SU.mProb} percent chance of M-class flares${SU.xProb ? ` and a ${SU.xProb} percent chance of an X-class flare` : ""} over the next day.`;
    score.sun = big >= 1e-4 ? 9 : big >= 5e-5 ? 6 : big >= 1e-5 ? 4 : 1;
    QH.sun = big >= 1e-5 ? [`The Sun just fired off ${big >= 1e-4 ? "a powerful X-class" : "an M-class"} solar flare!`, { big: c24, unit: "Solar flare", kicker: "Solar flare alert", sub: "Last 24 hours" }]
      : [`This is what the Sun looks like right now.`, { big: c24 || "CALM", unit: c24 ? "Biggest flare today" : "Solar activity", kicker: "Space weather", sub: "NASA SDO · today" }];
    QV.sun = big >= 1e-5 ? `It was an ${say(c24)}${big >= 1e-4 ? ", the strongest class there is" : ""}, strong enough to cause radio blackouts on the sunny side of Earth. NOAA gives a ${SU.mProb} percent chance of more M-class flares over the next day.` : V.sun;
    if (big >= 1e-4) hooks.push([9, "sun", `The Sun just fired off a powerful X-class solar flare!`, { big: c24, unit: "Solar flare", kicker: "Solar flare alert", sub: "Strongest flare class" }]);
  }
  // launches
  if (LA && LA.length) {
    S.lau = { kind: "lau", id: "lau", items: LA.map(l => ({ ...l, day: ET(l.net, { weekday: "short", month: "short", day: "numeric" }).toUpperCase(), time: l.dayOnly ? "TIME TBD" : fmtTime(l.net) + " ET" })) };
    const one = (l, i) => { const w = l.dayOnly ? "on " + ET(l.net, { weekday: "long" }) : when(l.net, today), m = l.mission.replace(/\s*\(.*?\)\s*/g, " ").trim();
      // code-like names (IRNSS-1L, USSF-432) are read as what the mission is instead
      const what = l.star ? "a batch of Starlink satellites" : l.crew ? `the ${m} crew` : /[A-Z]{3,}|\d/.test(m) ? (l.type ? `a ${l.type.toLowerCase()} mission` : "a satellite") : m;
      const art = /^[aeiou]/i.test(l.rocket) ? "an " : "a ";
      return `${i === 0 ? cap(w) : w === when(LA[i - 1].net, today) ? "Then" : cap(w)},${l.tbd ? " if the date holds," : ""} ${l.prov} is scheduled to launch ${what} on ${art}${l.rocket} from ${l.loc}.`; };
    V.lau = `Launch schedule! ${LA.map(one).join(" ")} Launch times can slip, so check before you watch.`;
    score.lau = LA.some(l => l.crew) ? 7 : LA.some(l => !l.star) ? 3 : 2;
    { const l = LA[0], w = l.dayOnly ? "on " + ET(l.net, { weekday: "long" }) : when(l.net, today), it = S.lau.items[0];
      QH.lau = [`${l.prov} is launching ${l.star ? "more Starlink satellites" : l.crew ? "astronauts" : "a " + l.rocket} ${w}!`, { big: l.dayOnly ? it.day.split(" ")[0].replace(",", "") : it.time.replace(" ET", ""), unit: l.dayOnly ? "Launch day" : "Eastern · " + it.day.replace(",", ""), kicker: "Launch alert", sub: `${l.rocket} · ${l.loc}` }];
      QV.lau = `${one(l, 0)} Launch times can slip, so check before you watch.`; }
    const cr = LA.find(l => l.crew); if (cr) hooks.push([7, "lau", `Astronauts are launching ${when(cr.net, today)}!`, { big: "LIFTOFF", unit: cr.rocket, kicker: "Crew launch", sub: S.lau.items[LA.indexOf(cr)].day }]);
  }
  // the Moon
  {
    const nf = new Date(MO.nextFull), dTo = Math.round((nf - new Date(today + "T23:30:00Z")) / 864e5);
    S.moon = { kind: "moon", id: "moon", ...MO, full: ET(nf, { weekday: "short", month: "short", day: "numeric" }).toUpperCase(), dTo };
    V.moon = MO.fullTonight ? `And look up tonight: it's the full ${MO.tonightName} Moon, ${MO.illum} percent lit!`
      : `Tonight's Moon is a ${MO.phase.toLowerCase()}, ${MO.illum} percent lit. The next full moon, the ${MO.fullName} Moon, rises ${dTo <= 1 ? when(nf, today) : "on " + ET(nf, { weekday: "long", month: "long", day: "numeric" })}.`;
    score.moon = MO.fullTonight ? 6 : dTo <= 1 ? 4 : 1;
    QH.moon = MO.fullTonight ? [`Tonight's full ${MO.tonightName} Moon is one you don't want to miss!`, { big: MO.illum + "%", unit: `Full ${MO.tonightName} Moon`, kicker: "Tonight", sub: "Look east at sunset" }]
      : [`Tonight's Moon is ${MO.illum} percent lit. Here's what's next.`, { big: MO.illum + "%", unit: MO.phase, kicker: "Moon tonight", sub: `Next full: ${S.moon.full}` }];
    QV.moon = V.moon;
    if (MO.fullTonight) hooks.push([6, "moon", `Tonight's full ${MO.tonightName} Moon is one you don't want to miss!`, { big: MO.illum + "%", unit: `Full ${MO.tonightName} Moon`, kicker: "Tonight", sub: "Look east at sunset" }]);
  }
  // the typed readouts (raw numbers, mission-control style) and the day's fact for each panel
  if (S.ast) { const a = AS.find(x => x.des === S.ast.des); S.ast.read = `OBJ ${a.des} · ${(a.mph / 2236.94).toFixed(2)} KM/S · ${(a.ld * LD).toFixed(4)} AU · H ${a.H}`; }
  if (S.aur) S.aur.read = `KP ${S.aur.kp} · ${S.aur.g || "G0"} · WINDOW 7PM-7AM ET`;
  if (S.sun) S.sun.read = `GOES X-RAY · 24H MAX ${S.sun.c24 || "-"} · 7D MAX ${S.sun.c7 || "-"}`;
  if (S.lau) S.lau.read = `${S.lau.items.length} LAUNCHES · NEXT ${S.lau.items[0].rocket.toUpperCase()} · ${S.lau.items[0].orbit || "ORBIT TBD"}`;
  if (S.moon) S.moon.read = `AGE ${S.moon.age} D · ILLUM ${S.moon.illum}% · NEW MOON ${ET(S.moon.nextNew, { month: "short", day: "numeric" }).toUpperCase()}`;
  if (S.lau && !S.lau.items.some(l => /Falcon 9/.test(l.rocket))) FACTS.lau = FACTS.lau.filter(f => !/Falcon/.test(f));
  for (const k of Object.keys(S)) S[k].fact = factFor(k, today);
  sane(S);
  if (!Object.keys(S).length) return null;
  for (let i = hooks.length - 1; i >= 0; i--) if (!S[hooks[i][1]]) hooks.splice(i, 1);
  hooks.sort((a, b) => b[0] - a[0]);
  const H = hooks[0] || [1, "moon", "Here's what's happening in the sky this week!", { big: S.moon.illum + "%", unit: "Moon lit tonight", kicker: "Sky report", sub: "" }];
  const order = Object.keys(S).sort((a, b) => (b === H[1]) - (a === H[1]) || score[b] - score[a]);
  const BG = { ast: "asteroid", aur: "aurora", sun: "sun", lau: "launch", moon: "moon" };
  for (const k of order) S[k].bg = BG[k];
  const scenes = [{ kind: "hook", id: "hook", topic: H[1], bg: BG[H[1]] || "earth", ...H[3] }, ...order.map(k => S[k]), { kind: "outro", id: "outro", bg: "earth" }];
  const voice = { hook: `${H[2]} Here's your sky report for ${ET(today + "T16:00:00Z", { weekday: "long" })}.` };
  for (const k of order) voice[k] = V[k];
  voice.outro = `That's your sky report! Follow ${brand} so you never miss what's happening above you.`;
  const dateLabel = ET(today + "T16:00:00Z", { month: "short", day: "numeric" });
  // the fact sheet: every claim in the video with where to check it (published next to the video, not in the caption)
  const facts = [`LIFTOFF fact sheet for ${today}. Every number in the video, and where to verify it before posting.`, ""];
  if (S.ast) { const a = AS.find(x => x.des === S.ast.des);
    facts.push(`ASTEROID ${a.des}: closest approach ${new Date(a.date).toUTCString()} (timing uncertainty ${a.sigmaMin >= 9999 ? "unknown" : a.sigmaMin + " min"})`,
      `  distance ${comma(a.miles)} mi = ${a.ld.toFixed(2)} lunar distances (JPL range ${(a.minMiles / AU_MI / LD).toFixed(2)} to ${a.ldMax.toFixed(2)} LD); ${S.ast.closer ? "entire range inside the Moon's distance" : "not claimed as closer than the Moon"}`,
      `  speed ${comma(a.mph)} mph; size ${a.known ? "measured " + comma(ft(a.m)) + " ft" : `estimated ${comma(ft(a.lo))} to ${comma(ft(a.hi))} ft from brightness (H ${a.H})`}`,
      `  check: https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(a.des)}  and  https://cneos.jpl.nasa.gov/ca/`, ""); }
  if (S.aur) facts.push(`NORTHERN LIGHTS: max Kp ${S.aur.kp} forecast for tonight (7pm-7am ET)${S.aur.g ? ", " + S.aur.g : ""}; viewing line is NOAA's rule of thumb for that Kp`,
    "  check: https://www.swpc.noaa.gov/products/3-day-forecast  and  https://www.swpc.noaa.gov/products/aurora-viewline-tonight-and-tomorrow-night-experimental", "");
  if (S.sun) facts.push(`SUN: biggest flare in the last 24h ${S.sun.c24 || "none"}; 7-day max ${S.sun.c7 || "none"} (${S.sun.t7}); NOAA odds M ${S.sun.m}%, X ${S.sun.x}%`,
    "  check: https://www.swpc.noaa.gov/products/goes-x-ray-flux  and  https://www.swpc.noaa.gov/products/solar-and-geophysical-activity-summary", "");
  if (S.lau) { facts.push("LAUNCHES (times slip often; re-check the morning you post):"); for (const l of S.lau.items) facts.push(`  ${l.day} ${l.time}: ${l.prov} ${l.rocket}, ${l.mission} from ${l.loc}${l.tbd ? " (date not confirmed)" : ""}  ${l.url}`); facts.push(""); }
  if (S.moon) facts.push(`MOON: ${S.moon.phase}, ${S.moon.illum}% lit tonight; next full moon ${new Date(S.moon.nextFull).toUTCString()} (${S.moon.fullName})${S.moon.checked ? ", matches the US Naval Observatory" : ", USNO check unavailable"}`,
    "  check: https://aa.usno.navy.mil/data/MoonPhases", "");
  facts.push("Footage: NASA Image and Video Library (images.nasa.gov). Data: NASA JPL, NOAA SWPC, The Space Devs, USNO.");
  const title = ytTitle(H, S, dateLabel);
  const base = { template: "../space/space.html", w: 1080, h: 1920, brand, day: today, genAt: Date.now(), date: dateLabel.toUpperCase(), music: "../space/music", facts, source: "Data: NASA JPL · NOAA SWPC · The Space Devs · Footage: NASA" };
  const quick = Object.keys(S).filter(k => QH[k]).sort((a, b) => score[b] - score[a]).slice(0, 2).map((k, i) => {
    const [line, big] = QH[k], tag = { ast: "#asteroid", aur: "#northernlights", sun: "#sun", lau: "#rocketlaunch", moon: "#moon" }[k];
    return { ...base, mode: "space-quick", quick: true, min: 0, part: i + 1, scenes: [{ kind: "hook", id: "hook", topic: k, bg: BG[k], ...big }, S[k], { kind: "outro", id: "outro", bg: "earth" }],
      voice: { hook: line, [k]: QV[k], outro: `Follow ${brand} for more!` },
      ytTitle: `${line.replace(/[!.?]+$/, "")} ${{ ast: "☄️", aur: "🌌", sun: "☀️", lau: "🚀", moon: "🌕" }[k]}`.slice(0, 100),
      caption: [line, "", `Follow ${brand} for the space report every day ✅`, "", "Data: NASA JPL, NOAA SWPC, The Space Devs. Footage: NASA.", "", `#space ${tag} #astronomy #spacenews #nightsky #fyp`].join("\n") };
  });
  return { mode: "space", quick, template: "../space/space.html", w: 1080, h: 1920, brand, day: today, genAt: Date.now(), date: dateLabel.toUpperCase(), scenes, voice,
    music: "../space/music", facts, source: "Data: NASA JPL · NOAA SWPC · The Space Devs · Footage: NASA", ytTitle: title, caption: caption(H, S, voice, brand, dateLabel) };
}

function ytTitle(H, S, d) {
  const t = { ast: S.ast && S.ast.closer ? "Asteroid Passes Closer Than the Moon ☄️" : S.ast ? `${S.ast.count} Asteroids Fly Past Earth in the Next 10 Days ☄️` : "",
    aur: "Northern Lights Alert Tonight 🌌", sun: "The Sun Just Fired an X-Class Flare ☀️", lau: "Astronauts Launching This Week 🚀", moon: S.moon && (S.moon.fullTonight ? `Full ${S.moon.tonightName} Moon Tonight 🌕` : `Tonight's Moon: ${S.moon.illum}% Lit 🌙`) }[H[1]] || "Tonight's Sky Report 🔭";
  return `${t} | Sky Report ${d}`.slice(0, 100);
}
function caption(H, S, voice, brand, d) {
  const L = [H[2], "", `Your sky report for ${d} 🔭`];
  if (S.ast) L.push(`☄️ Asteroid ${S.ast.des}: ${comma(S.ast.miles)} miles from Earth on ${S.ast.when.replace(/^\w+ /, "")} (${S.ast.closer ? "closer than the Moon" : S.ast.ld.toFixed(1) + "x the Moon's distance"}), roughly ${comma(S.ast.ft)} ft wide`);
  if (S.aur) L.push(`🌌 Northern lights: Kp ${S.aur.kp} tonight${S.aur.g ? ` (${S.aur.g} storm)` : ""}, best in ${S.aur.where.replace(/^as far south as /, "areas as far south as ")}`);
  if (S.sun) L.push(`☀️ Sun: biggest flare in the last day ${S.sun.c24 || "none"}; ${S.sun.m}% chance of M-class flares`);
  if (S.lau) for (const l of S.lau.items.slice(0, 2)) L.push(`🚀 ${l.day} ${l.time}: ${l.prov} ${l.rocket}, ${l.mission} (${l.loc})`);
  if (S.moon) L.push(`🌕 Moon: ${S.moon.phase}, ${S.moon.illum}% lit · next full moon ${S.moon.full}`);
  L.push("", "What should we track next? Comments 👇", `Follow ${brand} for the sky report every day ✅`, "", "Data: NASA JPL, NOAA SWPC, The Space Devs. Footage: NASA.", "",
    ["#space", "#astronomy", H[1] === "aur" || (S.aur && S.aur.k >= 5) ? "#northernlights" : "#asteroid", "#nightsky", "#spacenews", S.lau ? "#rocketlaunch" : "#science", "#moon", "#fyp"].join(" "));
  return L.join("\n");
}

module.exports = { build, moon, usno, sayDes, get, save, ET, etDay, fmtTime, comma, r1, cap, w2, when, refFor, ft, AU_MI, LD, place, PROV, flux, FACTS };
if (require.main === module) (async () => {
  const out = process.argv[2], today = process.argv[3] || etDay(Date.now());
  const D = await build(today, path.dirname(path.resolve(out)), process.env.BRAND || "Liftoff");
  if (!D) { console.error("No space data today."); process.exit(3); }
  for (const [k, v] of Object.entries(D.voice)) console.log(k, "|", v);
  const Q = D.quick; delete D.quick;
  fs.writeFileSync(out, JSON.stringify(D, null, 1)); console.log(D.ytTitle);
  Q.forEach((q, i) => { fs.writeFileSync(path.join(path.dirname(out), `quick-${i + 1}.json`), JSON.stringify(q, null, 1)); console.log(`quick ${i + 1}:`, q.ytTitle, "|", Object.values(q.voice).join(" ")); });
})().catch(e => { console.error(e); process.exit(1); });
