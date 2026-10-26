"""Cut-out player photos for the video, from Wikimedia Commons only (photos that are free to reuse, credited in the
caption), never ESPN or league headshots. Finds the player on Wikidata, takes their main photo if its licence allows
reuse (CC BY, CC BY-SA, CC0, public domain), removes the background with rembg and keeps the head and shoulders.
Each player is looked up once: results (and misses, retried after 30 days) are kept in faces/index.json.
usage: python faces.py data.json      (adds "photo" to each card/row that has one, and data["credits"])"""
import io, json, os, re, sys, time, datetime, html
import urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "faces")
INDEX = os.path.join(DIR, "index.json")
UA = "CrossoverStatsVideo/1.0 (https://github.com/officialgewtified/RepoBoard; daily sports stats recap)"
SPORT_Q = {"NBA": {"Q3665646"}, "NFL": {"Q19204627", "Q14128148"}, "CFB": {"Q19204627", "Q14128148"}}  # basketball player; American football player
SPORT_WORD = {"NBA": "basketball", "NFL": "football", "CFB": "football"}
OK_LICENSE = re.compile(r"^(CC BY(-SA)? \d(\.\d)?|CC0|Public domain|PD\b|CC-BY(-SA)?-\d)", re.I)

def get(url, binary=False, tries=3):
    for i in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30)
            b = r.read()
            return b if binary else json.loads(b)
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))

def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def wikidata_photo(name, sport):
    q = urllib.parse.urlencode({"action": "wbsearchentities", "search": name, "language": "en", "type": "item", "limit": 8, "format": "json"})
    hits = get("https://www.wikidata.org/w/api.php?" + q).get("search", [])
    if not hits:
        return None
    ids = "|".join(h["id"] for h in hits)
    ents = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": ids, "props": "claims|descriptions", "languages": "en", "format": "json"}))["entities"]
    for h in hits:  # search order = best match first
        e = ents.get(h["id"], {})
        cl = e.get("claims", {})
        occ = {c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in cl.get("P106", [])}
        desc = (e.get("descriptions", {}).get("en", {}) or {}).get("value", "")
        if not (occ & SPORT_Q[sport] or SPORT_WORD[sport] in desc.lower()):
            continue
        imgs = [c["mainsnak"].get("datavalue", {}).get("value") for c in cl.get("P18", [])]
        imgs = [i for i in imgs if i]
        return imgs[-1] if imgs else None  # the newest-added photo is usually the most recent
    return None

def commons_info(filename):
    q = urllib.parse.urlencode({"action": "query", "titles": "File:" + filename, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1000, "format": "json"})
    pages = get("https://commons.wikimedia.org/w/api.php?" + q)["query"]["pages"]
    ii = next(iter(pages.values())).get("imageinfo", [{}])[0]
    md = ii.get("extmetadata", {})
    val = lambda k: html.unescape(re.sub(r"<[^>]+>", "", (md.get(k) or {}).get("value", ""))).strip()
    return {"url": ii.get("thumburl") or ii.get("url"), "license": val("LicenseShortName"), "artist": val("Artist") or "Unknown", "page": ii.get("descriptionurl")}

_session = None
def cutout(raw):
    global _session
    from rembg import remove, new_session
    from PIL import Image
    if _session is None:
        _session = new_session("u2net_human_seg")
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im.thumbnail((1000, 1000))
    cut = remove(im, session=_session)
    a = cut.split()[-1].point(lambda v: 255 if v > 40 else 0)
    box = a.getbbox()
    if not box:
        return None
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cover = sum(1 for v in a.crop(box).getdata() if v) / max(1, w * h)
    if w < 120 or h < 160 or cover < .25:
        return None
    # head and shoulders: from the top of the person down to about 1.25x their width
    y1 = min(y1, y0 + int(w * 1.25))
    out = cut.crop((x0, y0, x1, y1))
    out.thumbnail((640, 760))
    return out

def main():
    data_path = sys.argv[1]
    D = json.load(open(data_path))
    os.makedirs(DIR, exist_ok=True)
    idx = json.load(open(INDEX)) if os.path.exists(INDEX) else {}
    today = datetime.date.today().isoformat()
    people = []
    for s in D["sections"]:
        for c in s["top"]:
            people.append((f"{c['first']} {c['last']}".strip(), s["sport"], c))
    for r in D.get("more", []):
        people.append((r["name"], r["sport"], r))
    credits = []
    for name, sport, obj in people:
        k = slug(name)
        e = idx.get(k)
        stale = e and e.get("miss") and (datetime.date.fromisoformat(today) - datetime.date.fromisoformat(e["miss"])).days > 30
        if not e or stale:
            try:
                fn = wikidata_photo(name, sport)
                info = commons_info(fn) if fn else None
                if not info or not info["url"]:
                    e = {"miss": today, "why": "no photo on Wikidata"}
                elif not OK_LICENSE.match(info["license"]) or re.search(r"\bN[CD]\b", info["license"]):
                    e = {"miss": today, "why": "licence " + info["license"]}
                else:
                    img = cutout(get(info["url"], binary=True))
                    if img is None:
                        e = {"miss": today, "why": "cut-out failed"}
                    else:
                        img.save(os.path.join(DIR, k + ".webp"), "WEBP", quality=88, method=6)
                        e = {"file": k + ".webp", "artist": info["artist"][:80], "license": info["license"], "page": info["page"], "at": today}
            except Exception as ex:
                e = {"miss": today, "why": "error " + str(ex)[:80]}
            idx[k] = e
            print(f"{name}: {e.get('file') or e.get('why')}")
        if e.get("file") and os.path.exists(os.path.join(DIR, e["file"])):
            obj["photo"] = "faces/" + e["file"]
            cr = f"{name}: {e['artist']}, {e['license']}, via Wikimedia Commons"
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
