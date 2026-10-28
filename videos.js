/* Shared code for the two video pages. A page calls VP.start({...}) with its repo, which releases are its videos,
   how to label each kind, and its channel key in stats/latest.json (filled daily by the stats workflow). */
"use strict";
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`;
  const CP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`;
  const ET = d => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const dayName = d => { const t = ET(Date.now()), y = ET(Date.now() - 864e5); return d === t ? "Today" : d === y ? "Yesterday" : new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
  const ago = d => { const h = (Date.now() - Date.parse(d)) / 36e5; return h < 1 ? "just now" : h < 24 ? Math.round(h) + "h ago" : Math.round(h / 24) + "d ago"; };
  const num = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(n);
  const mp4 = r => (r.assets || []).find(a => /\.mp4$/.test(a.name)), thumb = r => (r.assets || []).find(a => /thumbnail\.jpg$/.test(a.name)), facts = r => (r.assets || []).find(a => a.name === "fact-sheet.txt");
  let REL = [], CFG = null, STATS = null;
  const store = { get: k => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  function toast(t) { const e = document.getElementById("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 1500); }
  async function copy(t, what) { try { await navigator.clipboard.writeText(t); toast(what + " copied"); } catch (e) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); toast(what + " copied"); } catch (_) { toast("Couldn't copy"); } a.remove(); } }
  // match a published video to its YouTube upload by title (the stats workflow lists the channel's recent uploads)
  // YouTube tags for a video, built from what's actually in it: the players and teams named in its caption and
  // hashtags, the league, the kind of video, and the channel's core topics. Under YouTube's 500-character limit.
  const JOINED = { nightsky: "night sky", spacenews: "space news", rocketlaunch: "rocket launch", northernlights: "northern lights", fantasyfootball: "fantasy football", fyp: "" };
  const split = h => { h = h.replace(/^#/, ""); if (JOINED[h.toLowerCase()] != null) return JOINED[h.toLowerCase()];
    return h.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2"); };
  function tagsFor(r) {
    const body = String(r.body || ""), title = String(r.name || ""), k = r.tag_name, T = [];
    const add = (...x) => x.forEach(t => { t = String(t || "").trim(); if (t && !T.some(u => u.toLowerCase() === t.toLowerCase())) T.push(t); });
    const hashes = (body.match(/#[A-Za-z][A-Za-z0-9]+/g) || []).filter(h => !/^#(fyp|foryou|shorts)$/i.test(h)).map(split);
    if (CFG.key === "crossover") {
      const nba = /NBA|🏀/.test(body + title), nfl = /NFL|🏈/.test(body + title) && !/^#?CollegeFootball/.test(""), cfb = /College/i.test(body + title);
      const names = [...body.matchAll(/[🏀🏈]\s*(?:#\d\s*)?([A-Z][\w.'’-]+(?: [A-Z][\w.'’-]+)+):/gu)].map(m => m[1]);
      const lead = (title.match(/^([A-Z][\w.'’-]+(?: [A-Z][\w.'’-]+)+?) (?:Drops|Grabs|Dishes|Blocks|Throws|Runs|Goes|Catches|Is)\b/) || [])[1];
      if (lead) add(lead, lead + " highlights", lead + " stats");
      const wk = (title.match(/Week (\d+)/) || [])[1];
      if (/^weekly/.test(k)) add(`NFL Week ${wk} recap`, `NFL Week ${wk}`, "NFL recap", "NFL highlights", "NFL scores", "fantasy football", `Week ${+wk + 1} preview`, "NFL stats");
      else if (/^preview/.test(k)) add(nba && "NBA tonight", nba && "NBA games tonight", nfl && "NFL tonight", "games tonight", "sports preview", nba && "NBA schedule");
      else add(nba && "NBA highlights", nba && "NBA stats", nfl && "NFL highlights", nfl && "NFL stats", cfb && "college football", "last night", "sports recap");
      add(...names.slice(0, 5), ...hashes, nba && "NBA", nfl && "NFL", "sports stats", "best stats", "highlights", "Crossover");
    } else {
      const b = body + " " + title;
      add(...hashes.filter(h => !/^(space|astronomy|science|moon)$/i.test(h)));
      if (/asteroid/i.test(b)) { const des = (b.match(/Asteroid (\d{4} [A-Z]{1,2}\d*)/) || [])[1]; add("asteroid", "asteroid flyby", "near Earth asteroid", "asteroid news", des, "planetary defense"); }
      if (/northern lights|aurora|Kp/i.test(b)) add("northern lights", "aurora", "aurora borealis", "northern lights tonight", "aurora forecast", "space weather");
      if (/flare|Sun\b/i.test(b)) add("solar flare", "the sun", "space weather", "solar activity");
      if (/launch|rocket|Falcon|Starlink/i.test(b)) add("rocket launch", /SpaceX|Falcon|Starlink/.test(b) && "SpaceX", /Starlink/.test(b) && "Starlink", /Falcon 9/.test(b) && "Falcon 9", "launch schedule");
      if (/Moon/.test(b)) { const fm = (b.match(/full ([A-Z][a-z']+) Moon/) || [])[1]; add("moon", "moon tonight", "moon phase", fm && `${fm} Moon`, /full/i.test(title) && "full moon"); }
      add("space", "space news", "astronomy", "night sky", "NASA", "science", "space facts", "Liftoff");
    }
    const out = []; let n = 0; for (const t of T.filter(Boolean)) { if (n + t.length + 2 > 480) break; out.push(t); n += t.length + 2; }
    return out.join(", ");
  }
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  function ytFor(r) { const V = STATS && STATS.youtube && STATS.youtube.videos; if (!V) return null; const a = norm(r.name); if (!a) return null;
    return V.find(v => { const b = norm(v.title); return b && (b === a || b.startsWith(a.slice(0, 40)) || a.startsWith(b.slice(0, 40))); }) || null; }

  function card(r, i) {
    const v = mp4(r), t = thumb(r), f = facts(r), k = CFG.kind(r.tag_name), done = !!store.get("posted-" + CFG.key)[r.tag_name], yt = ytFor(r);
    return `<article class="vc ${done ? "done" : ""}" data-tag="${esc(r.tag_name)}">
      <div class="vt"><span class="badge ${k.cls || ""}">${esc(k.label)}</span><span class="ago">${ago(r.published_at)}</span>
       <button class="posted" data-act="posted" data-i="${i}"><i></i>${done ? "Posted" : "Mark posted"}</button></div>
      <h3>${esc(r.name)}</h3>
      ${yt ? `<div class="views"><span><b>${num(yt.views)}</b> views</span><span><b>${num(yt.likes || 0)}</b> likes</span><span><b>${num(yt.comments || 0)}</b> comments</span></div>` : ""}
      <div class="vid ${k.wide ? "wide" : ""}"><video controls playsinline preload="none" ${t ? `poster="${esc(t.browser_download_url)}"` : ""} src="${esc(v.browser_download_url)}"></video></div>
      <div class="row"><a class="btn p" href="${esc(v.browser_download_url)}" download>${DL}Video</a><button class="btn" data-act="title" data-i="${i}">${CP}Title</button><button class="btn" data-act="cap" data-i="${i}">${CP}Caption</button><button class="btn" data-act="tags" data-i="${i}">${CP}Tags</button></div>
      <div class="more">${t ? `<a href="${esc(t.browser_download_url)}" download>Cover image</a>` : ""}${f ? `<a href="${esc(f.browser_download_url)}" target="_blank" rel="noopener">Fact sheet</a>` : ""}
       <details class="cap"><summary>Show caption &amp; tags</summary><div class="captxt">${esc(r.body || "")}</div><div class="captxt"><b>YouTube tags:</b> ${esc(tagsFor(r))}</div></details></div></article>`;
  }
  function row(r, i) {
    const v = mp4(r), t = thumb(r), k = CFG.kind(r.tag_name), yt = ytFor(r);
    return `<div class="er"><b><span class="badge ${k.cls || ""}">${esc(k.short || k.label)}</span>${esc(r.name)}</b>
      <div class="bs"><a class="btn" href="${esc(v.browser_download_url)}" download>Video</a>${t ? `<a class="btn" href="${esc(t.browser_download_url)}" download>Cover</a>` : ""}<button class="btn" data-act="cap" data-i="${i}">Caption</button><button class="btn" data-act="tags" data-i="${i}">Tags</button></div>
      ${yt ? `<div class="v">${num(yt.views)} views · ${num(yt.likes || 0)} likes</div>` : ""}</div>`;
  }
  function stats() {
    const S = STATS, y = S && S.youtube, tk = S && S.tiktok, el = document.getElementById("stats");
    const d = (cur, prev) => prev != null && cur - prev > 0 ? ` <em>+${num(cur - prev)}</em>` : "";
    const tiles = [];
    if (y) tiles.push([num(y.subs), `YouTube subs${d(y.subs, y.subs7)}`], [num(y.views), `YouTube views${d(y.views, y.views7)}`]);
    else tiles.push(["Not linked", "YouTube"], null);
    tiles.push(tk ? [num(tk.followers), `TikTok followers${d(tk.followers, tk.followers7)}`] : ["Not linked", "TikTok"]);
    el.innerHTML = `<div class="stats">${tiles.filter(Boolean).map(([b, s]) => `<div class="st ${/Not linked/.test(b) ? "off" : ""}"><b>${b}</b><span>${s}</span></div>`).join("")}</div>
      ${y || tk ? `<p class="note">Green numbers are the gain over the last 7 days. Updated ${ago(S.updated)}.</p>` : `<p class="note">Channel stats show up here once the accounts are linked.</p>`}`;
    if (!y && tiles.length === 2) el.querySelector(".stats").style.gridTemplateColumns = "1fr 1fr";
  }
  function render() {
    const today = ET(Date.now()), groups = {};
    REL.forEach((r, i) => { (groups[ET(r.published_at)] = groups[ET(r.published_at)] || []).push(i); });
    const days = Object.keys(groups).sort().reverse(), first = days[0];
    const posted = store.get("posted-" + CFG.key), top = first ? groups[first] : [];
    document.getElementById("latest").innerHTML = top.length ? `<div class="sec"><h2>${esc(dayName(first))}</h2><span>${top.length} video${top.length > 1 ? "s" : ""} · ${top.filter(i => posted[REL[i].tag_name]).length} posted</span></div>${top.map(i => card(REL[i], i)).join("")}`
      : `<p class="empty">${esc(CFG.empty)}</p>`;
    document.getElementById("older").innerHTML = days.length > 1 ? `<div class="sec"><h2>Earlier</h2><span>${REL.length - top.length} videos</span></div>` +
      days.slice(1).map(d => `<details class="day"><summary>${esc(dayName(d))}<span>${groups[d].length} video${groups[d].length > 1 ? "s" : ""}</span></summary>${groups[d].map(i => row(REL[i], i)).join("")}</details>`).join("") : "";
    document.getElementById("up").textContent = REL[0] ? "Newest " + ago(REL[0].published_at) : "";
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return; const r = REL[+b.dataset.i]; if (!r) return;
    if (b.dataset.act === "title") copy(r.name, "Title");
    if (b.dataset.act === "cap") copy(r.body || "", "Caption");
    if (b.dataset.act === "tags") copy(tagsFor(r), "YouTube tags");
    if (b.dataset.act === "posted") { const p = store.get("posted-" + CFG.key); p[r.tag_name] ? delete p[r.tag_name] : (p[r.tag_name] = Date.now()); store.set("posted-" + CFG.key, p); render(); }
  });
  window.VP = { start: async cfg => {
    CFG = cfg;
    fetch("../stats/latest.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => { STATS = j && j.channels && j.channels[cfg.key] ? Object.assign({ updated: j.updated }, j.channels[cfg.key]) : null; stats(); if (REL.length) render(); }).catch(() => stats());
    try { const r = await fetch(`https://api.github.com/repos/${cfg.repo}/releases?per_page=60`); if (!r.ok) throw new Error(r.status);
      REL = (await r.json()).filter(x => cfg.match.test(x.tag_name) && mp4(x)).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)); render(); }
    catch (e) { document.getElementById("latest").innerHTML = `<p class="empty">Couldn't reach GitHub just now. Pull down to refresh.</p>`; }
  } };
})();
