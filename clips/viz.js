/* Stat graphics shared by the Crossover videos (recap.html, weekly.html).
   field: a football field that fills with a player's yards, one field per 100 yards (312 yards = three fields and a bit),
          with a ball running the leading edge and a yards counter.
   court: a half court with every shot the player took (green dot = made, red x = missed), from ESPN's play-by-play,
          where x runs 0-50 feet across and y is feet out from the basket.
   VIZ.html(v, color, tm) returns the SVG; VIZ.anim(root, lt) poses every graphic inside root at lt seconds into its scene. */
(function () {
  const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), ez = x => 1 - Math.pow(1 - cl(x), 3);
  const pp = x => { x = cl(x); if (x >= 1) return 1; const c = 1.70158 * 1.4; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let uid = 0;
  const KIND = { pass: "Passing yards", rush: "Rushing yards", rec: "Receiving yards" };
  const FONT = `font-family="Big Shoulders" font-weight="900"`;

  function field(v, c, tm) {
    const yds = Math.max(0, Math.round(+v.yds || 0)), nF = Math.max(1, Math.min(5, Math.ceil(yds / 100) || 1));
    const rh = nF === 1 ? 46 : nF === 2 ? 34 : nF === 3 ? 27 : nF === 4 ? 22 : 18, gap = nF === 1 ? 0 : 6, H = nF * rh + (nF - 1) * gap, id = "vz" + (++uid);
    let s = `<svg class="vz fld" viewBox="-1 ${nF > 1 ? -5 : -1} 122 ${H + 22 + (nF > 1 ? 4 : 0)}" preserveAspectRatio="xMidYMid meet" data-yds="${yds}" data-n="${nF}" data-rh="${rh}">
      <defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${c}" stop-opacity=".25"/><stop offset="1" stop-color="${c}" stop-opacity=".9"/></linearGradient></defs>`;
    for (let i = 0; i < nF; i++) {
      s += `<g transform="translate(0 ${i * (rh + gap)})"><rect width="120" height="${rh}" rx="2" fill="#123020"/>`;
      for (let k = 1; k < 10; k += 2) s += `<rect x="${10 + k * 10}" width="10" height="${rh}" fill="#163a26"/>`;
      s += `<rect width="10" height="${rh}" fill="${c}" opacity=".55"/><rect x="110" width="10" height="${rh}" fill="${c}" opacity=".55"/>`;
      s += `<text transform="translate(6.6 ${rh / 2}) rotate(-90)" text-anchor="middle" font-size="${Math.min(7, rh * .3)}" ${FONT} fill="#fff" fill-opacity=".85">${esc(tm || "")}</text>`;
      for (let k = 0; k <= 20; k++) s += `<line x1="${10 + k * 5}" x2="${10 + k * 5}" y2="${rh}" stroke="#fff" stroke-opacity="${k % 2 ? .16 : .42}" stroke-width="${k % 2 ? .25 : .4}"/>`;
      for (let k = 1; k < 10; k++) s += `<text x="${10 + k * 10}" y="${rh - rh * .1}" text-anchor="middle" font-size="${rh * .17}" ${FONT} fill="#fff" fill-opacity=".45">${k <= 5 ? k * 10 : 100 - k * 10}</text>`;
      s += `<rect class="vf" data-i="${i}" x="10" y="${rh * .1}" width="0" height="${rh * .8}" rx="${rh * .12}" fill="url(#${id})"/>`;
      s += `<rect class="ve" data-i="${i}" x="10" y="${rh * .1}" width=".7" height="${rh * .8}" fill="#fff" opacity="0"/>`;
      s += `<text x="118.5" y="-1.2" text-anchor="end" font-size="3.6" ${FONT} fill="#a1a1aa" letter-spacing=".3" style="display:${nF > 1 ? "block" : "none"}">FIELD ${i + 1}</text></g>`;
    }
    const br = Math.min(3.6, rh * .2);
    s += `<g class="vb" opacity="0"><ellipse rx="${br}" ry="${br * .6}" fill="#8a4b22" stroke="#f4f4f5" stroke-width=".35"/><line x1="${-br * .45}" x2="${br * .45}" stroke="#fff" stroke-width=".4"/>`;
    for (let k = -1; k <= 1; k++) s += `<line x1="${k * br * .2}" x2="${k * br * .2}" y1="-.6" y2=".6" stroke="#fff" stroke-width=".3"/>`;
    s += `</g><text class="vc" x="60" y="${H + 16}" text-anchor="middle" font-size="8.4" ${FONT} fill="#f4f4f5" letter-spacing=".3" data-k="${esc(KIND[v.k] || "Yards")}">0</text></svg>`;
    return s;
  }

  function court(v, c) {
    const S = (v.shots || []).filter(x => x && isFinite(x[0]) && isFinite(x[1]));
    const st = `stroke="#f4f4f5" stroke-opacity=".5" stroke-width=".35" fill="none"`;
    let s = `<svg class="vz crt" viewBox="-1 -1 52 ${49 + 11}" preserveAspectRatio="xMidYMid meet">
      <rect width="50" height="47" rx="1" fill="#2a2119"/>`;
    for (let x = 2.5; x < 50; x += 2.5) s += `<line x1="${x}" x2="${x}" y2="47" stroke="#000" stroke-opacity=".18" stroke-width=".12"/>`;
    s += `<rect x="17" width="16" height="19" fill="${c}" opacity=".3"/>
      <rect width="50" height="47" ${st}/><rect x="17" width="16" height="19" ${st}/><circle cx="25" cy="19" r="6" ${st}/>
      <path d="M3 0 L3 14.2 A23.75 23.75 0 0 0 47 14.2 L47 0" ${st}/><path d="M21 5.25 A4 4 0 0 0 29 5.25" ${st}/>
      <path d="M19 47 A6 6 0 0 1 31 47" ${st}/><line x1="22" x2="28" y1="4" y2="4" stroke="#f4f4f5" stroke-width=".5"/>
      <circle cx="25" cy="5.25" r=".8" fill="none" stroke="#fb923c" stroke-width=".35"/>`;
    // misses first so the makes sit on top
    const order = S.map((x, i) => [x, i]).sort((a, b) => a[0][2] - b[0][2] || a[1] - b[1]);
    order.forEach(([x], i) => {
      const px = cl(x[0], .8, 49.2), py = cl(x[1] + 5.25, .8, 46.2);
      s += `<g class="vs" data-i="${i}" data-x="${px.toFixed(1)}" data-y="${py.toFixed(1)}" transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(0)">` +
        (x[2] ? `<circle r="1.05" fill="#4ade80" stroke="#0b0b0c" stroke-width=".2"/>` :
          `<path d="M-.7 -.7 L.7 .7 M.7 -.7 L-.7 .7" stroke="#f87171" stroke-width=".42" stroke-linecap="round" opacity=".9"/>`) + `</g>`;
    });
    const pct = f => { const [m, a] = String(f || "").split("-").map(Number); return a ? `${m}/${a}` : null; };
    const cap = [pct(v.fg) && "FG " + pct(v.fg), pct(v.tp) && "3PT " + pct(v.tp)].filter(Boolean).join("  ·  ");
    s += `<text class="vk" x="25" y="57.6" text-anchor="middle" font-size="4.8" ${FONT} fill="#f4f4f5" opacity="0">${esc(cap)}</text>`;
    if (S.length) s += `<g class="vk" opacity="0" transform="translate(25 50.4)"><circle cx="-12" r=".9" fill="#4ade80"/><text x="-10.6" y="1" font-size="2.6" font-family="Archivo" font-weight="700" fill="#a1a1aa">MADE</text>
      <path d="M2.4 -.6 L3.6 .6 M3.6 -.6 L2.4 .6" stroke="#f87171" stroke-width=".4"/><text x="4.8" y="1" font-size="2.6" font-family="Archivo" font-weight="700" fill="#a1a1aa">MISSED</text></g>`;
    return s + `</svg>`;
  }

  function html(v, c, tm) { return !v ? "" : v.t === "court" ? court(v, c) : field(v, c, tm); }

  // start: when the graphic starts drawing (seconds into the scene)
  function anim(root, lt, start = .5) {
    root.querySelectorAll("svg.fld").forEach(g => {
      const yds = +g.dataset.yds, nF = +g.dataset.n, dur = .9 + .55 * nF, d = yds * ez((lt - start) / dur), rh = +g.dataset.rh;
      g.querySelectorAll(".vf").forEach(r => { const w = cl(d - r.dataset.i * 100, 0, 100); r.setAttribute("width", w.toFixed(2)); });
      g.querySelectorAll(".ve").forEach(r => { const w = cl(d - r.dataset.i * 100, 0, 100); r.setAttribute("x", (9.3 + w).toFixed(2)); r.setAttribute("opacity", w > 0 && w < 100 ? .9 : 0); });
      const row = Math.min(nF - 1, Math.floor(Math.max(0, d - .001) / 100)), bx = 10 + cl(d - row * 100, 0, 100), by = row * (rh + (nF === 1 ? 0 : 6)) + rh / 2;
      const b = g.querySelector(".vb"); b.setAttribute("opacity", lt > start ? 1 : 0);
      b.setAttribute("transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)}) rotate(${(Math.sin(lt * 9) * 12).toFixed(1)})`);
      const t = g.querySelector(".vc"), f = d / 100;
      t.textContent = `${Math.round(d)} ${t.dataset.k.toUpperCase()}${yds >= 100 ? ` · ${f.toFixed(1)} FIELDS` : ""}`;
    });
    root.querySelectorAll("svg.crt").forEach(g => {
      const S = g.querySelectorAll(".vs"), n = S.length, span = Math.min(2.2, .4 + n * .06);
      S.forEach((e, i) => { const k = pp((lt - start - i / Math.max(1, n) * span) / .3); e.setAttribute("transform", `translate(${e.dataset.x} ${e.dataset.y}) scale(${Math.max(0, k).toFixed(3)})`); });
      g.querySelectorAll(".vk").forEach(e => e.setAttribute("opacity", ez((lt - start - span - .1) / .4).toFixed(3)));
    });
  }
  window.VIZ = { html, anim, field, court };
})();
