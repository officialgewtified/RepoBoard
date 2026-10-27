// renders the Liftoff icons and YouTube banner from art.html
const { chromium } = require("playwright"), path = require("path");
(async () => { const b = await chromium.launch();
  for (const [k, w, h, f] of [["icon", 1080, 1080, "liftoff-icon.png"], ["icon2", 1080, 1080, "liftoff-icon-wordmark.png"], ["banner", 2560, 1440, "liftoff-youtube-banner.png"]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto("file://" + path.join(__dirname, "art.html") + "?k=" + k);
    await p.evaluate(() => Promise.all(['900 100px "Unbounded"', '700 30px "JBM"'].map(x => document.fonts.load(x)))); await p.reload(); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, f) }); await p.close(); }
  await b.close(); })();
