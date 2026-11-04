"""Real photos for the Liftoff covers: NASA/ESA public-domain (or CC0 / CC BY) images from Wikimedia Commons.
Only images big enough that the cropped subject is still at least 1080 px (MIN_SIDE) are kept.

  python tools/space_photos.py scout ['{"only": ["venus"], "extra": {"venus": ["more searches"]}}']
                                         -> out/photos/: candidates for every subject, auto-cropped, plus sheet-<subject>.jpg
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
MINS = {"venus": 800}   # no real photo of Venus 1080+ exists (bigger "globes" are renderings); the user OK'd the real 832 px one
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
 # size references for asteroids (cut out of their background with rembg)
 "bus": ("obj", ["school bus side view", "yellow school bus side", "school bus profile parked"]),
 "car": ("obj", ["sedan side view", "car side profile", "compact car side view white background"]),
 "plane": ("obj", ["Boeing 747 side view", "Boeing 747-400 in flight", "Boeing 747-8 takeoff"]),
 "tower": ("obj", ["Eiffel Tower", "Eiffel Tower from Trocadero", "Tour Eiffel blue sky"]),
 "tower2": ("obj", ["Empire State Building", "Empire State Building blue sky", "Empire State Building from Fifth Avenue"]),
 "whale": ("obj", ["blue whale NOAA", "Balaenoptera musculus surfacing", "blue whale side view"]),
 "field": ("bg", ["American football field aerial", "football field aerial view", "football stadium field from above"]),
}
_SESS = None
def cut_obj(im):
    """a thing on a background (bus, plane, tower, whale) -> RGBA cut tight around it, using rembg's segmentation model"""
    global _SESS
    from rembg import remove, new_session
    _SESS = _SESS or new_session("isnet-general-use")
    out = remove(im, session=_SESS)
    bb = out.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bb: return None
    out = out.crop(bb); out.info["disc"] = max(out.size); return out

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

SHAPE = {"saturn": "free", "bennu": "hull"}   # everything else is a sphere: cut along a fitted circle

def cut_body(im, shape="round"):
    """the round subject on black sky -> square RGBA, transparent only where it's really sky; None if there's no subject.
    The sky level comes from the frame's border (not the median: a planet can fill most of the frame). The subject is the
    biggest bright shape (plus anything big attached, like rings); dark areas INSIDE it (oceans, lunar seas, the night
    side) stay solid, and an enclosed hole is only cleared if it's as dark as the sky (the gap between Saturn and its rings)."""
    import numpy as np
    from scipy import ndimage as nd
    a = np.asarray(ImageOps.grayscale(im).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32)
    b = max(4, min(a.shape) // 100)
    border = np.concatenate([a[:b].ravel(), a[-b:].ravel(), a[:, :b].ravel(), a[:, -b:].ravel()])
    sky = float(np.percentile(border, 90)); lim = max(sky * 1.5 + 14, 24)
    k = max(3, min(a.shape) // 400)
    m = nd.binary_opening(a > lim, iterations=k)                    # stars and specks gone
    lab, n = nd.label(m)
    if not n: return None
    sizes = nd.sum(m, lab, range(1, n + 1)); big = sizes.max()
    keep = np.isin(lab, [i + 1 for i, z in enumerate(sizes) if z >= big * .02])
    disc = None
    if shape in ("round", "hull"):   # a planet, moon or asteroid is solid out to its outline, even where its surface is as dark as space
        from scipy.spatial import ConvexHull
        edge_px = keep & ~nd.binary_erosion(keep)
        pts = np.column_stack(np.nonzero(edge_px))[:, ::-1].astype(np.float64)
        if len(pts) > 4000: pts = pts[np.random.default_rng(0).choice(len(pts), 4000, replace=False)]
        hv = pts[ConvexHull(pts).vertices]
        if shape == "round":   # least-squares circle through the outline (the lit limb dominates; a dark limb doesn't flatten it)
            A = np.column_stack([2 * hv[:, 0], 2 * hv[:, 1], np.ones(len(hv))]); bb = (hv ** 2).sum(1)
            (cx0, cy0, c0), *_ = np.linalg.lstsq(A, bb, rcond=None); r0 = float(np.sqrt(c0 + cx0 ** 2 + cy0 ** 2))
            ext = max(np.ptp(hv[:, 0]), np.ptp(hv[:, 1])) / 2
            if ext * .9 <= r0 <= ext * 1.35: disc = (cx0, cy0, r0)
        if disc is None:
            hm = Image.new("L", im.size, 0); ImageDraw.Draw(hm).polygon([tuple(map(float, v)) for v in hv], fill=255)
            keep = keep | (np.asarray(hm) > 0)
    if disc is not None:
        cx0, cy0, r0 = disc; yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        alpha = np.clip(r0 - np.hypot(xx - cx0, yy - cy0) + .5, 0, 1)
        al = Image.fromarray((alpha * 255).astype(np.uint8))
        side = int(2 * r0 * 1.06); box = (int(cx0 - side / 2), int(cy0 - side / 2), int(cx0 - side / 2) + side, int(cy0 - side / 2) + side)
        rgba = im.convert("RGBA"); rgba.putalpha(al)
        out = Image.new("RGBA", (side, side), (0, 0, 0, 0)); out.paste(rgba.crop(box), (0, 0)); out.info["disc"] = int(2 * r0)
        return out
    full = nd.binary_fill_holes(keep); holes, nh = nd.label(full & ~keep)
    for h in range(1, nh + 1):                                       # a hole as dark as the sky is sky; anything else is surface
        hm = holes == h
        if a[hm].mean() <= sky + 6 and hm.sum() > big * .002: full[hm] = False
    ys, xs = np.nonzero(full)
    if not len(xs): return None
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    if (x1 - x0) < im.width * .2 and (y1 - y0) < im.height * .2: return None
    # soft edge: solid inside, a smooth ramp over the limb so it isn't jagged, nothing beyond
    ramp = np.clip((a - sky) / max(1, lim - sky), 0, 1)
    edge = nd.binary_dilation(full, iterations=3) & ~nd.binary_erosion(full, iterations=2)
    alpha = np.where(full & ~edge, 1.0, np.where(edge, np.maximum(ramp, nd.binary_erosion(full, iterations=1) * 1.0), 0.0))
    al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))
    side = int(max(x1 - x0, y1 - y0) * 1.06); cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    rgba = im.convert("RGBA"); rgba.putalpha(al)
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0)); out.paste(rgba.crop(box), (0, 0))
    out.info["disc"] = max(x1 - x0, y1 - y0)
    return out

