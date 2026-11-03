"""Real photos for the Liftoff covers: NASA/ESA public-domain (or CC0 / CC BY) images from Wikimedia Commons.
Only images big enough that the cropped subject is still at least 1080 px (MIN_SIDE) are kept.

  python tools/space_photos.py scout      -> out/photos/: candidates for every subject, auto-cropped, plus sheet-<subject>.jpg
                                              contact sheets and candidates.json (title, license, author, size)
  python tools/space_photos.py pick '{"jupiter": 3, ...}'
                                           -> re-downloads the chosen candidates at full size, crops, and writes
                                              space/ref/photos/<subject>.png (bodies, transparent background) or .jpg
                                              (backgrounds), plus space/ref/photos/credits.json

Bodies (planets, the Moon, Bennu) are cut out of the black sky automatically: the bright disc (plus rings) is found by
brightness, squared up, and everything darker than the sky threshold outside it is made transparent."""
import io, json, os, re, sys, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

UA = {"User-Agent": "LiftoffBot/1.0 (https://github.com/officialgewtified/RepoBoard)"}
OK = re.compile(r"public domain|^pd|cc0|cc[- ]by[- ]\d|cc[- ]by \d", re.I)
MIN_SIDE = 1080
# subject -> (kind, searches). body = cut out a round thing; bg = full-frame photo used as a background
S = {
 "mercury": ("body", ["Mercury MESSENGER true color", "Mercury globe MESSENGER mosaic", "Mercury planet true colour"]),
 "venus": ("body", ["Venus Mariner 10 true color", "Venus real color", "Venus globe Mariner 10 PIA23791"]),
 "earth": ("body", ["The Earth seen from Apollo 17", "Blue Marble EPIC DSCOVR", "Earth full disk DSCOVR"]),
 "moon": ("body", ["Moon nearside LRO", "full moon Lunar Reconnaissance Orbiter mosaic", "Moon Galileo true color"]),
 "mars": ("body", ["Mars Valles Marineris Viking mosaic globe", "Mars Hubble true color", "Mars true color globe"]),
 "jupiter": ("body", ["Jupiter Hubble OPAL", "Jupiter Cassini true color", "Jupiter Hubble 2019"]),
 "saturn": ("body", ["Saturn Cassini natural color mosaic", "Saturn during Equinox", "Saturn Hubble 2019"]),
 "uranus": ("body", ["Uranus Voyager 2 true color", "Uranus as seen by Voyager 2", "Uranus Voyager remastered"]),
 "neptune": ("body", ["Neptune Voyager 2 full disk", "Neptune Voyager 2 true color", "Neptune Voyager 2 remastered"]),
 "bennu": ("body", ["Bennu mosaic OSIRIS-REx", "Bennu global mosaic", "asteroid Bennu OSIRIS-REx"]),
 "launch": ("bg", ["Artemis I launch Space Launch System", "Falcon 9 launch night Kennedy", "rocket launch Kennedy Space Center NASA"]),
 "aurora": ("bg", ["aurora International Space Station NASA", "aurora borealis Alaska NASA", "aurora australis ISS"]),
 "earthlimb": ("bg", ["Earth limb sunrise International Space Station", "Earth from ISS night city lights", "sunrise over Earth ISS"]),
}

def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read()

def search(q, want):
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "generator": "search", "gsrnamespace": 6,
          "gsrsearch": q + " filetype:bitmap", "gsrlimit": 20, "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime", "iiurlwidth": want, "format": "json"})
    try: pages = json.loads(get(api)).get("query", {}).get("pages", {})
    except Exception as e: print("search", q, e); return []
    out = []
    for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
        ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {}) or {}
        lic = (md.get("LicenseShortName", {}) or {}).get("value", "")
        if not OK.search(lic) or (re.search(r"\bsa\b|share", lic, re.I) and not re.search(r"public|cc0", lic, re.I)): continue
        out.append({"title": p["title"], "license": lic, "artist": re.sub("<[^>]+>", "", (md.get("Artist", {}) or {}).get("value", ""))[:100],
                    "credit": re.sub("<[^>]+>", "", (md.get("Credit", {}) or {}).get("value", ""))[:120], "page": ii.get("descriptionurl"),
                    "orig": ii.get("url"), "thumb": ii.get("thumburl"), "w": ii.get("width", 0), "h": ii.get("height", 0)})
    return out

