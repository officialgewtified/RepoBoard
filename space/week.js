/* LIFTOFF "This Week in Space": the weekly long-form (16:9, 8+ minutes). Everything that flew in the past 7 days and
   what's on the schedule for the next 7 (The Space Devs Launch Library 2), a rocket spotlight (its Launch Library
   specs and flight record), asteroid flybys both ways (NASA JPL close-approach data), the Sun's week (NOAA GOES flares,
   the Kp index, NOAA's 3-day forecast, NASA SDO image), the night sky (Moon phases, planets and Moon-planet meetups
   computed with astronomy-engine, checked against the US Naval Observatory; meteor showers from the IMO calendar),
   what to look for this month, a rotating deep dive and rapid-fire facts (deep.js, every line a settled fact).
   Writes what long.html draws, the narration, the YouTube title and description, and a fact sheet with sources.
   usage: node week.js out/data.json [YYYY-MM-DD]      (needs: npm i astronomy-engine@2.1.19) */
"use strict";
const fs = require("fs"), path = require("path");
const { get, save, ET, etDay, comma, r1, cap, sayDes, refFor, ft, AU_MI, LD, place, PROV, flux, moon: moonMeeus } = require("./sky.js");
const { pickFor, historyFor } = require("./deep.js");
let A = null; try { A = require("astronomy-engine"); } catch (e) { console.error("astronomy-engine not installed: no planets, quarters or meteor dates"); }

// ---------- words for the narrator (digits and times read badly, so they're spelled out)
const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const ORD = "zeroth first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth".split(" ");
const ordW = n => n <= 20 ? ORD[n] : n % 10 ? TENS[Math.floor(n / 10)] + "-" + ORD[n % 10] : TENS[n / 10].replace(/y$/, "ieth");
const numW = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const wkday = d => ET(d, { weekday: "long" });
const dateSay = d => `${wkday(d)}, ${MONTHS[+ET(d, { month: "numeric" }) - 1]} ${ordW(+ET(d, { day: "numeric" }))}`;
const dayTag = d => ET(d, { weekday: "short", month: "short", day: "numeric" }).toUpperCase().replace(",", "");
const hm = d => ET(d, { hour: "numeric", minute: "2-digit" });   // "7:30 PM"
const timeSay = d => { const [t, ap] = hm(d).split(/\s+/), [h, m] = t.split(":").map(Number); return `${numW(h)}${m ? " " + (m < 10 ? "oh " + ONES[m] : numW(m)) : ""} ${ap === "AM" ? "A M" : "P M"}`; };
const half = d => new Date(Math.round(new Date(d).getTime() / 9e5) * 9e5);   // to the nearest quarter hour
const plural = (n, w, ws = w + "s") => n === 0 ? `no ${ws}` : `${n === 1 ? "one" : n} ${n === 1 ? w : ws}`;
const listJoin = a => a.length < 2 ? (a[0] || "") : a.slice(0, -1).join(", ") + (a.length > 2 ? "," : "") + " and " + a[a.length - 1];
const art = w => /^[aeiou]/i.test(w) || /^[FHLMNRSX]([A-Z0-9]|-\d)/.test(w) ? "an " : "a ";
const addDays = (day, k) => new Date(Date.parse(day + "T12:00:00Z") + k * 864e5).toISOString().slice(0, 10);

// ---------- launches (Launch Library 2)
const LL = "https://ll.thespacedevs.com/2.2.0";
const TYPE = { "Communications": "a communications satellite", "Earth Science": "an Earth-observing satellite", "Government/Top Secret": "a classified government payload",
  "Navigation": "a navigation satellite", "Resupply": "a cargo resupply mission", "Dedicated Rideshare": "a rideshare mission full of small satellites", "Test Flight": "a test flight",
  "Technology": "a technology demonstration", "Human Exploration": "a crewed mission", "Planetary Science": "a planetary science mission", "Astrophysics": "a space telescope",
  "Heliophysics": "a mission to study the Sun", "Robotic Exploration": "a robotic explorer", "Tourism": "a space tourism flight", "Meteorology": "a weather satellite" };
const BATCH = { "Communications": "communications satellites", "Government/Top Secret": "classified government satellites", "Earth Science": "Earth-observing satellites", "Navigation": "navigation satellites", "Technology": "test satellites" };
const PROV2 = Object.assign({}, PROV, { "Space Exploration Technologies Corp.": "SpaceX", "Russian Federal Space Agency (ROSCOSMOS)": "Roscosmos", "Rocket Lab Ltd": "Rocket Lab",
  "Korea Aerospace Research Institute": "South Korea's space agency", "European Space Agency": "the European Space Agency" });
