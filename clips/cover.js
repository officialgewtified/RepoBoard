/* Redraws just the cover image of a video that's already made, from its data file (the release's data.json):
   usage: node cover.js data.json out.jpg   (the template comes from data.template, as in render.js) */
"use strict";
const { chromium } = require("playwright"), path = require("path"), fs = require("fs");
(async () => {
  const [df, out] = process.argv.slice(2), d = JSON.parse(fs.readFileSync(df, "utf8"));
  delete d.voiceDir; delete d.broll;
  const b = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const p = await b.newPage({ viewport: { width: d.w || 1080, height: d.h || 1920 } });
  p.on("pageerror", e => { console.error("page error:", e.message); process.exit(1); });
  await p.goto("file://" + path.join(__dirname, d.template || "recap.html"));
  await p.evaluate(() => window.ready ? window.ready() : document.fonts.ready);
  await p.evaluate(x => window.build(x), d);
  if (!(await p.evaluate(() => typeof window.thumb === "function" && window.thumb()))) { console.error("no cover in this template"); process.exit(1); }
  await p.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
  await p.screenshot({ path: out, type: "jpeg", quality: 90 });
  await b.close();
  console.log("cover:", out);
})();