def scout(only=None, extra=None):
    os.makedirs("out/photos", exist_ok=True); allc = {}
    for sub, (kind, qs) in S.items():
        if only and sub not in only: continue
        qs = qs + (extra or {}).get(sub, [])
        seen, cands = set(), []
        for q in qs:
            for c in search(q, 2400):
                if c["title"] in seen: continue
                seen.add(c["title"])
                if min(c["w"], c["h"]) < (1600 if kind == "body" and sub not in MINS else MINS.get(sub, 1080)) or (kind == "bg" and c["w"] < 1920) or (kind == "obj" and max(c["w"], c["h"]) < 1600): continue
                cands.append(c)
        cands = cands[:12]; tiles = []
        for i, c in enumerate(cands):
            try:
                im = Image.open(io.BytesIO(get(c["thumb"] or c["orig"]))).convert("RGB")
                if kind == "body":
                    cut = cut_body(im, SHAPE.get(sub, "round"))
                    if cut is None: c["skip"] = "no round subject found"; continue
                    c["cut_px"] = cut.info["disc"] * (c["w"] / im.width)   # the subject's size at full resolution
                    if c["cut_px"] < MINS.get(sub, MIN_SIDE): c["skip"] = f"subject only {int(c['cut_px'])} px"; continue
                    prev = Image.new("RGB", cut.size, (30, 10, 60)); prev.paste(cut, (0, 0), cut)
                elif kind == "obj":
                    cut = cut_obj(im)
                    if cut is None: c["skip"] = "nothing cut out"; continue
                    c["cut_px"] = cut.info["disc"] * (c["w"] / im.width)
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
            cut = cut_body(im, SHAPE.get(sub, "round"))
            if cut is None: print("no subject found in", c["title"]); continue
            disc = cut.info["disc"]; cut.thumbnail((2000, 2000), Image.LANCZOS); px = int(disc * cut.width / max(1, int(disc * 1.06)))
            if px < MINS.get(sub, MIN_SIDE): print("too small:", sub, px, "px"); continue
            cut.save(f"space/ref/photos/{sub}.png", optimize=True)
        elif kind == "obj":
            cut = cut_obj(im)
            if cut is None: print("nothing cut out of", c["title"]); continue
            cut.thumbnail((2000, 2000), Image.LANCZOS); px = max(cut.size)
            if px < MIN_SIDE: print("too small:", sub, px, "px"); continue
            cut.save(f"space/ref/photos/{sub}.png", optimize=True)
        else:
            im.thumbnail((2560, 2560), Image.LANCZOS); im.save(f"space/ref/photos/{sub}.jpg", quality=90); px = min(im.size)
        credits[sub] = {"title": c["title"], "page": c["page"], "license": c["license"], "artist": c["artist"], "credit": c.get("credit", ""), "px": px}
        print("saved", sub, px, "px", c["title"])
    json.dump(credits, open("space/ref/photos/credits.json", "w"), indent=1)

if __name__ == "__main__":
    if sys.argv[1] == "scout":
        arg = json.loads(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].strip() else {}
        scout(arg.get("only"), arg.get("extra"))
    else: pick(json.loads(sys.argv[2]))
