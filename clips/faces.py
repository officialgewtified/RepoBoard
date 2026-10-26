"""Cut-out player photos for the video, from Wikimedia Commons only (free to reuse, credited in the caption), never
ESPN or league headshots.

For each player it gathers every photo of them on Commons (their category, its sub-categories, and a search), and
ranks them: wearing their current team (the team's name in the photo's title, description or categories), newest
first, a clear face toward the camera, big and sharp enough. Then it cuts the player out with BiRefNet (a sharp
cut-out model), keeps only the person whose face it found (no teammates at the edges), and frames head and chest
the same way for everyone. Results are kept in faces/index.json, so each player is looked up once (again if they
change teams; misses are retried after two weeks).
usage: python faces.py data.json      (adds "photo" to each card/row that has one, and data["credits"])"""
import io, json, os, re, sys, time, datetime, html
import urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "faces")
INDEX = os.path.join(DIR, "index.json")
VERSION = 4
UA = "CrossoverStatsVideo/1.0 (https://github.com/officialgewtified/RepoBoard; daily sports stats recap)"
SPORT_Q = {"NBA": {"Q3665646"}, "NFL": {"Q19204627", "Q14128148"}, "CFB": {"Q19204627", "Q14128148"}}
SPORT_WORD = {"NBA": "basketball", "NFL": "football", "CFB": "football"}
OK_LICENSE = re.compile(r"^(CC BY(-SA)? \d(\.\d)?|CC0|Public domain|PD\b|CC-BY(-SA)?-\d)", re.I)
THIS_YEAR = datetime.date.today().year

def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40)
            b = r.read()
            return b if binary else json.loads(b)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))

def api(host, **p):
    p["format"] = "json"
    return get(f"https://{host}/w/api.php?" + urllib.parse.urlencode(p))

def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def entity(name, sport):
    """the player's Wikidata item: main photo (P18) and Commons category (P373)"""
    hits = api("www.wikidata.org", action="wbsearchentities", search=name, language="en", type="item", limit=8).get("search", [])
    if not hits:
        return None, None
    ents = api("www.wikidata.org", action="wbgetentities", ids="|".join(h["id"] for h in hits), props="claims|descriptions", languages="en")["entities"]
    for h in hits:
        e = ents.get(h["id"], {}); cl = e.get("claims", {})
        occ = {c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in cl.get("P106", [])}
        desc = (e.get("descriptions", {}).get("en", {}) or {}).get("value", "")
        if not (occ & SPORT_Q[sport] or SPORT_WORD[sport] in desc.lower()):
            continue
        val = lambda p: [c["mainsnak"].get("datavalue", {}).get("value") for c in cl.get(p, []) if c["mainsnak"].get("datavalue")]
        p18, p373 = val("P18"), val("P373")
        return (p18[-1] if p18 else None), (p373[0] if p373 else None)
    return None, None

def members(cat, kinds, limit):
    try:
        r = api("commons.wikimedia.org", action="query", list="categorymembers", cmtitle="Category:" + cat, cmtype=kinds, cmlimit=limit)
        return r.get("query", {}).get("categorymembers", [])
    except Exception:
        return []

def gather(name, team, p18, cat):
    files, words = [], [w.lower() for w in (team.get("short"), team.get("name")) if w]
    if p18:
        files.append("File:" + p18)
    if cat:
        subs = []
        for m in members(cat, "file|subcat", 300):
            if m["ns"] == 6:
                files.append(m["title"])
            elif m["ns"] == 14:
                subs.append(m["title"].split(":", 1)[1])
        # sub-categories with the team's name or a recent year first ("Luka Dončić with the Los Angeles Lakers", "... in 2025")
        rank = lambda s: (any(w in s.lower() for w in words), max([int(y) for y in re.findall(r"20\d\d", s)] or [0]))
        for s in sorted(subs, key=rank, reverse=True)[:10]:
            files += [m["title"] for m in members(s, "file", 150)]
    for q in [f'"{name}" {team.get("short", "")}', f'"{name}"']:
        try:
            r = api("commons.wikimedia.org", action="query", list="search", srsearch=q, srnamespace=6, srlimit=40)
            files += [x["title"] for x in r.get("query", {}).get("search", [])]
        except Exception:
            pass
    seen, out = set(), []
    for f in files:
        if f not in seen and re.search(r"\.(jpe?g|png)$", f, re.I):
            seen.add(f); out.append(f)
    return out[:300]