def cut_body(im):
    """the round subject on black sky -> square RGBA, transparent around it; None if it doesn't look like one"""
    g = ImageOps.grayscale(im).filter(ImageFilter.GaussianBlur(2))
    lim = max(18, int(sorted(g.getdata())[int(g.width * g.height * .5)] * 1.6) + 10)   # brighter than most of the sky
    k = max(5, (min(im.size) // 300) | 1)   # erase stars and specks before measuring the subject
    m = g.point(lambda v: 255 if v > lim else 0).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    bb = m.getbbox()
    if not bb: return None
    x0, y0, x1, y1 = bb; w, h = x1 - x0, y1 - y0
    if w < im.width * .25 and h < im.height * .25: return None
    side = int(max(w, h) * 1.06); cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    sq = Image.new("RGB", (side, side), (0, 0, 0)); sq.paste(im.crop(box), (0, 0))
    alpha = ImageOps.grayscale(sq).point(lambda v: 0 if v < lim * .45 else 255 if v > lim else int((v - lim * .45) / (lim * .55) * 255)).filter(ImageFilter.GaussianBlur(1.5))
    # keep the inside of the disc solid even where it's dark (night side, shadows): fill the subject's outline
    solid = alpha.point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    out = sq.convert("RGBA"); out.putalpha(Image.composite(Image.new("L", sq.size, 255), alpha, solid.filter(ImageFilter.GaussianBlur(2)).point(lambda v: 255 if v > 200 else 0)))
    return out

def scout():
    os.makedirs("out/photos", exist_ok=True); allc = {}
    for sub, (kind, qs) in S.items():
        seen, cands = set(), []
        for q in qs:
            for c in search(q, 2400):
                if c["title"] in seen: continue
                seen.add(c["title"])
                if min(c["w"], c["h"]) < (1600 if kind == "body" else 1080) or (kind == "bg" and c["w"] < 1920): continue
                cands.append(c)
        cands = cands[:8]; tiles = []
        for i, c in enumerate(cands):
            try:
                im = Image.open(io.BytesIO(get(c["thumb"] or c["orig"]))).convert("RGB")
                if kind == "body":
                    cut = cut_body(im)
                    if cut is None: c["skip"] = "no round subject found"; continue
                    c["cut_px"] = cut.width * (c["w"] / im.width)   # the subject's size at full resolution
                    if c["cut_px"] < MIN_SIDE: c["skip"] = f"subject only {int(c['cut_px'])} px"; continue
                    prev = Image.new("RGB", cut.size, (30, 10, 60)); prev.paste(cut, (0, 0), cut)
                else: prev = im
                c["i"] = i; tiles.append((i, prev, c))
            except Exception as e: c["skip"] = str(e)[:80]
        allc[sub] = cands
        if tiles:   # contact sheet: 4 across, labelled
            T = 480; cols = 4; rows = (len(tiles) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * (T + 10), rows * (T + 70)), "white"); d = ImageDraw.Draw(sheet)
            for k, (i, p, c) in enumerate(tiles):
                p = p.copy(); p.thumbnail((T, T)); x, y = k % cols * (T + 10), k // cols * (T + 70)
                sheet.paste(p, (x + (T - p.width) // 2, y)); d.text((x + 4, y + T + 4), f"#{i} {c['w']}x{c['h']} {c['license'][:22]}", fill="black"); d.text((x + 4, y + T + 22), c["title"][5:60], fill="black")
            sheet.save(f"out/photos/sheet-{sub}.jpg", quality=82)
        print(sub, len(cands), "candidates,", len(tiles), "usable")
    json.dump(allc, open("out/photos/candidates.json", "w"), indent=1)

def pick(picks):
    allc = json.load(open("out/photos/candidates.json")) if os.path.exists("out/photos/candidates.json") else {}
    os.makedirs("space/ref/photos", exist_ok=True)
    credits = json.load(open("space/ref/photos/credits.json")) if os.path.exists("space/ref/photos/credits.json") else {}
    for sub, i in picks.items():
        kind = S[sub][0]
        c = next((x for x in allc.get(sub, []) if x.get("i") == i), None) if isinstance(i, int) else None
        if c is None and isinstance(i, str): c = next((x for x in search(i.replace("File:", ""), 3200) if x["title"] == i), None)
        if c is None: print("no candidate", sub, i); continue
        src = c["orig"] if max(c["w"], c["h"]) <= 4200 else (search(c["title"].replace("File:", ""), 4000) or [c])[0].get("thumb") or c["orig"]
        im = Image.open(io.BytesIO(get(src))).convert("RGB")
        if kind == "body":
            cut = cut_body(im); cut.thumbnail((2000, 2000), Image.LANCZOS); cut.save(f"space/ref/photos/{sub}.png", optimize=True); px = cut.width
        else:
            im.thumbnail((2560, 2560), Image.LANCZOS); im.save(f"space/ref/photos/{sub}.jpg", quality=90); px = min(im.size)
        credits[sub] = {"title": c["title"], "page": c["page"], "license": c["license"], "artist": c["artist"], "credit": c.get("credit", ""), "px": px}
        print("saved", sub, px, "px", c["title"])
    json.dump(credits, open("space/ref/photos/credits.json", "w"), indent=1)

if __name__ == "__main__":
    if sys.argv[1] == "scout": scout()
    else: pick(json.loads(sys.argv[2]))
