const { chromium } = require("playwright"), path = require("path");
(async () => { const b = await chromium.launch();
  for (const [k, w, h, f] of [["icon", 1080, 1080, "crossover-channel-icon.png"], ["vids", 1024, 1024, "crossover-videos-icon.png"], ["banner", 2560, 1440, "crossover-youtube-banner.png"]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto("file://" + path.join(__dirname, "crossover-art.html") + "?k=" + k);
    await p.evaluate(() => Promise.all(['900 100px "Big Shoulders"', '900 100px "Archivo"'].map(x => document.fonts.load(x)))); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, f) }); await p.close(); }
  await b.close(); })();
