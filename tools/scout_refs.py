"""One-off: find freely licensed photos for the Liftoff size comparison (Wikimedia Commons), cut out the background,
and make a contact sheet to pick from. Public domain, CC0 and CC BY only (no share-alike). Writes out/refs/."""
import json, os, re, io, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont
UA = {"User-Agent": "LiftoffBot/1.0 (https://github.com/officialgewtified/RepoBoard)"}
Q = {"car": ["sedan side view", "Toyota Camry side", "Honda Civic sedan side"], "bus": ["school bus side view"], "whale": ["blue whale illustration NOAA", "Balaenoptera musculus drawing"],
     "plane": ["Boeing 747 side view", "Boeing 747-400 landing"], "tower": ["Eiffel Tower from Champ de Mars"], "tower2": ["Empire State Building from"],
     "asteroid": ["Bennu OSIRIS-REx mosaic", "433 Eros NEAR Shoemaker", "Didymos Dimorphos DART"]}
OK = re.compile(r"public domain|^pd|cc0|cc[- ]by[- ]\d|cc[- ]by \d", re.I)
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
os.makedirs("out/refs", exist_ok=True)
from rembg import remove
cands, tiles = [], []
for key, qs in Q.items():
    n = 0
    for q in qs:
        api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "generator": "search", "gsrnamespace": 6, "gsrsearch": q + " filetype:bitmap",
              "gsrlimit": 12, "prop": "imageinfo", "iiprop": "url|extmetadata|size", "iiurlwidth": 1200, "format": "json"})
        try: pages = json.loads(get(api)).get("query", {}).get("pages", {})
        except Exception as e: print("search", q, e); continue
        for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
            ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
            lic = (md.get("LicenseShortName", {}) or {}).get("value", ""); art = re.sub("<[^>]+>", "", (md.get("Artist", {}) or {}).get("value", ""))[:80]
            if not OK.search(lic) or re.search(r"sa", lic, re.I) and not re.search(r"public|cc0", lic, re.I): continue
            if n >= 6: break
            try:
                im = Image.open(io.BytesIO(get(ii["thumburl"]))).convert("RGB")
                cut = im if key == "asteroid" else remove(im)
                i = len(cands); f = f"out/refs/{i:02d}-{key}.png"; cut.save(f)
                cands.append({"i": i, "key": key, "title": p["title"], "license": lic, "artist": art, "page": ii.get("descriptionurl"), "file": os.path.basename(f), "w": im.width, "h": im.height})
                tiles.append((i, key, lic, cut)); n += 1; print(i, key, p["title"], lic)
            except Exception as e: print("img", p.get("title"), e)
json.dump(cands, open("out/refs/candidates.json", "w"), indent=1)
# contact sheet: 6 per row, cutouts on dark grey
W, H = 300, 230; rows = (len(tiles) + 5) // 6; sheet = Image.new("RGB", (6 * W, rows * H), (28, 30, 38)); d = ImageDraw.Draw(sheet)
for k, (i, key, lic, im) in enumerate(tiles):
    x, y = (k % 6) * W, (k // 6) * H; t = im.copy(); t.thumbnail((W - 16, H - 46))
    bg = Image.new("RGBA", t.size, (28, 30, 38, 255)); bg.alpha_composite(t.convert("RGBA")); sheet.paste(bg.convert("RGB"), (x + 8, y + 8))
    d.text((x + 8, y + H - 34), f"#{i} {key}", fill=(255, 210, 90)); d.text((x + 8, y + H - 18), lic[:40], fill=(170, 180, 200))
sheet.save("out/refs/sheet.jpg", quality=85); print(len(tiles), "candidates")