function launch(r) {
  const [rocket, mission] = String(r.name).split(" | "), prov = (r.launch_service_provider || {}).name || "", m = r.mission || {};
  const crew = /crew|astronaut|soyuz ms|shenzhou|axiom|polaris/i.test(r.name + " " + (m.type || "")) && !/cargo|progress|tianzhou/i.test(r.name);
  return { rocket: (rocket || "").replace(/ Block 5$/, "").trim(), mission: (mission || "").trim(), prov: PROV2[prov] || prov, net: r.net, loc: place((r.pad || {}).location && r.pad.location.name),
    orbit: (m.orbit || {}).abbrev || "", type: m.type || "", crew, star: /starlink/i.test(mission || ""), kuiper: /kuiper/i.test(r.name), status: (r.status || {}).abbrev || "",
    dayOnly: /day|week|month|quarter|half|year/i.test(((r.net_precision || {}).name) || ""), tbd: /TBD|TBC/.test((r.status || {}).abbrev || ""), url: r.url || "",
    cfg: ((r.rocket || {}).configuration || {}).id || null };
}
const clean = m => String(m || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
function what(l) {
  const m = clean(l.mission);
  if (l.star) return "a batch of Starlink internet satellites";
  if (l.kuiper) return "a batch of Amazon Kuiper internet satellites";
  if (l.crew) return `the ${m} ${/crew/i.test(m) ? "astronauts" : "crew"}`;
  if (/group|batch/i.test(m)) return "a batch of " + (BATCH[l.type] || "satellites");
  if (l.type === "Government/Top Secret") return TYPE[l.type];
  // code-like names (USSF-432, IRNSS-1L) are said as what the mission is instead
  if (m && !/[A-Z]{3,}|\d[A-Za-z]|[A-Z]\d|\/|unknown|demo flight|TBD/i.test(m) && m.length < 40) return `a mission called ${m}`;
  return TYPE[l.type] || "a satellite";
}
// "On Friday" / "Also on Friday" / "And later that day" for a run of launches on one day (list in time order)
const dayLead = (L, i, first) => { const w = wkday(L[i].net), p = i && wkday(L[i - 1].net) === w, pp = i > 1 && wkday(L[i - 2].net) === w;
  return pp ? "And later that day" : p ? "Also on " + w : `${first} ${w}`; };
// numbered asteroids (524522) are read digit by digit; provisional ones (2026 UE2) the way astronomers say them
const sayAst = d => /^\d+$/.test(d) ? "asteroid " + d.split("").map(c => ONES[+c]).join(" ") : sayDes(d);
const notable = l => (l.crew ? 4 : 0) + (!l.star && !l.kuiper ? 2 : 0) + (/NASA|ESA|JAXA|ISRO/.test(l.prov + l.mission) ? 1 : 0) + (/Planetary|Astrophysics|Heliophysics|Human|Robotic|Resupply/.test(l.type) ? 1 : 0);
async function launchesBetween(kind, from, to) {
  const d = await get(`${LL}/launch/${kind}/?net__gte=${from}&net__lte=${to}&limit=60&mode=normal&ordering=net`);
  return (d.results || []).map(launch).filter(l => Date.parse(l.net) >= Date.parse(from) && Date.parse(l.net) <= Date.parse(to));
}
async function rocketCfg(id) {
  if (!id) return null;
  try { const c = await get(`${LL}/config/launcher/${id}/`);
    return { name: c.full_name || c.name, mfr: ((c.manufacturer || {}).name || "").replace(/^Space Exploration Technologies Corp\.$/, "SpaceX"), len: +c.length || 0, mass: +c.launch_mass || 0,
      first: c.maiden_flight || "", total: +c.total_launch_count || 0, ok: +c.successful_launches || 0, landed: +c.successful_landings || 0, reusable: !!c.reusable }; }
  catch (e) { console.error("rocket config:", e.message); return null; }
}

// ---------- asteroids (JPL close approaches within 0.05 AU, about 19.5 Moon distances)
async function cad(min, max) {
  const d = await get(`https://ssd-api.jpl.nasa.gov/cad.api?date-min=${min}&date-max=${max}&dist-max=0.05&diameter=true&fullname=true&sort=dist`);
  const F = d.fields || [], at = (r, k) => r[F.indexOf(k)];
  return (d.data || []).map(r => {
    const [y, mo, dd, t] = String(at(r, "cd")).split(/[- ]/), date = new Date(`${dd} ${mo} ${y} ${t} UTC`);
    const H = +at(r, "h"), dia = +at(r, "diameter"), mid = dia ? dia * 1000 : 1329e3 / Math.sqrt(.14) * Math.pow(10, -H / 5);
    const lo = dia ? mid : 1329e3 / Math.sqrt(.25) * Math.pow(10, -H / 5), hi = dia ? mid : 1329e3 / Math.sqrt(.05) * Math.pow(10, -H / 5);
    const dist = +at(r, "dist"), sg = String(at(r, "t_sigma_f") || ""), sm = sg.match(/(?:(\d+)_)?(\d+):(\d+)/);
    const sigmaMin = /^</.test(sg.trim()) ? 1 : sm ? (+(sm[1] || 0)) * 1440 + (+sm[2]) * 60 + (+sm[3]) : 9999;
    return { des: String(at(r, "des")), date: date.toISOString(), ld: dist / LD, ldMax: +at(r, "dist_max") / LD, miles: dist * AU_MI, minMiles: +at(r, "dist_min") * AU_MI,
      mph: +at(r, "v_rel") * 2236.94, m: mid, lo, hi, H, known: !!dia, sigmaMin };
  }).filter(a => isFinite(a.ld) && a.minMiles > 10000);   // anything that could come within 10,000 miles is too big a claim to automate
}
const sizeSay = a => { const f = ft(a.m); return a.known ? (f < 1000 ? `about ${comma(f)} feet wide` : `about ${r1(a.m / 1609)} miles wide`)
  : f < 100 ? `an estimated ${Math.round(f)} feet wide` : f < 1000 ? `an estimated ${comma(Math.round(f / 10) * 10)} feet wide` : `an estimated ${r1(a.m / 1609)} miles wide`; };
const miSay = m => m < 1e6 ? comma(Math.round(m / 1000) * 1000) : r1(m / 1e6) + " million";

// ---------- the Sun and space weather (NOAA SWPC)
const rowsOf = d => Array.isArray(d) && Array.isArray(d[0]) ? d.slice(1).map(r => Object.fromEntries(d[0].map((k, i) => [k, r[i]]))) : (d || []);
const kpOf = r => +(r.Kp ?? r.kp ?? r.kp_index ?? r.estimated_kp);
const gOf = kp => kp >= 9 ? 5 : kp >= 8 ? 4 : kp >= 7 ? 3 : kp >= 6 ? 2 : kp >= 5 ? 1 : 0;   // NOAA G scale by whole Kp (conservative)
async function sunWeek(day) {
  const fl = await get("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json");
  const cnt = { C: 0, M: 0, X: 0 }; let big = null;
  for (const f of fl) { const L = String(f.max_class || "")[0]; if (cnt[L] != null) cnt[L]++; if (!big || flux(f.max_class) > flux(big.max_class)) big = f; }
  let kp = [], kpMax = 0, kpAt = null, fc = null;
  try { const rows = rowsOf(await get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json")).map(r => ({ t: Date.parse(String(r.time_tag).replace(" ", "T") + (/Z$/.test(r.time_tag) ? "" : "Z")), v: kpOf(r) })).filter(r => isFinite(r.v) && isFinite(r.t));
    const byDay = {}; for (const r of rows) { const k = etDay(r.t); byDay[k] = Math.max(byDay[k] || 0, r.v); if (r.v > kpMax) { kpMax = r.v; kpAt = r.t; } }
    kp = Object.keys(byDay).sort().slice(-7).map(k => ({ day: ET(k + "T16:00:00Z", { weekday: "short" }).toUpperCase(), v: r1(byDay[k]) }));
  } catch (e) { console.error("kp:", e.message); }
  try { const rows = rowsOf(await get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json"));
    const now = Date.now(), up = rows.filter(r => /predicted/i.test(r.observed || "") && Date.parse(String(r.time_tag).replace(" ", "T") + "Z") > now && Date.parse(String(r.time_tag).replace(" ", "T") + "Z") < now + 72 * 36e5);
    if (up.length) fc = r1(Math.max(...up.map(kpOf).filter(isFinite)));
  } catch (e) { console.error("kp forecast:", e.message); }
  return { cnt, big: big ? { cls: big.max_class, t: big.max_time } : null, n: fl.length, kp, kpMax: r1(kpMax), kpAt, g: gOf(kpMax), fc };
}

// ---------- the sky (astronomy-engine), seen from mid-northern latitudes (near Philadelphia), times in Eastern
const OBS = A ? new A.Observer(39.95, -75.17, 0) : null;
const DIRS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const dirOf = az => DIRS[Math.round(((az % 360) + 360) % 360 / 45) % 8];
const PHASES = ["new moon", "first quarter", "full moon", "last quarter"];
function moonWeek(day) {
  const t = new Date(day + "T01:00:00Z"), tonight = new Date(Date.parse(day + "T12:00:00Z") + 13 * 36e5);   // 9pm Eastern (8pm in winter)
  const ill = A.Illumination(A.Body.Moon, tonight), ang = A.MoonPhase(tonight);
  const name = ang < 6 || ang > 354 ? "New Moon" : ang < 84 ? "Waxing Crescent" : ang < 96 ? "First Quarter Moon" : ang < 174 ? "Waxing Gibbous" : ang < 186 ? "Full Moon" : ang < 264 ? "Waning Gibbous" : ang < 276 ? "Last Quarter Moon" : "Waning Crescent";
  const ev = []; let q = A.SearchMoonQuarter(t);
  for (let i = 0; i < 6 && q.time.date < new Date(Date.parse(day + "T12:00:00Z") + 35 * 864e5); i++) { ev.push({ q: q.quarter, name: PHASES[q.quarter], t: q.time.date.toISOString() }); q = A.NextMoonQuarter(q); }
  const full = ev.find(e => e.q === 2), fullName = full ? moonMeeus(new Date(Date.parse(full.t) - 6 * 36e5)).fullName : "";
  return { illum: Math.round(ill.phase_fraction * 100), frac: +(ang / 360).toFixed(4), phase: name, events: ev, full: full ? { t: full.t, name: fullName } : null };
}
// the US Naval Observatory's phase times win if the two ever disagree by more than an hour
async function usnoCheck(day, MO) {
  try { const p = await get(`https://aa.usno.navy.mil/api/moon/phases/date?date=${day}&nump=6`), N = { "New Moon": 0, "First Quarter": 1, "Full Moon": 2, "Last Quarter": 3 };
    for (const x of p.phasedata || []) { const t = Date.UTC(x.year, x.month - 1, x.day, ...x.time.split(":").map(Number)), e = MO.events.find(e => e.q === N[x.phase] && Math.abs(Date.parse(e.t) - t) < 2 * 864e5);
      if (e && Math.abs(Date.parse(e.t) - t) > 36e5) { console.error(`moon: USNO ${x.phase} ${new Date(t).toISOString()} vs ${e.t}; using USNO`); e.t = new Date(t).toISOString(); } }
    MO.checked = true; if (MO.full) MO.full.t = (MO.events.find(e => e.q === 2) || MO.full).t;
  } catch (e) { console.error("moon: USNO check unavailable,", e.message); }
  return MO;
}
const PL = ["Venus", "Jupiter", "Mars", "Saturn", "Mercury"];
function planets(day) {
  const noon = new Date(day + "T16:00:00Z"), set = A.SearchRiseSet(A.Body.Sun, OBS, -1, noon, 1).date, rise = A.SearchRiseSet(A.Body.Sun, OBS, +1, set, 1).date;
  const eve = new Date(set.getTime() + 60 * 6e4), morn = new Date(rise.getTime() - 60 * 6e4), out = [];
  const hz = (b, t) => { const e = A.Equator(b, t, OBS, true, true); return A.Horizon(t, OBS, e.ra, e.dec, "normal"); };
  for (const n of PL) {
    const b = A.Body[n], he = hz(b, eve), hmn = hz(b, morn), el = A.Elongation(b, eve), mag = A.Illumination(b, eve).mag, j = A.Equator(b, eve, OBS, false, true), con = A.Constellation(j.ra, j.dec).name;
    const min = n === "Mercury" || n === "Venus" ? 5 : 10, e = he.altitude >= min && el.elongation >= 12, m = hmn.altitude >= min && el.elongation >= 12;
    const pr = A.SearchRiseSet(b, OBS, +1, set, 1), ps = A.SearchRiseSet(b, OBS, -1, set, 1);
    out.push({ name: n, mag: r1(mag), con, elong: Math.round(el.elongation), eve: e ? { alt: Math.round(he.altitude), az: Math.round(he.azimuth) } : null, morn: m ? { alt: Math.round(hmn.altitude), az: Math.round(hmn.azimuth) } : null,
      rise: pr ? pr.date.toISOString() : null, set: ps ? ps.date.toISOString() : null, glare: el.elongation < 12 });
  }
  return { sunset: set.toISOString(), sunrise: rise.toISOString(), eveAt: eve.toISOString(), mornAt: morn.toISOString(), list: out };
}
// the Moon passing near a bright planet in the next week (topocentric separation, both above the horizon)
function meetups(day) {
  const out = [];
  for (let k = 0; k < 7; k++) {
    const noon = new Date(Date.parse(addDays(day, k) + "T16:00:00Z")), set = A.SearchRiseSet(A.Body.Sun, OBS, -1, noon, 1).date, rise = A.SearchRiseSet(A.Body.Sun, OBS, +1, set, 1).date;
    for (const [t, when] of [[new Date(set.getTime() + 90 * 6e4), "night"], [new Date(rise.getTime() - 60 * 6e4), "morning"]]) {
      const mo = A.Equator(A.Body.Moon, t, OBS, true, true), mh = A.Horizon(t, OBS, mo.ra, mo.dec, "normal"); if (mh.altitude < 8) continue;
      for (const n of PL.slice(0, 4)) { const p = A.Equator(A.Body[n], t, OBS, true, true), ph = A.Horizon(t, OBS, p.ra, p.dec, "normal"); if (ph.altitude < 8) continue;
        const sep = A.AngleBetween(mo.vec, p.vec); if (sep <= 4.5) out.push({ planet: n, sep: r1(sep), t: t.toISOString(), when, day: when === "morning" ? ET(t, { weekday: "long" }) : ET(set, { weekday: "long" }) }); }
    }
  }
  // the closest approach for each planet only
  const best = {}; for (const x of out) if (!best[x.planet] || x.sep < best[x.planet].sep) best[x.planet] = x;
  return Object.values(best).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}
// meteor showers: peak solar longitude (J2000) and rates from the International Meteor Organization's working list
const SHOWERS = [
  { name: "Quadrantids", lam: 283.15, zhr: 80, from: "12-28", to: "01-12", parent: "an asteroid called 2003 EH1" },
  { name: "Lyrids", lam: 32.32, zhr: 18, from: "04-14", to: "04-30", parent: "Comet Thatcher" },
  { name: "Eta Aquariids", lam: 45.5, zhr: 50, from: "04-19", to: "05-28", parent: "Halley's Comet" },
  { name: "Southern Delta Aquariids", lam: 127, zhr: 25, from: "07-12", to: "08-23", parent: "a comet called 96P Machholz" },
  { name: "Perseids", lam: 140.0, zhr: 100, from: "07-17", to: "08-24", parent: "Comet Swift-Tuttle" },
  { name: "Draconids", lam: 195.4, zhr: 10, from: "10-06", to: "10-10", parent: "Comet Giacobini-Zinner" },
  { name: "Orionids", lam: 208, zhr: 20, from: "10-02", to: "11-07", parent: "Halley's Comet" },
  { name: "Leonids", lam: 235.27, zhr: 15, from: "11-06", to: "11-30", parent: "Comet Tempel-Tuttle" },
  { name: "Geminids", lam: 262.2, zhr: 150, from: "12-04", to: "12-20", parent: "an asteroid called 3200 Phaethon" },
  { name: "Ursids", lam: 270.7, zhr: 10, from: "12-17", to: "12-26", parent: "Comet Tuttle" }];
const lamAt = t => A.SphereFromVector(A.RotateVector(A.Rotation_EQJ_ECL(), A.GeoVector(A.Body.Sun, t, true))).lon;   // J2000 ecliptic, as the IMO uses
function peakAfter(lam, from) {   // the first time after `from` that the Sun reaches this longitude
  let t = new Date(from), d0 = ((lam - lamAt(t)) % 360 + 360) % 360;
  t = new Date(t.getTime() + d0 / 0.9856 * 864e5);
  for (let i = 0; i < 6; i++) { let d = lam - lamAt(t); d = ((d + 540) % 360) - 180; t = new Date(t.getTime() + d / 0.9856 * 864e5); }
  return t;
}
function meteors(day) {
  const t0 = new Date(Date.parse(day + "T12:00:00Z") - 2 * 864e5), md = day.slice(5);
  const up = SHOWERS.map(s => ({ ...s, peak: peakAfter(s.lam, t0).toISOString() })).sort((a, b) => Date.parse(a.peak) - Date.parse(b.peak));
  const inWin = s => s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to;
  const moonAt = t => Math.round(A.Illumination(A.Body.Moon, new Date(t)).phase_fraction * 100);
  const soon = up.find(s => Date.parse(s.peak) - Date.parse(day + "T12:00:00Z") < 9 * 864e5);
  const next = up.find(s => s !== soon && s.zhr >= 15 && Date.parse(s.peak) - Date.parse(day + "T12:00:00Z") >= 9 * 864e5 && Date.parse(s.peak) - Date.parse(day + "T12:00:00Z") < 75 * 864e5);
  const taurids = md >= "10-20" && md <= "11-20";   // Southern and Northern Taurids both active (IMO: Sep 10-Nov 20 and Oct 20-Dec 10)
  return { soon: soon ? { ...soon, moon: moonAt(soon.peak) } : null, next: next ? { ...next, moon: moonAt(next.peak) } : null, taurids, active: up.filter(inWin).map(s => s.name) };
}

// ---------- the episode
async function build(day, outDir, brand) {
  const imgDir = path.join(outDir, "img"); fs.mkdirSync(imgDir, { recursive: true });
  const safe = async (f, name) => { try { return await f(); } catch (e) { console.error(name + ":", e.message); return null; } };
  const from = new Date(Date.parse(day + "T12:00:00Z") - 7 * 864e5).toISOString(), now = new Date(Math.min(Date.now(), Date.parse(day + "T23:59:00Z"))).toISOString(), to = new Date(Date.parse(now) + 7 * 864e5).toISOString();
  const past = (await safe(() => launchesBetween("previous", from, now), "past launches") || []).filter(l => /Success|Failure|Partial/.test(l.status));
  const next = (await safe(() => launchesBetween("upcoming", now, to), "upcoming launches") || []).filter(l => /Go|TBC|TBD/.test(l.status));
  const [aP, aN, SU] = await Promise.all([safe(() => cad(addDays(day, -7), day), "asteroids past"), safe(() => cad(day, addDays(day, 7)), "asteroids next"), safe(() => sunWeek(day), "sun")]);
  const sunImg = await save("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg", path.join(imgDir, "sun.jpg"));
  const MO = A ? await usnoCheck(day, moonWeek(day)) : null, PLN = A ? planets(day) : null, MEET = A ? meetups(day) : [], MET = A ? meteors(day) : null;
  const { deep, facts: FX, sky: SKYM } = pickFor(day);
  const S = [], V = {}, F = [`LIFTOFF "This Week in Space" fact sheet for ${day}. Every number in the episode and where to check it.`, ""];
  const sc = (s, say) => { S.push(s); V[s.id] = say; };

  // launches, past week
  const N = past.length, okN = past.filter(l => l.status === "Success").length, bad = past.filter(l => l.status !== "Success");
  const byProv = {}; for (const l of past) byProv[l.prov] = (byProv[l.prov] || 0) + 1;
  const provs = Object.entries(byProv).sort((a, b) => b[1] - a[1]), starN = past.filter(l => l.star).length;
  let say = N === 0 ? "Let's start with launches. It was a quiet week, with no rockets launching anywhere in the world." :
    `Let's start with launches. In the past seven days, there were ${N} launches around the world${bad.length ? `, and ${okN} of them were successful` : N === 1 ? ", and it was a success" : ", and every one of them was a success"}.`;
  if (N > 1) { const [p0, n0] = provs[0], rest = provs.slice(1).map(([p, n]) => `${p} had ${n === 1 ? "one" : n}`);
    say += provs.length === 1 ? ` All of them were ${p0} launches${starN && p0 === "SpaceX" ? `, ${starN === n0 ? "all" : starN} carrying Starlink internet satellites` : ""}.`
      : ` ${p0} led the way with ${n0}${p0 === "SpaceX" && starN ? `, including ${plural(starN, "Starlink mission")}` : ""}. ${cap(listJoin(rest))}.`; }
  const hi = past.filter(l => notable(l) >= 2 && l.status === "Success").sort((a, b) => notable(b) - notable(a)).slice(0, 5).sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
  hi.forEach((l, i) => say += ` ${dayLead(hi, i, i ? "On" : "Highlights: on")}, ${l.prov} launched ${what(l)} on ${art(l.rocket)}${l.rocket} from ${l.loc}.`);
  bad.slice(0, 2).forEach((l, i) => say += ` ${i ? "And" : bad.length === 1 ? "One launch didn't go to plan:" : "Not every launch went to plan:"} on ${wkday(l.net)}, ${l.prov}'s ${l.rocket} launch ${l.status === "Partial Failure" ? "was a partial failure" : "failed"}.`);
  sc({ kind: "lpast", id: "lpast", chapter: "Launches this week", bg: "launch", n: N, ok: okN, fail: bad.length, provs: provs.slice(0, 5),
    rows: past.slice(-10).map(l => ({ day: dayTag(l.net), rocket: l.rocket, mission: clean(l.mission) || "—", prov: l.prov, loc: l.loc, st: l.status })) }, say);
  F.push(`LAUNCHES, ${from.slice(0, 10)} to ${now.slice(0, 10)}: ${N} (${okN} successful)`); for (const l of past) F.push(`  ${l.net} ${l.prov} ${l.rocket} | ${l.mission} | ${l.loc} | ${l.status}  ${l.url}`); F.push("  check: https://thespacedevs.com/llapi  and  https://nextspaceflight.com/launches/past/", "");

  // rocket spotlight: the week's most notable rocket, its specs and record from the Launch Library
  const spotL = hi[0] || next.filter(l => l.crew)[0] || past[past.length - 1] || next[0];
  const RC = spotL ? await rocketCfg(spotL.cfg) : null;
  if (RC && RC.total > 0) {
    const lenFt = RC.len ? Math.round(RC.len * 3.281 / 5) * 5 : 0, lb = RC.mass * 2204.6, yr = RC.first ? RC.first.slice(0, 4) : "";
    const bits = [RC.mfr && `built by ${RC.mfr}`, lenFt && `stands about ${lenFt} feet tall`, lb && `weighs about ${lb >= 1e6 ? r1(lb / 1e6) + " million" : comma(Math.round(lb / (lb < 1e5 ? 1e3 : 1e4)) * (lb < 1e5 ? 1e3 : 1e4))} pounds at liftoff`].filter(Boolean);
    let s2 = `Rocket spotlight: the ${RC.name}.${bits.length ? ` It's ${listJoin(bits)}.` : ""}`.replace("It's stands", "It stands").replace("It's weighs", "It weighs");
    s2 += `${yr ? ` It first flew in ${yr}, and it has` : " It has"} now flown ${RC.total} times${RC.ok === RC.total ? ", every one a success" : `, with ${RC.ok} successes`}.`;
    if (RC.landed > 0) s2 += ` It has also made ${RC.landed === 1 ? "one successful booster landing" : comma(RC.landed) + " successful booster landings"}.`;
    sc({ kind: "spot", id: "spot", chapter: "Rocket spotlight", bg: "launch", name: RC.name, mfr: RC.mfr, ft: lenFt, lb: lb ? Math.round(lb) : 0, first: yr, total: RC.total, ok: RC.ok, landed: RC.landed }, s2);
    F.push(`ROCKET SPOTLIGHT ${RC.name}: ${RC.len} m tall, ${RC.mass} t at liftoff, first flight ${RC.first}, ${RC.total} launches (${RC.ok} successful), ${RC.landed} booster landings (Launch Library config ${spotL.cfg})`, `  check: ${LL}/config/launcher/${spotL.cfg}/`, "");
  }

  // launches, next week
  { const n2 = next.length, pick = next.filter(l => notable(l) >= 2).sort((a, b) => notable(b) - notable(a)).slice(0, 4).sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
    const more = next.filter(l => !pick.includes(l)), moreStar = more.filter(l => l.star).length;
    let s3 = n2 ? `Looking ahead, ${n2} launches are on the schedule for the next seven days.` : "Looking ahead, no launches are on the schedule for the next seven days.";
    pick.forEach((l, i) => { s3 += ` ${dayLead(pick, i, "On")}, ${l.prov} plans to launch ${what(l)} on ${art(l.rocket)}${l.rocket} from ${l.loc}${l.dayOnly ? "" : `, at about ${timeSay(l.net)} Eastern`}${l.tbd ? ", if the date holds" : ""}.`; });
    if (moreStar) s3 += ` ${pick.length ? "Plus" : "That includes"} ${plural(moreStar, "Starlink launch", "Starlink launches")}${pick.length ? "" : " from SpaceX"}.`;
    if (n2) s3 += " Launch times often slip, so check before you watch.";
    sc({ kind: "lnext", id: "lnext", chapter: "Launch schedule", bg: "launch", n: n2,
      rows: next.slice(0, 8).map(l => ({ day: dayTag(l.net), time: l.dayOnly ? "TBD" : hm(l.net).replace(":00", "") + " ET", rocket: l.rocket, mission: clean(l.mission) || "—", prov: l.prov, loc: l.loc, crew: l.crew, net: l.net, tbd: l.tbd })) }, s3);
    F.push(`UPCOMING LAUNCHES to ${to.slice(0, 10)} (times slip often):`); for (const l of next) F.push(`  ${l.net} ${l.prov} ${l.rocket} | ${l.mission} | ${l.loc} | ${l.status}${l.dayOnly ? " (day only)" : ""}  ${l.url}`); F.push(""); }

  // asteroids
  if (aP || aN) {
    const P = aP || [], Q = aN || [], cP = P[0], bQ = Q.slice().sort((a, b) => b.m - a.m)[0], cQ = Q[0];
    const near = a => a.ldMax < 1 ? ", closer than the Moon" : a.ld < 1.05 ? ", about as far as the Moon" : a.ld < 3 ? `, just ${r1(a.ld)} times the Moon's distance` : "";
    const whenA = a => a.sigmaMin > 360 ? `around ${ET(a.date, { weekday: "long" })}` : `on ${ET(a.date, { weekday: "long" })}`;
    let s4 = `Now, asteroid watch. In the past week, ${P.length === 0 ? "no asteroids" : P.length === 1 ? "one asteroid" : P.length + " asteroids"} passed within twenty Moon distances of Earth.`;
    if (cP) s4 += ` The closest was ${sayAst(cP.des)}, ${sizeSay(cP)}, which came within about ${miSay(cP.miles)} miles${near(cP)}.`;
    s4 += Q.length ? ` Over the next seven days, ${Q.length === 1 ? "one more is" : Q.length + " more are"} expected to fly by.` : " None are expected that close over the next seven days.";
    if (bQ) s4 += ` The biggest is ${sayAst(bQ.des)}, ${sizeSay(bQ)}, about the size of ${refFor(bQ.m).name}, passing about ${miSay(bQ.miles)} miles away ${whenA(bQ)}.`;
    if (cQ && cQ !== bQ) s4 += ` The closest, ${sayAst(cQ.des)}, will pass at about ${miSay(cQ.miles)} miles ${whenA(cQ)}${near(cQ)}.`;
    if (P.length || Q.length) s4 += " None of them poses any danger to Earth.";
    const pt = (a, past) => { const f = ft(a.m); return { des: a.des, ld: +a.ld.toFixed(2), ft: f < 100 || a.known ? Math.round(f) : Math.round(f / 10) * 10, day: dayTag(a.date), past }; };
    sc({ kind: "ast", id: "ast", chapter: "Asteroid watch", bg: "asteroid", nP: P.length, nQ: Q.length, pts: [...P.slice(0, 8).map(a => pt(a, true)), ...Q.slice(0, 8).map(a => pt(a, false))],
      big: bQ ? { ...pt(bQ, false), miles: Math.round(bQ.miles), ref: refFor(bQ.m) } : cP ? { ...pt(cP, true), miles: Math.round(cP.miles), ref: refFor(cP.m) } : null }, s4);
    F.push("ASTEROIDS within 0.05 AU (JPL CAD; size from brightness unless measured):");
    for (const a of [...P.map(x => ["past", x]), ...Q.map(x => ["next", x])]) F.push(`  ${a[0]} ${a[1].des} ${a[1].date} ${comma(a[1].miles)} mi (${a[1].ld.toFixed(2)} LD, max ${a[1].ldMax.toFixed(2)}) ${a[1].known ? "measured" : "est."} ${comma(ft(a[1].lo))}-${comma(ft(a[1].hi))} ft`);
    F.push("  check: https://cneos.jpl.nasa.gov/ca/", "");
  }

  // the Sun
  if (SU) {
    const { C, M, X } = SU.cnt, b = SU.big, saycl = c => String(c).replace(/^([ABCMX])([\d.]+)$/, "$1 $2");
    let s5 = X ? `The Sun was busy this week. It fired off ${plural(X, "X-class flare")}, the strongest kind there is${M ? `, plus ${plural(M, "M-class flare")}` : ""}.`
      : M ? `On the Sun this week: ${plural(M, "M-class flare")}, the medium-strength kind, along with ${plural(C, "smaller C-class flare")}.`
      : `The Sun was fairly quiet this week, with ${plural(C, "small C-class flare")} and nothing stronger.`;
    if (b && (X || M)) s5 += ` The biggest was an ${saycl(b.cls)} on ${wkday(b.t)}.`;
    if (SU.kpMax) s5 += SU.g ? ` Earth felt it, too: the Kp index reached ${SU.kpMax}, a G${SU.g} geomagnetic storm, which can push the northern lights farther south than usual.`
      : ` Earth's magnetic field stayed fairly calm, with the Kp index topping out at ${SU.kpMax}.`;
    if (SU.fc != null) s5 += ` Looking ahead, NOAA's forecast shows the Kp reaching ${SU.fc} over the next three days${SU.fc >= 5 ? ", so keep an eye on the sky for auroras" : ""}.`;
    sc({ kind: "sun", id: "sun", chapter: "The Sun", bg: "sun", img: sunImg ? "file://" + path.resolve(sunImg) : "", C, M, X, big: b ? { cls: b.cls, day: dayTag(b.t) } : null, kp: SU.kp, kpMax: SU.kpMax, g: SU.g, fc: SU.fc }, s5);
    F.push(`SUN (GOES X-ray, last 7 days): C ${C}, M ${M}, X ${X}; biggest ${b ? b.cls + " at " + b.t : "none"}; max Kp ${SU.kpMax}${SU.kpAt ? " at " + new Date(SU.kpAt).toISOString() : ""} (G${SU.g}); 3-day forecast max Kp ${SU.fc}`,
      "  check: https://www.swpc.noaa.gov/products/goes-x-ray-flux  https://www.swpc.noaa.gov/products/planetary-k-index  https://www.swpc.noaa.gov/products/3-day-forecast", "");
  }

  // the night sky: Moon, planets, meetups, meteors, this month's sight
  if (MO) {
    const wk = MO.events.filter(e => Date.parse(e.t) < Date.parse(day + "T12:00:00Z") + 7.5 * 864e5);
    const ph = MO.phase === "Full Moon" ? "Tonight's Moon is full" : MO.phase === "New Moon" ? "Tonight it's a new moon" : /Quarter/.test(MO.phase) ? `Tonight's Moon is at ${MO.phase.replace(/ Moon$/, "").toLowerCase()}` : `Tonight's Moon is a ${MO.phase.toLowerCase()}`;
    let s6 = `Time to look up. ${ph}, about ${MO.illum} percent lit.`;
    const evs = wk.map(e => e.q === 2 ? `the full ${MO.full.name} Moon arrives on ${dateSay(e.t)}` : `it reaches ${e.name} on ${wkday(e.t)}`);
    if (evs.length) s6 += ` This week, ${listJoin(evs)}.`;
    if (MO.full && !wk.some(e => e.q === 2)) s6 += ` The next full moon, the ${MO.full.name} Moon, is on ${dateSay(MO.full.t)}.`;
    sc({ kind: "moon", id: "moon", chapter: "Night sky", bg: "moon", phase: MO.phase, illum: MO.illum, frac: MO.frac, events: MO.events.slice(0, 4).map(e => ({ q: e.q, name: e.name, day: dayTag(e.t) })), full: MO.full ? { name: MO.full.name, day: dayTag(MO.full.t) } : null }, s6);
    F.push(`MOON tonight: ${MO.phase}, ${MO.illum}% lit; phases: ${MO.events.map(e => e.name + " " + e.t).join("; ")}${MO.checked ? " (checked against USNO)" : " (USNO check unavailable)"}; next full: ${MO.full ? MO.full.name + " Moon" : "-"}`, "  check: https://aa.usno.navy.mil/data/MoonPhases", "");
  }
  if (PLN) {
    const vis = PLN.list.filter(p => p.eve || p.morn).sort((a, b) => a.mag - b.mag).slice(0, 4);
    const bright = p => p.mag <= -3 ? "blazing brighter than anything else in the night sky but the Moon" : p.mag <= -1.5 ? "brighter than any star" : p.mag <= .6 ? "shining like one of the brightest stars" : "looking like a fairly bright star";
    const alt = a => a < 18 ? "low in the " : a > 50 ? "high in the " : "in the ";
    const lines = vis.map(p => { const c = ` in ${p.con}`;
      if (p.eve && p.morn) return `${p.name} is up all night long${c}, ${bright(p)}`;
      if (p.eve) return `${p.name} is ${alt(p.eve.alt)}${dirOf(p.eve.az)} after sunset${c}${p.set && Date.parse(p.set) < Date.parse(PLN.sunrise) ? `, and sets around ${timeSay(half(p.set))}` : ""}, ${bright(p)}`;
      return `${p.name} rises around ${timeSay(half(p.rise))}, and it's ${alt(p.morn.alt)}${dirOf(p.morn.az)} before dawn${c}, ${bright(p)}`; });
    const glare = PLN.list.filter(p => p.glare && (p.name === "Venus" || p.name === "Jupiter" || p.name === "Mars" || p.name === "Saturn")).map(p => p.name);
    let s7 = vis.length ? `For planets: ${lines.join(". ")}.` : "There are no bright planets well placed this week.";
    if (glare.length) s7 += ` ${listJoin(glare)} ${glare.length === 1 ? "is" : "are"} too close to the Sun to see this week.`;
    for (const x of MEET.slice(0, 2)) s7 += ` And on ${x.day} ${x.when === "morning" ? "morning" : "night"}, look for the Moon ${x.sep < 1 ? "less than a degree" : "just about " + numW(Math.max(1, Math.round(x.sep))) + " degree" + (Math.round(x.sep) === 1 ? "" : "s")} from ${x.planet}.`;
    sc({ kind: "planets", id: "planets", bg: "earth", list: PLN.list.map(p => ({ name: p.name, mag: p.mag, con: p.con, eve: p.eve, morn: p.morn, glare: p.glare, rise: p.rise ? hm(half(p.rise)) : "", set: p.set ? hm(half(p.set)) : "" })),
      eveAt: hm(half(PLN.eveAt)), mornAt: hm(half(PLN.mornAt)), meet: MEET.slice(0, 2).map(x => ({ planet: x.planet, sep: x.sep, day: x.day.slice(0, 3).toUpperCase(), when: x.when })) }, s7);
    F.push(`PLANETS (astronomy-engine, from 39.95N 75.17W, 1 hr after sunset ${hm(PLN.eveAt)} / 1 hr before sunrise ${hm(PLN.mornAt)} ET):`);
    for (const p of PLN.list) F.push(`  ${p.name}: mag ${p.mag}, ${p.con}, elongation ${p.elong}°, evening ${p.eve ? p.eve.alt + "° alt az " + p.eve.az : "-"}, morning ${p.morn ? p.morn.alt + "° alt az " + p.morn.az : "-"}, rises ${p.rise ? hm(p.rise) : "-"}, sets ${p.set ? hm(p.set) : "-"}`);
    for (const x of MEET) F.push(`  Moon-${x.planet}: ${x.sep}° at ${x.t}`);
    F.push("  check: https://in-the-sky.org/whatsup_times.php  https://skyandtelescope.org/observing/", "");
  }
  { let s8 = SKYM.say;
    if (MET) {
      const moonNote = s => s.moon >= 60 ? " A bright Moon will wash out the fainter ones, though." : s.moon <= 25 ? " And the Moon won't get in the way." : "";
      if (MET.soon) s8 += ` Meteor alert: the ${MET.soon.name} peak around ${dateSay(MET.soon.peak)}. Under dark skies, you could see up to about ${MET.soon.zhr} meteors an hour, bits of debris left behind by ${MET.soon.parent}.${moonNote(MET.soon)}`;
      else if (MET.taurids) s8 += " The Taurid meteor shower is active right now, too. It only brings about five meteors an hour, but the Taurids are famous for bright fireballs.";
      if (MET.next) s8 += ` The next big meteor shower is the ${MET.next.name}, peaking around ${dateSay(MET.next.peak)}.`;
      F.push(`METEORS: ${MET.soon ? MET.soon.name + " peak " + MET.soon.peak + " (ZHR " + MET.soon.zhr + ", Moon " + MET.soon.moon + "%)" : "no peak this week"}; Taurids active: ${MET.taurids}; next: ${MET.next ? MET.next.name + " " + MET.next.peak : "-"}`, "  check: https://www.imo.net/resources/calendar/", "");
    }
    sc({ kind: "skym", id: "skym", bg: "earth", big: SKYM.big, unit: SKYM.unit, shower: MET && (MET.soon || MET.next) ? { name: (MET.soon || MET.next).name, day: dayTag((MET.soon || MET.next).peak), zhr: (MET.soon || MET.next).zhr, now: !!MET.soon } : null, taurids: !!(MET && MET.taurids && !MET.soon) }, s8); }

  // this week in space history (anniversaries within a few days of the episode)
  { const H2 = historyFor(day);
    if (H2.length) { sc({ kind: "hist", id: "hist", chapter: "This week in space history", bg: H2[0].bg, items: H2.map(h => ({ y: h.y, day: h.md, txt: h.short, full: h.txt })) },
      "This week in space history. " + H2.map(h => `On ${MONTHS[+h.md.slice(0, 2) - 1]} ${ordW(+h.md.slice(3))}, ${h.y}, ${h.txt}`).join(" "));
      F.push("SPACE HISTORY: " + H2.map(h => `${h.y}-${h.md} ${h.short}`).join("; "), ""); } }

  // deep dive and rapid-fire facts
  deep.parts.forEach((p, i) => sc({ kind: "deep", id: "d" + i, chapter: i ? undefined : "Deep dive: " + deep.title, bg: deep.bg, title: deep.title, n: i + 1, of: deep.parts.length, big: p.big, unit: p.unit },
    (i ? "" : `Now for this week's deep dive: ${deep.title.toLowerCase().replace(/^the /, "the ")}. `) + p.say));
  F.push(`DEEP DIVE "${deep.title}" (evergreen, checked): ${deep.sources.join("  ")}`, "");
  FX.forEach((f, i) => sc({ kind: "fact", id: "f" + i, chapter: i ? undefined : "Rapid-fire space facts", bg: f.bg, n: i + 1, of: FX.length, big: f.big, unit: f.unit }, (i ? "" : "Time for some rapid-fire space facts. ") + f.say));

  // the week in numbers and the outro
  const flN = SU ? SU.cnt.C + SU.cnt.M + SU.cnt.X : null, aN2 = aP ? aP.length : null;
  const tiles = [[String(N), "Launches"], aN2 != null && [String(aN2), "Asteroid flybys"], flN != null && [String(flN), "Solar flares"], SU && SU.kpMax && ["KP " + SU.kpMax, "Peak geomagnetic"], MO && [MO.illum + "%", "Moon tonight"], [String((next || []).length), "Launches next week"]].filter(Boolean);
  sc({ kind: "nums", id: "nums", chapter: "The week in numbers", bg: "earth", tiles },
    `That's the week, by the numbers: ${listJoin([plural(N, "launch", "launches"), aN2 != null && plural(aN2, "asteroid flyby", "asteroid flybys"), flN != null && plural(flN, "solar flare"), SU && SU.kpMax && `a top Kp of ${SU.kpMax}`].filter(Boolean))}.`);
  sc({ kind: "outro", id: "outro", chapter: "Outro", bg: "earth" }, `That's This Week in Space. If you learned something, subscribe and follow ${brand}, so you never miss what's happening above you. See you next week!`);

  // the cold open: the week's biggest story
  const hooks = [];
  if (SU && SU.cnt.X) hooks.push([9, "sun", "The Sun fired off an X-class solar flare this week.", { big: SU.big.cls, unit: "Biggest solar flare", kicker: "Solar flare" }, `The Sun Fired an X-Class Flare`]);
  if (SU && SU.g >= 3) hooks.push([8, "sun", `A strong G${SU.g} geomagnetic storm hit Earth this week.`, { big: "G" + SU.g, unit: "Geomagnetic storm", kicker: "Space weather" }, `A G${SU.g} Geomagnetic Storm Hit Earth`]);
  const closeA = [...(aP || []).map(a => [a, true]), ...(aN || []).map(a => [a, false])].filter(([a]) => a.ldMax < 1).sort((x, y) => x[0].ld - y[0].ld)[0];
  if (closeA) hooks.push([7, "ast", `An asteroid ${closeA[1] ? "just flew" : "is about to fly"} closer to Earth than the Moon.`, { big: miSay(closeA[0].miles), unit: "Miles from Earth", kicker: "Closer than the Moon" }, "An Asteroid Closer Than the Moon"]);
  const crewL = [...past.filter(l => l.crew && l.status === "Success").map(l => [l, true]), ...next.filter(l => l.crew).map(l => [l, false])][0];
  if (crewL) hooks.push([7, "launch", `Astronauts ${crewL[1] ? "launched" : "are launching"} this week.`, { big: crewL[1] ? "CREW" : "CREW", unit: crewL[0].rocket, kicker: crewL[1] ? "Crew launch" : "Crew launch ahead" }, crewL[1] ? "Astronauts Launched" : "Astronauts Launching"]);
  const H = hooks.sort((a, b) => b[0] - a[0])[0] || [1, "launch", `${N} rocket launches, ${aN2 || 0} asteroid flybys and ${flN || 0} solar flares.`, { big: String(N), unit: "Launches this week", kicker: "This week in space" }, ""];
  const r0 = ET(from, { month: "short", day: "numeric" }), r1d = ET(day + "T16:00:00Z", { month: "short", day: "numeric" }), range = r0.split(" ")[0] === r1d.split(" ")[0] ? `${r0}–${r1d.split(" ")[1]}` : `${r0}–${r1d}`;
  S.unshift({ kind: "hook", id: "hook", chapter: "Intro", topic: H[1], bg: H[1] === "sun" ? "sun" : H[1] === "ast" ? "asteroid" : "launch", ...H[3], sub: range.toUpperCase() });
  V.hook = `${H[2]} Welcome to This Week in Space, from ${brand}. Here's everything that happened above us, and what's coming next.`;
  // narration in scene order
  const voice = {}; for (const s of S) voice[s.id] = V[s.id];

  const sum = [`${N} Launches`, aN2 != null && `${aN2} Asteroid Flybys`, deep.title].filter(Boolean);
  const tBase = `This Week in Space: ${H[4] ? H[4] + ", " + sum.slice(0, 2).join(" & ") : sum.join(", ").replace(/, ([^,]*)$/, " & $1")} 🚀`;
  const ytTitle = (tBase + " | " + range).length <= 100 ? tBase + " | " + range : tBase.slice(0, 100);
  const desc = [V.hook.replace(/ Welcome to.*$/, ""), "", `This Week in Space for ${range}: every launch, the asteroid flybys, what the Sun did, what's in the night sky, and a deep dive on ${deep.title.toLowerCase()}.`, "",
    "CHAPTERS_HERE", "",
    `🚀 Launches: ${N} in the past 7 days${N ? ` (${okN} successful)` : ""}; ${next.length} scheduled for the next 7`,
    aP && `☄️ Asteroids: ${aP.length} flybys this past week, ${(aN || []).length} more in the next 7 days, all safe`,
    SU && `☀️ Sun: ${SU.cnt.X} X-class, ${SU.cnt.M} M-class, ${SU.cnt.C} C-class flares; max Kp ${SU.kpMax}`,
    MO && `🌙 Moon: ${MO.phase}, ${MO.illum}% lit${MO.full ? `; full ${MO.full.name} Moon ${dayTag(MO.full.t)}` : ""}`, "",
    `Follow ${brand} for the space report every day, and This Week in Space every weekend ✅`, "",
    "Data: The Space Devs Launch Library, NASA JPL, NOAA SWPC, US Naval Observatory, International Meteor Organization. Footage: NASA. Sky positions computed for mid-northern latitudes.", "",
    "#space #spacenews #astronomy #rocketlaunch #nasa #spacex #nightsky #science"].filter(x => x !== false && x != null).join("\n");
  F.push("Footage: NASA Image and Video Library (images.nasa.gov).");
  return { mode: "space-week", template: "../space/long.html", w: 1920, h: 1080, brand, day, genAt: Date.now(), date: ET(day + "T16:00:00Z", { month: "short", day: "numeric" }).toUpperCase(), range: range.toUpperCase(),
    scenes: S, voice, music: "../space/music", facts: F, source: "Data: Launch Library 2 · NASA JPL · NOAA SWPC · USNO · IMO · Footage: NASA", ytTitle, description: desc, brollSecs: 75, brollMinutes: 22, min: 492 };
}

module.exports = { build };
if (require.main === module) (async () => {
  const out = process.argv[2], day = process.argv[3] || etDay(Date.now());
  const D = await build(day, path.dirname(path.resolve(out)), process.env.BRAND || "Liftoff");
  for (const [k, v] of Object.entries(D.voice)) console.log(k, "|", v);
  const words = Object.values(D.voice).join(" ").split(/\s+/).length;
  console.log(D.ytTitle, `| ${words} words, about ${(words / 170).toFixed(1)} minutes of narration`);
  fs.writeFileSync(out, JSON.stringify(D, null, 1));
  fs.writeFileSync(path.join(path.dirname(out), "fact-sheet.txt"), D.facts.join("\n") + "\n");
})().catch(e => { console.error(e); process.exit(1); });
