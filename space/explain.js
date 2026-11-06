/* Space Explained: turns an episode (space/explain/<topic>.json) into the data for one video.
   usage: node space/explain.js <topic> <short|long> out/data.json
   Every photo is a real one from space/ref/photos (credits.json says where it came from); its real pixel size goes in
   the data so the template never blows a photo up past its real resolution. */
"use strict";
const fs = require("fs"), path = require("path");
const [topic, fmt, out] = process.argv.slice(2);
if (!topic || !/^(short|long)$/.test(fmt || "") || !out) { console.error("usage: node space/explain.js <topic> <short|long> out.json"); process.exit(2); }
const EP = JSON.parse(fs.readFileSync(path.join(__dirname, "explain", topic + ".json"), "utf8")), F = EP[fmt];
const PH = path.join(__dirname, "ref", "photos"), CR = JSON.parse(fs.readFileSync(path.join(PH, "credits.json"), "utf8"));

// pixel size from the file itself (JPEG SOF / PNG IHDR), no libraries
function size(f) {
  const b = fs.readFileSync(f);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  for (let i = 2; i < b.length;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], L = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + L; }
  throw new Error("can't read the size of " + f);
}
const clean = s => String(s || "").replace(/\s+/g, " ").replace(/\b(Image|Credit|Photo)s?:\s*/gi, "").trim();
const lic = l => /public domain|^pd/i.test(l) ? "public domain" : l;
const photos = {}, missing = [];
for (const L of F.lines) { const n = L.photo; if (photos[n]) continue;
  const file = ["jpg", "png"].map(e => path.join(PH, `${n}.${e}`)).find(fs.existsSync);
  if (!file) { missing.push(n); continue; }
  const c = CR[n] || {}, who = clean(c.credit && c.credit.length < 80 ? c.credit : c.artist).slice(0, 90);
  photos[n] = { src: "ref/photos/" + path.basename(file), ...size(file), credit: (EP.credits || {})[n] || (who ? `${who} (${lic(c.license || "")})` : ""), pictured: (EP.pictured || {})[n] || "" }; }
if (missing.length) { console.error("photos missing (no drawings are ever substituted): " + missing.join(", ")); process.exit(1); }
const cover = F.cover || {}; if (cover.photo && !photos[cover.photo]) {
  const file = ["jpg", "png"].map(e => path.join(PH, `${cover.photo}.${e}`)).find(fs.existsSync);
  if (file) { const c = CR[cover.photo] || {}; photos[cover.photo] = { src: "ref/photos/" + path.basename(file), ...size(file), credit: clean(c.artist), pictured: (EP.pictured || {})[cover.photo] || "" }; } }
const V = fmt === "short";
const data = {
  template: "../space/explain.html", w: V ? 1080 : 1920, h: V ? 1920 : 1080, fmt, brand: "Liftoff", series: EP.series || "Space Explained",
  ep: EP.ep, title: EP.title, topic: EP.id, cover, photos, music: "../space/music",
  lines: F.lines.map(({ say, ...L }) => L), voice: Object.fromEntries(F.lines.map(L => [L.id, L.say])),
  ytTitle: F.ytTitle, caption: F.caption,
  facts: [...EP.facts, "Photos: " + Object.entries(photos).map(([n, p]) => `${p.pictured || n}: ${p.credit}`).join("; ")] };
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log(`${EP.title} (${fmt}): ${F.lines.length} lines, ${Object.keys(photos).length} photos, ~${Math.round(F.lines.reduce((a, L) => a + L.say.split(/\s+/).length, 0) / 2.55)}s of narration`);
