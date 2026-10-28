/* Background footage for the Liftoff space report: real NASA video from the NASA Image and Video Library (images.nasa.gov),
   which NASA makes free to use (credited "Footage: NASA"; no NASA logos used as branding, no endorsement implied).
   A hand-checked list per topic (pure visuals: no talking heads, no title cards), a different clip and start point
   each day. Only the needed seconds are streamed and cut to the video's frame (vertical 1080x1920, or 1920x1080 for the long-form), darkened a touch for the graphics.
   Picks the sharpest version NASA has that fills the frame without being blown up (1080p or better on screen; 4K
   sources for the vertical videos when there are any). Writes out/broll/<topic>.mp4 and adds data.broll = { topic: file }.
   usage: node broll.js out/data.json   (needs ffmpeg) */
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const LIB = {
  asteroid: [["GSFC_20200226_M4795_BennuGlobal", .05, .7], ["GSFC_20141118_M20220_BennuHalfRes83", .4, .55], ["GSFC_20140923_Bennu_m11661_Teaser", .15, .35]],
  aurora: [["GSFC_20181022_ICON_m12902_Airglow", .2, .24], ["jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_ 2021_210422-4KMP4", .1, .9]],
  sun: [["GSFC_20150501_SDO_m11864_Phoenix", .2, .6], ["GSFC_20140211_SDO_m11460_Year4", .2, .7], ["GSFC_20150211_SDO_m11742_Year5", .3, .7], ["GSFC_20130211_SDO_m11203_Year3", .2, .7]],
  launch: [["KSC-20240605-MH-RKL01-0001-Rocket_Lab_PREFIRE_and_Ice_Launch_1080p-M6988", .25, .35], ["KSC-20240525-MH-RKL01-0001-Rocket_Lab_PREFIRE_1_Launch_1080p-M6988", .25, .35],
    ["KSC-20230507-MH-RLS01-TROPICS_Rocket_Launch-Rocket_Lab-WON_3330130", .38, .45]],
  moon: [["GSFC_20171006_LRO_m12739_100LunarDays_Pt2", .42, .5], ["GSFC_20110617_LRO_m10794_Eclipse_Librating_Moon", 0, .1]],
  earth: [["jsc2021m000138_4K_Earth_Views_Extended_Cut_for_Earth_Day_ 2021_210422-4KMP4", .05, .9], ["jsc2022m000251_Expedition_67_Space_Station_Flyover_of_Hurricane_Ian_220928", .2, .7],
    ["Earth Views from the International Space Station", .1, .7], ["jsc2024m000130_Expedition_71_International_Space_Station_Flyover_of_Hurricane_Beryl_240701", .2, .7]]
};
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const enc = u => u.replace(/^http:/, "https:").replace(/ /g, "%20");
async function files(id) { const r = await fetch(`https://images-assets.nasa.gov/video/${encodeURIComponent(id)}/collection.json`, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status + " " + id); return r.json(); }
const T0 = Date.now();
let W = 1080, H = 1920, SECS = 30, BUDGET = 11 * 60e3;   // stop looking after the budget; scenes without footage get the starfield

// every size NASA has of a clip, measured; "crisp" means it fills our frame without being blown up (1080p or better on screen)
async function variants(id) {
  const fl = await files(id), out = [];
  for (const v of ["~orig.mp4", "~large.mp4", "~medium.mp4", "~small.mp4"]) { const f = fl.find(x => x.endsWith(v)); if (!f) continue;
    try { const [w, h, d] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0:s=,", enc(f)], { timeout: 60000 })
        .toString().split(/[\n,]/).filter(Boolean).map(Number);
      if (w && h) out.push({ url: enc(f), w, h, d, up: Math.max(W / w, H / h) }); } catch (e) { console.error("probe", id, v, String(e.message).slice(0, 120)); } }
  return out;
}
// the smallest version that's still crisp (quickest to decode); if none is, the biggest there is
const best = V => V.filter(v => v.up <= 1.02).sort((a, b) => a.w * a.h - b.w * b.h)[0] || V.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];

async function clip(topic, day, out) {
  const L = LIB[topic], order = L.map((x, i) => L[(i + hash(day + topic)) % L.length]);
  let soft = null;   // a clip that would have to be blown up: only used if no crisp one is found
  for (const [id, a, b] of order) {
    try { const v = best(await variants(id)); if (!v || !v.d) continue;
      if (v.up > 1.02) { console.error(topic, id, `only ${v.w}x${v.h}: keeping as a fallback`); if (!soft || v.up < soft[0].up) soft = [v, id, a, b]; continue; }
      if (await cut(v, id, a, b, day, out)) return { file: path.resolve(out), id };
    } catch (e) { console.error(topic, id, String(e.message).slice(0, 200)); }
  }
  if (soft && await cut(...soft, day, out)) return { file: path.resolve(out), id: soft[1] };
  return null;
}
function cut(v, id, a, b, day, out) {
  try {
    const dur = v.d, lo = dur * a, hi = Math.max(lo, Math.min(dur * b, dur - SECS - 1)), start = lo + (hash(day + id) % 1000) / 1000 * Math.max(0, hi - lo);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", start.toFixed(2), "-i", v.url, "-t", String(Math.min(SECS, Math.max(4, dur - start - .5))), "-an",
      "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=30,eq=brightness=-0.04:saturation=1.15:contrast=1.05`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", out], { timeout: 420000 });
    console.log(path.basename(out, ".mp4"), "<-", id, `${v.w}x${v.h}`, "@", start.toFixed(1), "s");
    return true;
  } catch (e) { console.error("cut", id, String(e.message).slice(0, 200)); return false; }
}

(async () => {
  const df = process.argv[2], D = JSON.parse(fs.readFileSync(df, "utf8"));
  W = D.w || 1080; H = D.h || 1920; SECS = D.brollSecs || 30; BUDGET = (D.brollMinutes || 16) * 60e3;
  const dir = path.join(path.dirname(path.resolve(df)), W > H ? "broll-wide" : "broll");
  fs.mkdirSync(dir, { recursive: true });
  const topics = [...new Set(D.scenes.map(s => s.bg).filter(Boolean))];
  D.broll = {};
  for (const t of topics) { const f = path.join(dir, t + ".mp4");
    if (Date.now() - T0 > BUDGET) { console.error("out of time for footage; skipping", t); continue; }
    if (fs.existsSync(f)) { D.broll[t] = path.resolve(f); continue; }   // already cut for today's other video
    const c = await clip(t, D.day, f); if (c) D.broll[t] = c.file;
    fs.writeFileSync(df, JSON.stringify(D, null, 1)); }   // saved after every clip, so a timeout keeps what's done
  fs.writeFileSync(df, JSON.stringify(D, null, 1));
  console.log("b-roll:", Object.keys(D.broll).join(", ") || "none");
})().catch(e => { console.error(e); process.exit(0); });   // no footage just means the graphics play over the starfield