def infos(titles):
    out = {}
    for i in range(0, len(titles), 40):
        try:
            r = api("commons.wikimedia.org", action="query", titles="|".join(titles[i:i + 40]), prop="imageinfo|categories",
                    iiprop="url|size|mime|extmetadata", iiurlwidth=1600, cllimit="max", clshow="!hidden")
        except Exception:
            continue
        for pg in r.get("query", {}).get("pages", {}).values():
            ii = (pg.get("imageinfo") or [{}])[0]
            if not ii:
                continue
            md = ii.get("extmetadata", {})
            val = lambda k: html.unescape(re.sub(r"<[^>]+>", " ", (md.get(k) or {}).get("value", ""))).strip()
            out[pg["title"]] = {"title": pg["title"], "url": ii.get("thumburl") or ii.get("url"), "w": ii.get("width", 0), "h": ii.get("height", 0),
                                "mime": ii.get("mime", ""), "license": val("LicenseShortName"), "artist": val("Artist") or "Unknown",
                                "desc": val("ImageDescription")[:400], "date": val("DateTimeOriginal") or val("DateTime"), "page": ii.get("descriptionurl"),
                                "cats": " ".join(c["title"] for c in pg.get("categories", []))}
    return out

def meta_score(f, name, team):
    if f["mime"] not in ("image/jpeg", "image/png") or min(f["w"], f["h"]) < 700:
        return None
    if not OK_LICENSE.match(f["license"]) or re.search(r"\bN[CD]\b", f["license"]):
        return None
    text = (f["title"] + " " + f["desc"] + " " + f["cats"]).lower()
    # the player's own name has to be in the file's title: a photo filed under him can still be of a teammate
    last = re.sub(r"\b(jr|sr|ii|iii|iv)\.?$", "", name.lower()).split()[-1]
    if slug(last) not in slug(f["title"]):
        return None
    # TV and interview screenshots carry on-screen graphics that end up in the cut-out
    if re.search(r"interview|screenshot|screen ?grab|still|podcast|press conference", f["title"], re.I):
        return None
    yrs = [int(y) for y in re.findall(r"(?<!\d)(19[89]\d|20[0-3]\d)(?!\d)", f["date"] + " " + f["title"]) if int(y) <= THIS_YEAR]
    year = max(yrs) if yrs else 2012
    team_hit = any(w and w.lower() in text for w in (team.get("short"), team.get("name")))
    s = (3.0 if team_hit else 0) + max(0, min(8, year - 2017)) * .45
    s += .5 if "crop" in f["title"].lower() else 0
    s += .4 if f["h"] >= f["w"] * .9 else 0
    s -= .8 if re.search(r"\b(and|vs\.?|versus|with)\b|&", re.sub(r"\(.*?\)", "", f["title"]).lower()) and "crop" not in f["title"].lower() else 0
    return s, year, team_hit

_cascade = None
def best_face(raw):
    """the biggest frontal face, how sharp it is, and how many other similar-size faces there are"""
    global _cascade
    import cv2, numpy as np
    if _cascade is None:
        _cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = _cascade.detectMultiScale(g, 1.08, 7, minSize=(70, 70))
    if len(faces) == 0:
        return None
    faces = sorted(faces, key=lambda f: -f[3])
    x, y, w, h = [int(v) for v in faces[0]]
    sharp = cv2.Laplacian(g[y:y + h, x:x + w], cv2.CV_64F).var()
    crowd = sum(1 for f in faces[1:] if f[3] > h * .6)
    return {"box": (x, y, w, h), "sharp": float(sharp), "crowd": crowd}

_sess = None
def session():
    global _sess
    if _sess is None:
        from rembg import new_session
        for m in ("birefnet-portrait", "isnet-general-use", "u2net_human_seg"):
            try:
                _sess = new_session(m); print("cut-out model:", m); break
            except Exception as e:
                print("model", m, "unavailable:", str(e)[:80])
    return _sess

