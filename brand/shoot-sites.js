// renders the three site emblems (1024 px; the maskable version smaller) and writes every icon size each site uses
const { chromium } = require("playwright"), path = require("path"), { execFileSync } = require("child_process");
(async () => { const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const [k, dir] of [["grid", "."], ["base", "baseline"], ["cross", "crossover"]]) for (const [pad, f] of [[1, "full"], [.8, "mask"]]) {
    await p.goto("file://" + path.join(__dirname, "sites.html") + `?k=${k}&pad=${pad}`); await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(__dirname, `${k}-${f}.png`) }); }
  await b.close(); })();
