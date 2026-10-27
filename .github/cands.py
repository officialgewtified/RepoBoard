import json, urllib.request, urllib.parse, subprocess, os, re, sys
from PIL import Image, ImageDraw
Q = {"asteroid": ["asteroid animation", "Bennu OSIRIS-REx animation", "DART asteroid animation", "Psyche asteroid animation"],
     "aurora": ["aurora space station", "aurora borealis", "northern lights"],
     "sun": ["SDO sun", "solar flare", "sun 4K"],
     "launch": ["rocket launch", "Artemis launch", "SLS launch"],
     "moon": ["moon LRO", "moon flyover", "lunar surface"],
     "earth": ["Earth views space station", "earth from space 4K", "ISS time-lapse"]}
BAD = re.compile(r"live|podcast|this week|asks|interview|briefing|conference|twitch|expert|talk|explain|q&a|episode|panel|webinar|town hall|news|update|reel|promo|trailer|social|minute|we asked|why|how|what", re.I)
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}), timeout=60) as r: return r.read()
os.makedirs("out", exist_ok=True); allc = {}
for topic, qs in Q.items():
    seen, C = set(), []
    for q in qs:
        d = json.loads(get("https://images-api.nasa.gov/search?media_type=video&q=" + urllib.parse.quote(q)))
        for it in d["collection"]["items"]:
            m = it["data"][0]; i = m["nasa_id"]
            if i in seen or BAD.search(m.get("title", "")) or re.search(r"©|copyright|courtesy|getty|reuters", m.get("description", ""), re.I): continue
            seen.add(i); C.append((i, m.get("title", "")[:50], it["href"]))
            if len(C) >= 12: break
        if len(C) >= 12: break
    tiles = []
    for k, (i, title, href) in enumerate(C):
        try:
            files = json.loads(get(href.replace(" ", "%20")))
            mob = [f for f in files if f.endswith("~mobile.mp4")] or [f for f in files if f.endswith("~preview.mp4")]
            if not mob: continue
            fn = f"/tmp/{topic}{k}.mp4"; open(fn, "wb").write(get(mob[0].replace(" ", "%20")))
            dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fn], capture_output=True, text=True).stdout or 0)
            fr = []
            for p in (.25, .45, .65):
                o = f"/tmp/{topic}{k}_{int(p*100)}.jpg"; subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(dur * p), "-i", fn, "-frames:v", "1", "-vf", "scale=240:-2", o]); fr.append(o)
            tiles.append((k, i, title, dur, fr)); allc[f"{topic}{k}"] = {"id": i, "title": title, "dur": dur}
        except Exception as e: print("skip", i, e)
    if not tiles: continue
    W, H = 240 * 3 + 10, 135 + 22
    S = Image.new("RGB", (W, H * len(tiles)), "black"); D = ImageDraw.Draw(S)
    for r, (k, i, title, dur, fr) in enumerate(tiles):
        for c, f in enumerate(fr):
            try: S.paste(Image.open(f).resize((240, 135)), (c * 243, r * H + 22))
            except Exception: pass
        D.text((4, r * H + 4), f"{topic}{k} {int(dur)}s {title}", fill="white")
    S.save(f"out/{topic}.jpg", quality=70); print(topic, len(tiles))
json.dump(allc, open("out/cands.json", "w"), indent=1)
