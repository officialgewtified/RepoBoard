/* Channel stats for the video pages: subscribers, total views, and views/likes/comments on recent uploads, from the
   YouTube Data API (needs the YT_API_KEY repo secret; free, read-only). Keeps one snapshot per day in history.json so
   the pages can show the gain over the last 7 days. Writes latest.json. TikTok slots stay empty until it's linked.
   usage: node stats/fetch.js */
"use strict";
const fs = require("fs"), path = require("path"), H = __dirname, KEY = process.env.YT_API_KEY;
const CH = JSON.parse(fs.readFileSync(path.join(H, "channels.json"), "utf8"));
const yt = async (ep, q) => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${ep}?${new URLSearchParams({ ...q, key: KEY })}`); const j = await r.json(); if (!r.ok) throw new Error(`${ep} ${r.status} ${JSON.stringify(j.error && j.error.message)}`); return j; };
async function youtube(handle) {
  const c = await yt("channels", { part: "statistics,contentDetails,snippet", forHandle: handle.replace(/^@?/, "@") }), ch = (c.items || [])[0];
  if (!ch) throw new Error("no channel for " + handle);
  const up = ch.contentDetails.relatedPlaylists.uploads, ids = [];
  try { const p = await yt("playlistItems", { part: "contentDetails", playlistId: up, maxResults: 40 }); for (const it of p.items || []) ids.push(it.contentDetails.videoId); } catch (e) { console.error(e.message); }
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) { const v = await yt("videos", { part: "snippet,statistics", id: ids.slice(i, i + 50).join(",") });
    for (const x of v.items || []) videos.push({ id: x.id, title: x.snippet.title, at: x.snippet.publishedAt, views: +x.statistics.viewCount || 0, likes: +x.statistics.likeCount || 0, comments: +x.statistics.commentCount || 0 }); }
  const s = ch.statistics;
  return { name: ch.snippet.title, subs: +s.subscriberCount || 0, views: +s.viewCount || 0, count: +s.videoCount || 0, videos: videos.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) };
}
(async () => {
  if (!KEY) { console.log("No YT_API_KEY secret yet; nothing to fetch."); return; }
  const hf = path.join(H, "history.json"), hist = fs.existsSync(hf) ? JSON.parse(fs.readFileSync(hf, "utf8")) : {};
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }), out = { updated: new Date().toISOString(), channels: {} };
  for (const [k, c] of Object.entries(CH)) {
    const o = {};
    if (c.youtube) try { o.youtube = await youtube(c.youtube); } catch (e) { console.error(k, "youtube:", e.message); }
    if (o.youtube) {
      const H2 = (hist[k] = hist[k] || {}); H2[today] = { subs: o.youtube.subs, views: o.youtube.views };
      const old = Object.keys(H2).sort().filter(d => d <= new Date(Date.now() - 7 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/New_York" })).pop() || Object.keys(H2).sort()[0];
      if (old !== today) { o.youtube.subs7 = H2[old].subs; o.youtube.views7 = H2[old].views; }
      o.youtube.history = Object.keys(H2).sort().slice(-60).map(d => [d, H2[d].subs, H2[d].views]);
      console.log(k, o.youtube.name, o.youtube.subs, "subs", o.youtube.views, "views", o.youtube.videos.length, "videos");
    }
    out.channels[k] = o;
  }
  fs.writeFileSync(hf, JSON.stringify(hist, null, 1)); fs.writeFileSync(path.join(H, "latest.json"), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
