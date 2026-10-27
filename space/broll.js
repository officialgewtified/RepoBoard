/* Background footage for the Liftoff space report: real NASA video from the NASA Image and Video Library (images.nasa.gov),
   which NASA makes free to use (credited "Footage: NASA"; no NASA logos used as branding, no endorsement implied).
   A hand-checked list per topic (pure visuals: no talking heads, no title cards), a different clip and start point
   each day. Only the needed 40 seconds are streamed and cut to vertical 1080x1920, darkened a touch for the graphics.
   Writes out/broll/<topic>.mp4 and adds data.broll = { topic: file }.
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
const SECS = 30;
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const enc = u => u.replace(/^http:/, "https:").replace(/ /g, "%20");
async function files(id) { const r = await fetch(`https://images-assets.nasa.gov/video/${encodeURIComponent(id)}/collection.json`); if (!r.ok) throw new Error(r.status + " " + id); return r.json(); }

async function clip(topic, day, out) {
  const L = LIB[topic], order = L.map((x, i) => L[(i + hash(day + topic)) % L.length]);
  for (const [id, a, b] of order) {
    try {
      // the sharpest version that is still 1080p or less (4K decodes far too slowly on the free runner)
      const fl = await files(id); let url = null, dur = 0;
      for (const v of ["~large.mp4", "~medium.mp4", "~orig.mp4", "~small.mp4"]) { const f = fl.find(x => x.endsWith(v)); if (!f) continue;
        const [w, d] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width:format=duration", "-of", "csv=p=0:s=,", enc(f)], { timeout: 60000 }).toString().split(/[\n,]/).filter(Boolean).map(Number);
        if (w && w <= 1920) { url = enc(f); dur = d; break; } }
      if (!url || !dur) continue;
      const lo = dur * a, hi = Math.max(lo, Math.min(dur * b, dur - SECS - 1)), start = lo + (hash(day + id) % 1000) / 1000 * Math.max(0, hi - lo);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", start.toFixed(2), "-i", url, "-t", String(Math.min(SECS, Math.max(4, dur - start - .5))), "-an",
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,eq=brightness=-0.04:saturation=1.15:contrast=1.05",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", out], { timeout: 180000 });
      console.log(topic, "<-", id, "@", start.toFixed(1), "s");
      return { file: path.resolve(out), id };
    } catch (e) { console.error(topic, id, String(e.message).slice(0, 200)); }
  }
  return null;
}

(async () => {
  const df = process.argv[2], D = JSON.parse(fs.readFileSync(df, "utf8")), dir = path.join(path.dirname(path.resolve(df)), "broll");
  fs.mkdirSync(dir, { recursive: true });
  const topics = [...new Set(D.scenes.map(s => s.bg).filter(Boolean))];
  D.broll = {};
  for (const t of topics) { const c = await clip(t, D.day, path.join(dir, t + ".mp4")); if (c) D.broll[t] = c.file; }
  fs.writeFileSync(df, JSON.stringify(D, null, 1));
  console.log("b-roll:", Object.keys(D.broll).join(", ") || "none");
})().catch(e => { console.error(e); process.exit(0); });   // no footage just means the graphics play over the starfield