def cutout(raw, face):
    """head and chest around the face, background removed, only the person the face belongs to"""
    import numpy as np
    from PIL import Image
    from rembg import remove
    from scipy import ndimage
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    x, y, w, h = face["box"]; W, H = im.size
    cx = x + w / 2
    box = (max(0, int(cx - 2.3 * h)), max(0, int(y - 1.0 * h)), min(W, int(cx + 2.3 * h)), min(H, int(y + 5.6 * h)))
    crop = im.crop(box)
    cut = remove(crop, session=session())
    a = np.array(cut.split()[-1])
    lab, n = ndimage.label(a > 110)
    if n == 0:
        return None
    fx, fy = int(cx - box[0]), int(y + h / 2 - box[1])
    k = lab[min(fy, lab.shape[0] - 1), min(fx, lab.shape[1] - 1)]
    if k == 0:  # face centre not on the mask: take the biggest piece
        k = 1 + int(np.argmax(ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))))
    keep = ndimage.binary_dilation(lab == k, iterations=3)
    a = (a * keep).astype("uint8")
    fa = a[max(0, fy - h // 3):fy + h // 3, max(0, fx - w // 3):fx + w // 3]
    if fa.size == 0 or (fa > 110).mean() < .7:  # the face itself must survive the cut
        return None
    cut.putalpha(Image.fromarray(a))
    bb = cut.getbbox()
    if not bb:
        return None
    out = cut.crop(bb)
    if out.height < 300 or out.width < 200:
        return None
    out.thumbnail((700, 820), Image.LANCZOS)
    return out

def find(name, sport, team):
    p18, cat = entity(name, sport)
    titles = gather(name, team, p18, cat)
    if not titles:
        return {"why": "no photos on Commons"}
    cands = []
    for f in infos(titles).values():
        m = meta_score(f, name, team)
        if m:
            cands.append((m[0], m[1], m[2], f))
    if not cands:
        return {"why": f"{len(titles)} photos, none usable (licence/size)"}
    cands.sort(key=lambda c: -c[0])
    tried = []
    for s, year, team_hit, f in cands[:10]:
        try:
            raw = get(f["url"], binary=True)
            fc = best_face(raw)
            if not fc:
                continue
            x, y, w, h = fc["box"]
            q = s + min(h, 260) / 260 * 2 + min(fc["sharp"] / 250, 1) - fc["crowd"] * .7 - (2 if h < 90 else 0)
            tried.append((q, f, fc, raw, year, team_hit))
        except Exception as e:
            print("  skip", f["title"][:60], str(e)[:60])
    for q, f, fc, raw, year, team_hit in sorted(tried, key=lambda t: -t[0]):
        img = cutout(raw, fc)
        if img is not None:
            return {"img": img, "f": f, "q": round(q, 2), "year": year, "team_hit": team_hit}
    return {"why": f"{len(cands)} candidates, no clean cut-out"}

def main():
    data_path = sys.argv[1]
    D = json.load(open(data_path))
    os.makedirs(DIR, exist_ok=True)
    idx = json.load(open(INDEX)) if os.path.exists(INDEX) else {}
    today = datetime.date.today()
    people = []
    for s in D["sections"]:
        for c in s["top"]:
            people.append((f"{c['first']} {c['last']}".strip(), s["sport"], c))
    for r in D.get("more", []):
        people.append((r["name"], r["sport"], r))
    credits = []
    for name, sport, obj in people:
        k, team = slug(name), obj.get("team") or {}
        e = idx.get(k) or {}
        fresh = e.get("v") == VERSION and (e.get("team") == team.get("short") or not team)
        if e.get("miss"):
            fresh = fresh and (today - datetime.date.fromisoformat(e["miss"])).days <= 14
        if not fresh:
            try:
                r = find(name, sport, team)
            except Exception as ex:
                r = {"why": "error " + str(ex)[:80]}
            old = os.path.join(DIR, k + ".webp")
            if r.get("img"):
                r["img"].save(old, "WEBP", quality=90, method=6)
                f = r["f"]
                e = {"v": VERSION, "team": team.get("short"), "file": k + ".webp", "artist": re.sub(r"\s+", " ", f["artist"])[:80], "license": f["license"],
                     "page": f["page"], "title": f["title"], "year": r["year"], "inTeam": r["team_hit"], "q": r["q"], "at": today.isoformat()}
            else:
                if os.path.exists(old):
                    os.remove(old)
                e = {"v": VERSION, "team": team.get("short"), "miss": today.isoformat(), "why": r.get("why")}
            idx[k] = e
            print(f"{name} ({team.get('short')}): {e.get('title') or e.get('why')} {'[team jersey]' if e.get('inTeam') else ''} {e.get('year', '')}")
        if e.get("file") and os.path.exists(os.path.join(DIR, e["file"])):
            obj["photo"] = "faces/" + e["file"]
            artist = re.sub(r",?\s*Wikimedia Commons$", "", e["artist"]).strip() or "Unknown"
            cr = f"{name}: {artist} ({e['license']})"
            if cr not in credits:
                credits.append(cr)
    h = D.get("hook") or {}
    for name, _, obj in people:
        if obj.get("photo") and slug(name) == slug(h.get("who", "")):
            h["photo"] = obj["photo"]
    D["credits"] = credits
    json.dump(idx, open(INDEX, "w"), indent=0, sort_keys=True)
    json.dump(D, open(data_path, "w"), indent=1)
    print(f"photos: {sum(1 for _, _, o in people if o.get('photo'))} of {len(people)}")

if __name__ == "__main__":
    main()
