"""Builds data.json for the Parlay Board.

What it pulls each run:
  * NFL and college football moneylines from every US sportsbook in the feed (1 credit per sport)
  * ESPN: college rankings, records, team colors, venues, NFL injuries
  * Open-Meteo: kickoff weather for outdoor stadiums
  * PrizePicks lines + sportsbook player props for upcoming games, paced so the
    monthly Odds API quota lasts (see settings.json)
"""
import os, re, json, math, time, difflib, unicodedata, datetime as dt
from statistics import NormalDist, median
from zoneinfo import ZoneInfo
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ET = ZoneInfo("America/New_York")
API = "https://api.the-odds-api.com/v4"
KEY = os.environ.get("ODDS_API_KEY", "")
NOW = dt.datetime.now(dt.timezone.utc)
ND = NormalDist()

SPORTS = {"NFL": "americanfootball_nfl", "CFB": "americanfootball_ncaaf"}
ESPN_PATH = {"NFL": "football/nfl", "CFB": "football/college-football"}

# Props: PrizePicks plus up to 9 sportsbooks = 1 "region" of cost per market.
PROP_BOOKS = ["prizepicks", "draftkings", "fanduel", "betmgm", "betrivers", "espnbet",
              "hardrockbet", "bovada", "betonlineag", "lowvig"]

DEFAULTS = {
    "days_ahead": {"NFL": 8, "CFB": 6},
    "prop_markets": ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions"],
    "weekly_credits": "auto",            # "auto" = monthly quota x 7/30.4, or a number
    "prop_credits_per_run": "auto",      # optional cap per run
    "credit_reserve": 40,                # never spend below this (keeps game lines running)
    "props_refresh_hours": 10,           # reuse props fetched more recently than this
    # Scheduled runs in UTC: [weekday (Mon=0), hour, weight]. Keep in sync with .github/workflows/update.yml
    "schedule": [[1, 14, 1], [3, 14, 1], [4, 14, 1], [5, 14, 3], [6, 15, 3]],
}

MARKET_LABEL = {
    "player_pass_yds": "Pass Yards", "player_rush_yds": "Rush Yards", "player_reception_yds": "Receiving Yards",
    "player_receptions": "Receptions", "player_pass_tds": "Pass TDs", "player_pass_completions": "Completions",
    "player_pass_attempts": "Pass Attempts", "player_rush_attempts": "Rush Attempts",
    "player_pass_interceptions": "Interceptions", "player_rush_reception_yds": "Rush + Rec Yards",
    "player_pass_rush_yds": "Pass + Rush Yards",
}
COUNT_MARKETS = {"player_receptions", "player_pass_tds", "player_pass_completions", "player_pass_attempts",
                 "player_rush_attempts", "player_pass_interceptions"}
# Game-to-game spread of yardage stats, as a function of the line (used only to adjust for
# small differences between the PrizePicks line and a sportsbook's line).
SIGMA = {
    "player_pass_yds": lambda L: max(40.0, 0.28 * L),
    "player_rush_yds": lambda L: 9 + 0.38 * L,
    "player_reception_yds": lambda L: 8 + 0.48 * L,
    "player_rush_reception_yds": lambda L: 10 + 0.42 * L,
    "player_pass_rush_yds": lambda L: max(42.0, 10 + 0.26 * L),
}

# full name: (abbr, lat, lon, roof)   roof: "open" or "closed" (dome, retractable or covered)
T = {
"Arizona Cardinals":("ARI",33.5276,-112.2626,"closed"),"Atlanta Falcons":("ATL",33.7554,-84.4010,"closed"),
"Baltimore Ravens":("BAL",39.2780,-76.6227,"open"),"Buffalo Bills":("BUF",42.7738,-78.7870,"open"),
"Carolina Panthers":("CAR",35.2258,-80.8528,"open"),"Chicago Bears":("CHI",41.8623,-87.6167,"open"),
"Cincinnati Bengals":("CIN",39.0955,-84.5161,"open"),"Cleveland Browns":("CLE",41.5061,-81.6995,"open"),
"Dallas Cowboys":("DAL",32.7473,-97.0945,"closed"),"Denver Broncos":("DEN",39.7439,-105.0201,"open"),
"Detroit Lions":("DET",42.3400,-83.0456,"closed"),"Green Bay Packers":("GB",44.5013,-88.0622,"open"),
"Houston Texans":("HOU",29.6847,-95.4107,"closed"),"Indianapolis Colts":("IND",39.7601,-86.1639,"closed"),
"Jacksonville Jaguars":("JAX",30.3239,-81.6373,"open"),"Kansas City Chiefs":("KC",39.0489,-94.4839,"open"),
"Las Vegas Raiders":("LV",36.0909,-115.1833,"closed"),"Los Angeles Chargers":("LAC",33.9535,-118.3392,"closed"),
"Los Angeles Rams":("LAR",33.9535,-118.3392,"closed"),"Miami Dolphins":("MIA",25.9580,-80.2389,"open"),
"Minnesota Vikings":("MIN",44.9735,-93.2575,"closed"),"New England Patriots":("NE",42.0909,-71.2643,"open"),
"New Orleans Saints":("NO",29.9511,-90.0812,"closed"),"New York Giants":("NYG",40.8135,-74.0745,"open"),
"New York Jets":("NYJ",40.8135,-74.0745,"open"),"Philadelphia Eagles":("PHI",39.9008,-75.1675,"open"),
"Pittsburgh Steelers":("PIT",40.4468,-80.0158,"open"),"San Francisco 49ers":("SF",37.4030,-121.9700,"open"),
"Seattle Seahawks":("SEA",47.5952,-122.3316,"open"),"Tampa Bay Buccaneers":("TB",27.9759,-82.5033,"open"),
"Tennessee Titans":("TEN",36.1665,-86.7713,"open"),"Washington Commanders":("WAS",38.9076,-76.8645,"open"),
}
STATES = {"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado",
"CT":"Connecticut","DE":"Delaware","DC":"District of Columbia","FL":"Florida","GA":"Georgia","HI":"Hawaii",
"ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana",
"ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi",
"MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey",
"NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma",
"OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota",
"TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington",
"WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming"}

CRED = {"remaining": None, "used": None, "spent": 0.0}
BOOK_TITLES = {"prizepicks": "PrizePicks"}


# ---------- helpers ----------
def load_json(name, default):
    try:
        with open(os.path.join(HERE, name)) as f:
            return json.load(f)
    except Exception:
        return default

def settings():
    s = dict(DEFAULTS)
    s.update({k: v for k, v in load_json("settings.json", {}).items() if not k.startswith("_")})
    return s

def imp(ml):
    return -ml / (-ml + 100) if ml < 0 else 100 / (ml + 100)

def no_vig(a, b):
    x, y = imp(a), imp(b)
    return x / (x + y)

def iso(t):
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def parse_t(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("&", "and").replace("'", "")
    return "".join(c for c in s if c.isalnum())

def sim(a, b):
    return 1.0 if a == b else difflib.SequenceMatcher(None, a, b).ratio()

def odds_get(path, **params):
    params["apiKey"] = KEY
    r = requests.get(API + path, params=params, timeout=30)
    h = r.headers
    for hk, k in (("x-requests-remaining", "remaining"), ("x-requests-used", "used")):
        if h.get(hk) is not None:
            try: CRED[k] = float(h[hk])
            except ValueError: pass
    if r.ok and h.get("x-requests-last") is not None:
        try: CRED["spent"] += float(h["x-requests-last"])
        except ValueError: pass
    r.raise_for_status()
    return r.json()


# ---------- ESPN ----------
def espn_team(c):
    t = c.get("team", {})
    rk = (c.get("curatedRank") or {}).get("current")
    rec = next((r.get("summary") for r in c.get("records", []) if r.get("type") == "total"), None)
    return {"name": t.get("displayName", ""), "short": t.get("shortDisplayName") or t.get("location", ""),
            "nick": t.get("name", ""), "abbr": t.get("abbreviation", ""),
            "rank": rk if rk and rk <= 25 else None, "rec": rec,
            "color": "#" + t["color"] if t.get("color") else None, "id": t.get("id")}

def num(x):
    """'o41.5' / '+3' / '-3' / 41.5 -> float, else None."""
    if x is None: return None
    if isinstance(x, (int, float)): return float(x)
    m = re.search(r"[-+]?\d+(\.\d+)?", str(x))
    return float(m.group()) if m else None

def espn_odds(comp):
    """Spread (home team's line, negative = home favored) and total, now and at open."""
    try:
        o = (comp.get("odds") or [None])[0]
        if not o: return None
        out = {"spr": num(o.get("spread")), "tot": num(o.get("overUnder"))}
        ps, tt = o.get("pointSpread") or {}, o.get("total") or {}
        out["spr_o"] = num((((ps.get("home") or {}).get("open")) or {}).get("line"))
        out["tot_o"] = num((((tt.get("over") or {}).get("open")) or {}).get("line"))
        return out if out["tot"] or out["spr"] is not None else None
    except Exception:
        return None

def espn_games(sport, days):
    out = []
    today = NOW.astimezone(ET).date()
    for i in range(days + 1):
        d = (today + dt.timedelta(days=i)).strftime("%Y%m%d")
        params = {"dates": d, "limit": 500}
        if sport == "CFB":
            params["groups"] = 80
        try:
            j = requests.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATH[sport]}/scoreboard",
                             params=params, timeout=30).json()
        except Exception as e:
            print(f"ESPN {sport} {d} failed:", e)
            continue
        for ev in j.get("events", []):
            try:
                comp = ev["competitions"][0]
                cs = {c["homeAway"]: espn_team(c) for c in comp["competitors"]}
                v = comp.get("venue") or {}
                addr = v.get("address") or {}
                out.append({"kick": parse_t(ev["date"]), "home": cs["home"], "away": cs["away"],
                            "id": ev.get("id"), "odds": espn_odds(comp),
                            "neutral": bool(comp.get("neutralSite")),
                            "venue": {"name": v.get("fullName"), "city": addr.get("city"), "state": addr.get("state"),
                                      "country": addr.get("country"), "indoor": bool(v.get("indoor"))}})
            except Exception:
                continue
    return out

def match_espn(away, home, kick, espn):
    na, nh = norm(away), norm(home)
    best, score = None, 0.0
    for e in espn:
        if abs((e["kick"] - kick).total_seconds()) > 6 * 3600:
            continue
        ea, eh = norm(e["away"]["name"]), norm(e["home"]["name"])
        s1, s2 = (sim(na, ea), sim(nh, eh)), (sim(na, eh), sim(nh, ea))
        s, sw = (s1, False) if sum(s1) >= sum(s2) else (s2, True)
        if min(s) >= 0.45 and sum(s) > score:
            best, score, swapped = e, sum(s), sw
    if best and score >= 1.5:
        return best, swapped
    return None, False

def get_injuries():
    out = {}
    try:
        j = requests.get("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries", timeout=30).json()
        for team in j.get("injuries", []):
            lst = []
            for i in team.get("injuries", []):
                a = i.get("athlete", {})
                lst.append((a.get("displayName", "?"), (a.get("position") or {}).get("abbreviation", ""), i.get("status", "")))
            out[team.get("displayName", "")] = lst
    except Exception as e:
        print("injury fetch failed:", e)
    return out

def inj_note(name, ab, inj):
    if name not in inj:
        return None
    qbs = [f"{n} ({s})" for n, p, s in inj[name] if p == "QB" and s in ("Out", "Doubtful", "Questionable")]
    outs = sum(1 for n, p, s in inj[name] if s == "Out" and p != "QB")
    txt = "QB " + ", ".join(qbs) if qbs else "no QB listed"
    if outs: txt += f"; {outs} other{'s' if outs != 1 else ''} out"
    return f"{ab}: {txt}"


# ---------- weather ----------
GEO = {}
def geocode(city, state, country):
    k = (city, state, country)
    if k in GEO: return GEO[k]
    res = None
    p = {"name": city, "count": 50, "language": "en", "format": "json"}
    if not country or country in ("USA", "United States"): p["countryCode"] = "US"
    for attempt in range(3):
        try:
            j = requests.get("https://geocoding-api.open-meteo.com/v1/search", params=p, timeout=20).json()
            if j.get("error"): raise RuntimeError(j.get("reason"))
            rs = j.get("results", [])
            full = STATES.get(state or "")
            pick = next((r for r in rs if full and r.get("admin1") == full), rs[0] if rs else None)
            if pick: res = (pick["latitude"], pick["longitude"])
            break
        except Exception as e:
            print("geocode failed:", city, e)
            time.sleep(3 * (attempt + 1))
    GEO[k] = res
    return res

def level(temp, wind, gust, rain):
    if gust >= 30 or (rain >= 70 and wind >= 15) or temp <= 15: return 3
    if wind >= 18 or gust >= 25 or rain >= 70 or temp <= 25: return 2
    if wind >= 12 or rain >= 40 or temp <= 35: return 1
    return 0

def fetch_forecasts(locs):
    """One Open-Meteo call per 40 venues (instead of one per game), with retries."""
    out = {}
    locs = sorted(set(locs))
    for i in range(0, len(locs), 40):
        chunk = locs[i:i + 40]
        for attempt in range(4):
            try:
                j = requests.get("https://api.open-meteo.com/v1/forecast", params={
                    "latitude": ",".join(str(a) for a, _ in chunk), "longitude": ",".join(str(b) for _, b in chunk),
                    "timezone": "UTC", "forecast_days": 16,
                    "hourly": "temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m",
                    "temperature_unit": "fahrenheit", "wind_speed_unit": "mph"}, timeout=60).json()
                if isinstance(j, dict) and j.get("error"):
                    raise RuntimeError(j.get("reason"))
                res = j if isinstance(j, list) else [j]
                for loc, r in zip(chunk, res):
                    out[loc] = r["hourly"]
                break
            except Exception as e:
                print(f"weather batch failed (try {attempt + 1}):", e)
                time.sleep(5 * (attempt + 1))
    return out

WXNUM = {}
def weather_for(lat, lon, roof, kick, fc):
    if roof == "closed":
        return 0, "Dome or covered stadium"
    h = fc.get((round(lat, 3), round(lon, 3))) if lat is not None else None
    if not h:
        return 0, "Forecast unavailable. Check it yourself."
    try:
        i = h["time"].index(kick.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:00"))
        t, w, g, p = h["temperature_2m"][i], h["wind_speed_10m"][i], h["wind_gusts_10m"][i], h["precipitation_probability"][i] or 0
        WXNUM[id(fc)] = {"t": round(t), "w": round(w), "gu": round(g), "p": p}
        return level(t, w, g, p), f"{t:.0f}°F, wind {w:.0f} mph (gusts {g:.0f}), {p}% chance of rain"
    except Exception as e:
        print("weather lookup failed:", e)
        return 0, "Forecast unavailable. Check it yourself."


# ---------- game lines ----------
def team_obj(sport, full, et):
    if sport == "NFL":
        ab = T[full][0] if full in T else (et["abbr"] if et else "".join(w[0] for w in full.split())[:3].upper())
        n = (et or {}).get("nick") or full.split()[-1]
        return {"ab": ab, "n": n, "full": full, "rec": (et or {}).get("rec"), "c": (et or {}).get("color"), "tid": (et or {}).get("id")}
    if et:
        return {"ab": et["abbr"] or et["short"][:4].upper(), "n": et["short"] or full, "full": full,
                "rk": et["rank"], "rec": et["rec"], "c": et["color"], "tid": et.get("id")}
    parts = full.split()
    n = " ".join(parts[:-1]) if len(parts) > 1 else full
    return {"ab": "".join(w[0] for w in parts[:-1])[:4].upper() or full[:3].upper(), "n": n, "full": full}

def build_games(s, overrides, inj):
    games, events = [], []
    for sp, key in SPORTS.items():
        try:
            raw = odds_get(f"/sports/{key}/odds", regions="us", markets="h2h", oddsFormat="american")
        except Exception as e:
            print(f"odds fetch failed for {sp}:", e)
            continue
        days = s["days_ahead"].get(sp, 7)
        espn = espn_games(sp, days)
        print(f"{sp}: {len(raw)} odds events, {len(espn)} ESPN games")
        for e in sorted(raw, key=lambda x: x["commence_time"]):
            kick = parse_t(e["commence_time"])
            if kick < NOW or kick > NOW + dt.timedelta(days=days):
                continue
            away, home = e["away_team"], e["home_team"]
            px = {}
            for b in e.get("bookmakers", []):
                BOOK_TITLES[b["key"]] = b.get("title") or b["key"]
                for m in b.get("markets", []):
                    if m["key"] == "h2h":
                        o = {x["name"]: x["price"] for x in m["outcomes"]}
                        if away in o and home in o:
                            px[b["key"]] = [o[away], o[home]]
            if not px:
                continue
            fair = median(no_vig(a, h) for a, h in px.values())
            em, sw = match_espn(away, home, kick, espn)
            ea = (em["home"] if sw else em["away"]) if em else None
            eh = (em["away"] if sw else em["home"]) if em else None
            A, H = team_obj(sp, away, ea), team_obj(sp, home, eh)

            # venue + weather
            o = overrides.get(f"{away}@{home}", {})
            lat = lon = None; roof = "open"; vname = None
            if em:
                v = em["venue"]
                vname = ", ".join(x for x in (v.get("name"), v.get("city")) if x) or None
                roof = "closed" if v.get("indoor") else "open"
            if o:
                lat, lon, roof = o.get("lat"), o.get("lon"), o.get("roof", roof)
            elif sp == "NFL" and home in T and not (em and em["neutral"]):
                lat, lon, roof = T[home][1], T[home][2], T[home][3]
            elif em and em["venue"].get("city"):
                v = em["venue"]
                ll = geocode(v["city"], v.get("state"), v.get("country"))
                if ll: lat, lon = ll
            elif sp == "NFL" and home in T:
                lat, lon, roof = T[home][1], T[home][2], T[home][3]

            if sp == "NFL":
                notes = [n for n in (inj_note(away, A["ab"], inj), inj_note(home, H["ab"], inj)) if n]
                inj_txt = " | ".join(notes) or "Injury data unavailable"
            else:
                inj_txt = "College teams don't publish a full injury feed. Check team news before kickoff."

            if em and em.get("odds") and ea and eh:
                od = em["odds"]
                spr_home = od.get("spr")
                if spr_home is not None and sw: spr_home = -spr_home      # ESPN's home is the feed's away
                if od.get("tot") and spr_home is not None:
                    H["imp"] = round((od["tot"] - spr_home) / 2, 1)
                    A["imp"] = round((od["tot"] + spr_home) / 2, 1)
                gl = {"tot": od.get("tot"), "spr": spr_home, "tot_o": od.get("tot_o"),
                      "spr_o": (-od["spr_o"] if sw and od.get("spr_o") is not None else od.get("spr_o"))}
            else:
                gl = None
            g = {"id": e["id"], "sp": sp, "kick": iso(kick), "a": A, "h": H, "px": px, "fair": round(fair, 4),
                 "inj": inj_txt, "_wx": (lat, lon, roof, kick)}
            if em and em["neutral"]: g["neu"] = True
            if gl: g["gl"] = {k: v for k, v in gl.items() if v is not None}
            if em and em.get("id"): g["eid"] = em["id"]
            if vname: g["v"] = vname
            games.append(g)
            events.append((g, key, em))
    fc = fetch_forecasts([(round(g["_wx"][0], 3), round(g["_wx"][1], 3)) for g in games
                          if g["_wx"][0] is not None and g["_wx"][2] != "closed"])
    prev_games = {x["id"]: x for x in load_json("data.json", {}).get("games", [])}
    for g in games:
        WXNUM.pop(id(fc), None)
        g["w"], g["wn"] = weather_for(*g.pop("_wx"), fc)
        if id(fc) in WXNUM: g["wx"] = WXNUM.pop(id(fc))
        pg = prev_games.get(g["id"])
        g["of"] = (pg.get("of", pg.get("fair")) if pg else None) or g["fair"]     # fair chance when first seen
    return games, events


# ---------- player props ----------
def pois_cdf(k, lam):
    if k < 0: return 0.0
    term = total = math.exp(-lam)
    for i in range(1, int(k) + 1):
        term *= lam / i
        total += term
    return min(1.0, total)

def pois_lambda(line, p_over):
    lo, hi = 0.01, 400.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if 1 - pois_cdf(math.floor(line), mid) < p_over: lo = mid
        else: hi = mid
    return (lo + hi) / 2

def p_over_at(market, book_line, p_over_book, line):
    """Probability the stat goes over `line`, given a book's de-vigged over probability at `book_line`."""
    p = min(0.97, max(0.03, p_over_book))
    if abs(line - book_line) < 1e-9:
        return p
    if market in COUNT_MARKETS:
        lam = pois_lambda(book_line, p)
        if float(line).is_integer():
            gt, lt = 1 - pois_cdf(line, lam), pois_cdf(line - 1, lam)
            return gt / max(1e-9, gt + lt)
        return 1 - pois_cdf(math.floor(line), lam)
    sd = SIGMA.get(market, lambda L: 8 + 0.4 * L)(max(book_line, 1))
    mu = book_line + sd * ND.inv_cdf(p)
    return 1 - ND.cdf((line - mu) / sd)

def parse_props(ev_json, market_keys):
    by = {}  # (player, market) -> {"pp": line or None, "books": {book: [point, over, under]}}
    for b in ev_json.get("bookmakers", []):
        bk = b["key"]
        BOOK_TITLES[bk] = b.get("title") or BOOK_TITLES.get(bk, bk)
        for m in b.get("markets", []):
            mk = m["key"]
            if mk not in market_keys:
                continue
            sides = {}
            for o in m.get("outcomes", []):
                pl = o.get("description")
                if not pl or o.get("point") is None:
                    continue
                sides.setdefault(pl, {})[o["name"]] = (o["point"], o.get("price"))
            for pl, sd in sides.items():
                rec = by.setdefault((pl, mk), {"pp": None, "books": {}})
                if bk == "prizepicks":
                    rec["pp"] = (sd.get("Over") or sd.get("Under"))[0]
                elif "Over" in sd and "Under" in sd and sd["Over"][0] == sd["Under"][0] \
                        and sd["Over"][1] is not None and sd["Under"][1] is not None:
                    rec["books"][bk] = [sd["Over"][0], sd["Over"][1], sd["Under"][1]]
    rows = []
    for (pl, mk), rec in by.items():
        books = rec["books"]
        if not books:
            continue
        line = rec["pp"] if rec["pp"] is not None else median(v[0] for v in books.values())
        probs = [p_over_at(mk, pt, no_vig(o, u), line) for pt, o, u in books.values()]
        rows.append({"pl": pl, "mk": mk, "ln": line, "pp": rec["pp"] is not None,
                     "po": round(median(probs), 4), "lo": round(min(probs), 4), "hi": round(max(probs), 4),
                     "nb": len(books), "bl": [[k] + v for k, v in sorted(books.items())]})
    return rows

def week_start(t):
    """Football week: Tuesday through Monday (UTC)."""
    d = t.date()
    return d - dt.timedelta(days=(d.weekday() - 1) % 7)

def prop_budget(s, ledger, lines_spent):
    """Credits this run may spend on props.

    Every football week (Tue-Mon) gets the same allowance: (monthly quota - reserve) x 7/31,
    so even a 31-day month never touches the reserve. Everything spent in the week (game lines, props, manual runs)
    is counted against it, credits are held back for the game-line updates still to come that
    week, and the rest is split by run weight; anything a run doesn't use rolls to the next one.
    """
    rem, used = CRED["remaining"], CRED["used"] or 0.0
    if rem is None:
        return 0, 0.0, 0.0
    sched = s["schedule"]
    cfg_week = s.get("weekly_credits", "auto")
    reserve = float(s["credit_reserve"])
    week_total = max(0.0, rem + used - reserve) * 7 / 31 if cfg_week == "auto" else float(cfg_week)
    wk = str(week_start(NOW))
    spent = (float(ledger.get("spent", 0)) if ledger.get("week") == wk else 0.0) + lines_spent

    def run_time(d, hr):
        return dt.datetime(d.year, d.month, d.day, hr, tzinfo=dt.timezone.utc)
    # This run's weight: the scheduled run it belongs to (within 3 hours), else 1 for a manual run.
    w_now = next((wt for wd, hr, wt in sched if NOW.weekday() == wd
                  and abs((NOW - run_time(NOW.date(), hr)).total_seconds()) < 3 * 3600), 1)
    w_rest, runs_left = w_now, 0
    end = week_start(NOW) + dt.timedelta(days=7)
    d = NOW.date()
    while d < end:
        for wd, hr, wt in sched:
            if d.weekday() == wd and run_time(d, hr) > NOW + dt.timedelta(hours=3):
                w_rest += wt; runs_left += 1
        d += dt.timedelta(days=1)
    left = max(0.0, week_total - spent - 2.0 * runs_left)
    allot = left * w_now / w_rest
    cap = max(0.0, rem - reserve)
    cfg_run = s.get("prop_credits_per_run", "auto")
    budget = min(allot, cap, float(cfg_run) if isinstance(cfg_run, (int, float)) else allot)
    return int(budget), week_total, spent

def window_end(s):
    """Fetch props for games that start before the next scheduled run (+1h), so no game is fetched twice."""
    best = None
    for add in range(0, 8):
        d = NOW.date() + dt.timedelta(days=add)
        for wd, hr, _ in s["schedule"]:
            if d.weekday() == wd:
                t = dt.datetime(d.year, d.month, d.day, hr, tzinfo=dt.timezone.utc)
                if t > NOW + dt.timedelta(hours=3) and (best is None or t < best):
                    best = t
    return (best or NOW + dt.timedelta(hours=36)) + dt.timedelta(hours=1)

def build_props(s, events):
    prev = load_json("data.json", {})
    prev_by = {}
    for r in prev.get("props", []):
        prev_by.setdefault(r.get("g"), []).append(r)
    markets = [m for m in s["prop_markets"] if m in MARKET_LABEL]
    ledger = prev.get("ledger", {})
    budget, week_total, spent_week = prop_budget(s, ledger, CRED["spent"])
    end = window_end(s)
    print(f"prop budget this run: {budget} credits (weekly allowance {week_total:.0f}, "
          f"used this week incl. this run's game lines {spent_week:.0f}); window until {iso(end)}; remaining {CRED['remaining']}")
    start_spent = CRED["spent"]

    def prio(item):
        g, _, _ = item
        rk = min([x for x in (g["a"].get("rk"), g["h"].get("rk")) if x] or [99])
        return (0 if g["sp"] == "NFL" else 1, rk if g["sp"] == "CFB" else 0, g["kick"])

    live = {g["id"] for g, _, _ in events}
    rows, fetched, use_regions = [], 0, False
    for g, key, _ in sorted(events, key=prio):
        kick = parse_t(g["kick"])
        old = prev_by.get(g["id"], [])
        old_t = parse_t(old[0]["t"]) if old and old[0].get("t") else None
        fresh = old_t and (NOW - old_t) < dt.timedelta(hours=s["props_refresh_hours"])
        if kick > end or fresh:
            if old and old_t and (NOW - old_t) < dt.timedelta(hours=40):
                rows += old
            continue
        if CRED["spent"] - start_spent + len(markets) > budget:
            if old and old_t and (NOW - old_t) < dt.timedelta(hours=40):
                rows += old
            continue
        params = {"markets": ",".join(markets), "oddsFormat": "american"}
        if use_regions: params["regions"] = "us,us_dfs"
        else: params["bookmakers"] = ",".join(PROP_BOOKS)
        try:
            j = odds_get(f"/sports/{key}/events/{g['id']}/odds", **params)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 0
            if code in (400, 422) and not use_regions:
                print("bookmaker list rejected, switching to regions")
                use_regions = True
                if CRED["spent"] - start_spent + 2 * len(markets) > budget:
                    continue
                params.pop("bookmakers"); params["regions"] = "us,us_dfs"
                try: j = odds_get(f"/sports/{key}/events/{g['id']}/odds", **params)
                except Exception as e2:
                    print("props failed:", e2); continue
            else:
                print("props failed:", e)
                if code in (401, 429): break
                continue
        except Exception as e:
            print("props failed:", e)
            continue
        new = parse_props(j, set(markets))
        stamp = iso(NOW)
        for r in new:
            r["g"], r["sp"], r["t"] = g["id"], g["sp"], stamp
        rows += new or [r for r in old if old_t and (NOW - old_t) < dt.timedelta(hours=40)]
        fetched += 1
    rows = [r for r in rows if r.get("g") in live]
    prev_rows = {(r.get("g"), r.get("mk"), r.get("pl")): r for r in prev.get("props", [])}
    for r in rows:
        r["bm"] = median(b[1] for b in r["bl"]) if r.get("bl") else None
        pr = prev_rows.get((r["g"], r["mk"], r["pl"]))
        if pr and pr is not r:
            r["op"] = pr.get("op", pr.get("ln"))
            r["obm"] = pr.get("obm", pr.get("bm"))
        else:
            r.setdefault("op", r["ln"]); r.setdefault("obm", r["bm"])
    print(f"props: fetched {fetched} games this run, {len(rows)} prop lines total, "
          f"{sum(1 for r in rows if r['pp'])} with PrizePicks lines")
    new_ledger = {"week": str(week_start(NOW)), "spent": round(spent_week + CRED["spent"] - start_spent, 1),
                  "allowance": round(week_total, 1)}
    return rows, budget, new_ledger


# ---------- team stats (offense and defense, ranked across the league) ----------
# key: (category, ESPN stat name, own/opp, higher_is_better)
TEAM_STATS = {
    "ppg":    ("scoring", "totalPointsPerGame", "own", True),
    "ppg_a":  ("scoring", "totalPointsPerGame", "opp", False),
    "ypg":    ("passing", "yardsPerGame", "own", True),
    "ypg_a":  ("passing", "yardsPerGame", "opp", False),
    "pass":   ("passing", "netPassingYardsPerGame", "own", True),
    "pass_a": ("passing", "netPassingYardsPerGame", "opp", False),
    "ypa":    ("passing", "yardsPerPassAttempt", "own", True),
    "ypa_a":  ("passing", "yardsPerPassAttempt", "opp", False),
    "rush":   ("rushing", "rushingYardsPerGame", "own", True),
    "rush_a": ("rushing", "rushingYardsPerGame", "opp", False),
    "ypc":    ("rushing", "yardsPerRushAttempt", "own", True),
    "ypc_a":  ("rushing", "yardsPerRushAttempt", "opp", False),
    "third":  ("miscellaneous", "thirdDownConvPct", "own", True),
    "third_a": ("miscellaneous", "thirdDownConvPct", "opp", False),
    "rz":     ("miscellaneous", "redzoneScoringPct", "own", True),
    "rz_a":   ("miscellaneous", "redzoneScoringPct", "opp", False),
}
# Per-game rates built from season totals: key: (category, stat, own/opp, higher_is_better)
TEAM_TOTALS = {
    "sacks":  ("defensive", "sacks", "own", True),          # pass rush
    "sacked": ("passing", "sacks", "own", False),           # protection
    "take":   ("miscellaneous", "totalTakeaways", "own", True),
    "give":   ("miscellaneous", "totalGiveaways", "own", False),
    "patt":   ("passing", "passingAttempts", "own", None),
    "ratt":   ("rushing", "rushingAttempts", "own", None),
}

def team_list(sport):
    url = f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATH[sport]}/teams"
    params = {"limit": 400}
    if sport == "CFB": params["groups"] = 80
    try:
        j = requests.get(url, params=params, timeout=30).json()
        return [t["team"]["id"] for t in j["sports"][0]["leagues"][0]["teams"]]
    except Exception as e:
        print("team list failed:", sport, e)
        return []

def team_season(sport, tid):
    try:
        j = requests.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATH[sport]}/teams/{tid}/statistics",
                         timeout=20).json().get("results", {})
    except Exception as e:
        print("team stats failed:", sport, tid, e)
        return None
    def side(cats):
        out = {}
        for c in cats or []:
            for st in c.get("stats", []):
                try: out[(c.get("name"), st.get("name"))] = float(st.get("value"))
                except (TypeError, ValueError): pass
        return out
    own = side((j.get("stats") or {}).get("categories"))
    opp = side(j.get("opponent") if isinstance(j.get("opponent"), list) else (j.get("opponent") or {}).get("categories"))
    if not own:
        return None
    gp = own.get(("general", "gamesPlayed")) or own.get(("passing", "teamGamesPlayed")) or 0
    if not gp:
        return None
    v = {"gp": gp}
    for k, (cat, name, who, _) in TEAM_STATS.items():
        x = (own if who == "own" else opp).get((cat, name))
        if x is not None: v[k] = round(x, 2)
    for k, (cat, name, who, _) in TEAM_TOTALS.items():
        x = (own if who == "own" else opp).get((cat, name))
        if x is not None: v[k] = round(x / gp, 2)
    if v.get("patt") and v.get("ratt"):
        v["prate"] = round(v["patt"] / (v["patt"] + v["ratt"]), 3)    # play-calling style
    return v

def build_team_stats(games):
    """Season stats for every team in the league, ranked; returns only the teams playing on the board."""
    need = {(g["sp"], g[s].get("tid")) for g in games for s in ("a", "h") if g[s].get("tid")}
    out = {}
    for sp in sorted({sp for sp, _ in need}):
        ids = team_list(sp) or [tid for s2, tid in need if s2 == sp]
        ids = list(dict.fromkeys(ids + [tid for s2, tid in need if s2 == sp]))
        league = {}
        for tid in ids:
            v = team_season(sp, tid)
            if v: league[tid] = v
        keys = {**{k: d[3] for k, d in TEAM_STATS.items()}, **{k: d[3] for k, d in TEAM_TOTALS.items() if d[3] is not None}}
        avg = {}
        for k, hib in keys.items():
            vals = sorted(((t, v[k]) for t, v in league.items() if k in v), key=lambda x: x[1], reverse=hib)
            if not vals or not any(x for _, x in vals):     # stat not tracked for this league
                for v in league.values(): v.pop(k, None)
                continue
            avg[k] = round(sum(x for _, x in vals) / len(vals), 2)
            for i, (t, _) in enumerate(vals):
                league[t].setdefault("rk", {})[k] = i + 1
        for tid, v in league.items():
            if (sp, tid) in need:
                out[f"{sp}:{tid}"] = v
        out[f"{sp}:_league"] = {"n": len(league), "avg": avg}
        print(f"team stats {sp}: {len(league)} teams ranked")
    return out


# ---------- recent form (ESPN game logs) ----------
FORM_STAT = {"player_reception_yds": ["receivingYards"], "player_receptions": ["receptions"],
             "player_rush_yds": ["rushingYards"], "player_pass_yds": ["passingYards"],
             "player_pass_tds": ["passingTouchdowns"], "player_pass_completions": ["completions"],
             "player_pass_attempts": ["passingAttempts"], "player_rush_attempts": ["rushingAttempts"],
             "player_pass_interceptions": ["interceptions"],
             "player_rush_reception_yds": ["rushingYards", "receivingYards"],
             "player_pass_rush_yds": ["passingYards", "rushingYards"]}
ROSTERS, LOGS = {}, {}

def pname(s):
    s = norm(s)
    for suf in ("jr", "sr", "iii", "ii", "iv", "v"):
        if s.endswith(suf) and len(s) > len(suf) + 3:
            return s[: -len(suf)]
    return s

def roster(sport, tid):
    if not tid: return {}
    if (sport, tid) in ROSTERS: return ROSTERS[(sport, tid)]
    out = {}
    try:
        j = requests.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATH[sport]}/teams/{tid}/roster", timeout=20).json()
        for grp in j.get("athletes", []):
            for a in grp.get("items", []) if isinstance(grp, dict) and "items" in grp else [grp]:
                if a.get("id"):
                    for nm in (a.get("displayName"), a.get("fullName")):
                        if nm: out[pname(nm)] = a["id"]
    except Exception as e:
        print("roster failed:", sport, tid, e)
    ROSTERS[(sport, tid)] = out
    return out

def game_log(sport, aid):
    """Per-game stats for the current season, most recent first: [{stat: value}]."""
    if (sport, aid) in LOGS: return LOGS[(sport, aid)]
    games = []
    try:
        j = requests.get(f"https://site.web.api.espn.com/apis/common/v3/sports/{ESPN_PATH[sport]}/athletes/{aid}/gamelog", timeout=20).json()
        names, evmeta = j.get("names", []), j.get("events", {})
        for st in j.get("seasonTypes", []):
            if "pre" in (st.get("displayName") or "").lower():
                continue
            for cat in st.get("categories", []):
                for ev in cat.get("events", []):
                    vals = {}
                    for n, v in zip(names, ev.get("stats", [])):
                        try: vals[n] = float(str(v).replace(",", ""))
                        except ValueError: pass
                    meta = evmeta.get(ev.get("eventId"), {}) or {}
                    vals["_t"] = meta.get("gameDate", "")
                    vals["_ha"] = "a" if meta.get("atVs") == "@" else "h"
                    vals["_e"] = ev.get("eventId")
                    games.append(vals)
        games.sort(key=lambda x: x["_t"], reverse=True)
    except Exception as e:
        print("game log failed:", sport, aid, e)
    LOGS[(sport, aid)] = games
    return games

USAGE = {"player_reception_yds": ("receivingTargets", "Targets"), "player_receptions": ("receivingTargets", "Targets"),
         "player_rush_yds": ("rushingAttempts", "Carries"), "player_rush_attempts": ("rushingAttempts", "Carries"),
         "player_pass_yds": ("passingAttempts", "Pass attempts"), "player_pass_completions": ("passingAttempts", "Pass attempts"),
         "player_pass_attempts": ("passingAttempts", "Pass attempts"), "player_pass_tds": ("passingAttempts", "Pass attempts"),
         "player_rush_reception_yds": ("rushingAttempts", "Carries")}
SKILL_POS = {"QB", "RB", "WR", "TE", "FB"}

def g_done(r):
    """Injury info is refreshed every run, so only skip rows that have everything else."""
    return False

def attach_form(rows, games_by_id, inj=None):
    """Adds rf = {v: last 5 values (newest first), n: games used (max 10), o: games over the line, avg}."""
    done = 0
    for r in rows:
        if ("rf" in r and "med" in r["rf"] and "sd" in r and "aid" in r and g_done(r)) or r["mk"] not in FORM_STAT:
            continue
        g = games_by_id.get(r["g"])
        if not g:
            continue
        key = pname(r["pl"])
        aid = None
        for side in ("a", "h"):
            aid = roster(g["sp"], g[side].get("tid")).get(key)
            if aid:
                r["sd"] = side          # the player's team in this game (a = away, h = home)
                break
        if not aid:
            continue
        r["aid"] = aid
        # injury report (NFL): the player's own status and teammates who are out
        if inj is not None and g["sp"] == "NFL":
            team = g[r["sd"]].get("full", "")
            me = pname(r["pl"])
            r.pop("ij", None)
            for n, pos, st in inj.get(team, []):
                if pname(n) == me and st and st.lower() != "active":
                    r["ij"] = st
            outs = [f"{n} ({pos}, {st})" for n, pos, st in inj.get(team, [])
                    if pname(n) != me and pos in SKILL_POS and st in ("Out", "Doubtful")]
            if outs: r["tmo"] = outs[:4]
        if "rf" in r and "med" in r["rf"]:
            continue
        stats = FORM_STAT[r["mk"]]
        log = [x for x in game_log(g["sp"], aid) if any(k in x for k in stats)][:10]
        vals = [sum(x.get(k, 0.0) for k in stats) for x in log]
        if len(vals) < 2:
            continue
        rf = {"v": [round(v, 1) for v in vals[:5]], "n": len(vals),
              "o": sum(1 for v in vals if v > r["ln"]), "u": sum(1 for v in vals if v < r["ln"]),
              "avg": round(sum(vals[:5]) / len(vals[:5]), 1), "med": round(median(vals), 1)}
        hv = [v for v, x in zip(vals, log) if x.get("_ha") == "h"]
        av = [v for v, x in zip(vals, log) if x.get("_ha") == "a"]
        if hv and av:
            rf["ha"] = [round(sum(hv) / len(hv), 1), len(hv), round(sum(av) / len(av), 1), len(av)]
        uk = USAGE.get(r["mk"])
        if uk and any(uk[0] in x for x in log[:5]):
            rf["us"] = [round(x.get(uk[0], 0)) for x in log[:5]]
            rf["ul"] = uk[1]
        r["rf"] = rf
        done += 1
    print(f"recent form added to {done} props ({len(LOGS)} game logs, {len(ROSTERS)} rosters)")


# ---------- board chance (same math as the page at default settings) ----------
K_FORM, W_MATCH = 10, 0.5
MATCH_STAT_PY = {"player_rush_yds": ["rush_a", "ypc_a"], "player_rush_attempts": ["rush_a"],
                 "player_reception_yds": ["pass_a", "ypa_a"], "player_receptions": ["pass_a"],
                 "player_pass_yds": ["pass_a", "ypa_a"], "player_pass_tds": ["ppg_a", "pass_a"],
                 "player_pass_completions": ["pass_a"], "player_pass_attempts": ["pass_a"],
                 "player_pass_interceptions": ["take"], "player_rush_reception_yds": ["rush_a", "pass_a"],
                 "player_pass_rush_yds": ["pass_a", "rush_a"]}

def sigma_for(mk, L):
    if mk in SIGMA: return SIGMA[mk](max(L, 1))
    if mk in COUNT_MARKETS: return math.sqrt(max(L, .5)) + .6
    return 8 + .4 * L

def match_factor(r, teams, gbi):
    g = gbi.get(r["g"])
    if not g or not r.get("sd"): return None
    opp = g["h"] if r["sd"] == "a" else g["a"]
    S, L = teams.get(f"{g['sp']}:{opp.get('tid')}"), teams.get(f"{g['sp']}:_league")
    ks = [k for k in MATCH_STAT_PY.get(r["mk"], []) if S and L and S.get(k) is not None and L["avg"].get(k)]
    if not ks: return None
    m = sum(S[k] / L["avg"][k] for k in ks) / len(ks)
    gp = S.get("gp") or 1
    return 1 + (m - 1) * gp / (gp + 3)

def board_prob(r, teams, gbi):
    p, rf = r["po"], r.get("rf")
    n = (rf["o"] + rf["u"]) if rf else 0
    if n:
        p = (K_FORM * p + n * (rf["o"] + .5) / (n + 1)) / (K_FORM + n)
    m = match_factor(r, teams, gbi)
    if m:
        z = r["ln"] * (m - 1) * W_MATCH / sigma_for(r["mk"], r["ln"])
        p = ND.cdf(ND.inv_cdf(min(max(p, 1e-6), 1 - 1e-6)) + z)
    return p

def is_mixed(r, teams, gbi):
    mkt, rf = r["po"] >= .5, r.get("rf")
    n = (rf["o"] + rf["u"]) if rf else 0
    h = rf["o"] / n if n else .5
    form_opp = n >= 4 and (h >= .5) != mkt and abs(h - .5) >= .0999
    form_agree = n >= 4 and (h >= .5) == mkt and abs(h - .5) >= .0999
    m = match_factor(r, teams, gbi)
    m_opp = m is not None and abs(m - 1) >= .12 and ((m > 1) != mkt)
    return bool(form_opp or (m_opp and not form_agree))


def all_agree(r, teams, gbi, p):
    """Books, his recent games and the matchup all point the same way, with enough books and chance."""
    mkt = r["po"] >= .5
    rf = r.get("rf"); n = (rf["o"] + rf["u"]) if rf else 0
    if n < 4 or r["nb"] < 2 or max(p, 1 - p) < .542: return False
    h = rf["o"] / n
    if (h >= .5) != mkt or abs(h - .5) < .0999: return False
    m = match_factor(r, teams, gbi)
    if m is not None and abs(m - 1) >= .05 and (m > 1) != mkt: return False
    if r.get("ij") and r["ij"].lower() in ("questionable", "doubtful", "out"): return False
    return (p >= .5) == mkt

# ---------- track record: snapshot picks before kickoff, grade them after ----------
FOUND = {}
def find_athlete(sport, name):
    """ESPN athlete id by name search (used when a pick was saved without one)."""
    key = (sport, pname(name))
    if key in FOUND: return FOUND[key]
    aid = None
    try:
        j = requests.get("https://site.web.api.espn.com/apis/common/v3/search",
                         params={"query": name, "limit": 10, "type": "player"}, timeout=20).json()
        league = "nfl" if sport == "NFL" else "college-football"
        for it in j.get("items", []):
            if it.get("league") == league and pname(it.get("displayName", "")) == pname(name):
                aid = it.get("id"); break
    except Exception as e:
        print("athlete search failed:", name, e)
    FOUND[key] = aid
    return aid

SCORES = {}
def final_scores(sport, day):
    """{espn event id: (away score, home score)} for finished games on an ET date."""
    if (sport, day) in SCORES: return SCORES[(sport, day)]
    out = {}
    params = {"dates": day, "limit": 500}
    if sport == "CFB": params["groups"] = 80
    try:
        j = requests.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATH[sport]}/scoreboard", params=params, timeout=30).json()
        for ev in j.get("events", []):
            comp = ev["competitions"][0]
            if not ((comp.get("status") or ev.get("status") or {}).get("type") or {}).get("completed"):
                continue
            sc = {c["homeAway"]: num(c.get("score")) for c in comp["competitors"]}
            out[ev["id"]] = (sc.get("away"), sc.get("home"))
    except Exception as e:
        print("scores failed:", sport, day, e)
    SCORES[(sport, day)] = out
    return out

def tier_of(p):
    return "strong" if p >= .591 else "playable" if p >= .542 else "thin"

def update_history(games, props, teams):
    h = load_json("history.json", {})
    h.setdefault("pending", {}); h.setdefault("props", []); h.setdefault("ml", [])
    gbi = {g["id"]: g for g in games}
    for r in props:
        g = gbi.get(r["g"])
        if not g or not r.get("aid") or parse_t(g["kick"]) <= NOW:
            continue
        pf = board_prob(r, teams, gbi)
        h["pending"][f"p|{r['g']}|{r['mk']}|{r['pl']}"] = {
            "t": "p", "sp": g["sp"], "kick": g["kick"], "pl": r["pl"], "mk": r["mk"], "ln": r["ln"], "pp": r["pp"],
            "nb": r["nb"], "po": r["po"], "side": "o" if pf >= .5 else "u", "p": round(max(pf, 1 - pf), 4),
            "mx": is_mixed(r, teams, gbi), "ag": all_agree(r, teams, gbi, pf), "aid": r["aid"]}
    for g in games:
        if g.get("eid") and parse_t(g["kick"]) > NOW:
            h["pending"][f"m|{g['id']}"] = {"t": "m", "sp": g["sp"], "kick": g["kick"], "eid": g["eid"],
                                           "a": g["a"]["n"], "h": g["h"]["n"], "side": "a" if g["fair"] >= .5 else "h",
                                           "p": round(max(g["fair"], 1 - g["fair"]), 4)}
    graded = 0
    for k, x in list(h["pending"].items()):
        kick = parse_t(x["kick"])
        if NOW - kick < dt.timedelta(hours=4):
            continue
        if NOW - kick > dt.timedelta(days=5):          # never got a result (didn't play, game moved)
            del h["pending"][k]; continue
        if x["t"] == "p":
            stats = FORM_STAT.get(x["mk"], [])
            if not x.get("aid"):
                x["aid"] = find_athlete(x["sp"], x["pl"])
                if not x["aid"]:
                    continue
            LOGS.pop((x["sp"], x["aid"]), None)          # always read a fresh log for grading
            game = next((e for e in game_log(x["sp"], x["aid"])
                         if e.get("_t") and abs((parse_t(e["_t"]) - kick).total_seconds()) < 18 * 3600), None)
            if not game:
                continue
            act = sum(game.get(st, 0.0) for st in stats)
            res = None if act == x["ln"] else ((act > x["ln"]) == (x["side"] == "o"))
            h["props"].append({"d": x["kick"][:10], "sp": x["sp"], "pl": x["pl"], "mk": x["mk"], "ln": x["ln"],
                               "pp": x["pp"], "nb": x["nb"], "po": x["po"], "side": x["side"], "p": x["p"],
                               "mx": x["mx"], "ag": x.get("ag", False), "act": act, "hit": res})
        else:
            day = kick.astimezone(ET).strftime("%Y%m%d")
            sc = final_scores(x["sp"], day).get(x["eid"])
            if not sc or sc[0] is None or sc[1] is None:
                continue
            if sc[0] == sc[1]:
                res = None
            else:
                res = ("a" if sc[0] > sc[1] else "h") == x["side"]
            h["ml"].append({"d": x["kick"][:10], "sp": x["sp"], "a": x["a"], "h": x["h"], "side": x["side"],
                            "p": x["p"], "hit": res})
        del h["pending"][k]
        graded += 1
    h["props"], h["ml"] = h["props"][-4000:], h["ml"][-2000:]
    with open(os.path.join(HERE, "history.json"), "w") as f:
        json.dump(h, f, separators=(",", ":"))
    print(f"track record: graded {graded} picks; {len(h['pending'])} waiting; {len(h['props'])} props and {len(h['ml'])} games on record")
    return summarize(h)

def summarize(h):
    def agg(rows):
        rows = [r for r in rows if r.get("hit") in (True, False)]
        n = len(rows)
        return {"n": n, "w": sum(1 for r in rows if r["hit"]), "ep": round(sum(r["p"] for r in rows) / n, 4) if n else None}
    wk = str((NOW - dt.timedelta(days=7)).date())
    P, M = h["props"], h["ml"]
    out = {"props": {
        "all": agg(P), "week": agg([r for r in P if r["d"] >= wk]),
        "strong": agg([r for r in P if tier_of(r["p"]) == "strong"]),
        "playable": agg([r for r in P if tier_of(r["p"]) == "playable"]),
        "thin": agg([r for r in P if tier_of(r["p"]) == "thin"]),
        "clean": agg([r for r in P if not r["mx"]]), "mixed": agg([r for r in P if r["mx"]]),
        "agree": agg([r for r in P if r.get("ag")]),
        "scanner": agg([r for r in P if r["p"] >= .542 and not r["mx"] and r["nb"] >= 2]),
        "pp": agg([r for r in P if r["pp"]]), "more": agg([r for r in P if r["side"] == "o"]),
        "less": agg([r for r in P if r["side"] == "u"]),
        "nfl": agg([r for r in P if r["sp"] == "NFL"]), "cfb": agg([r for r in P if r["sp"] == "CFB"]),
        "stat": {mk: agg([r for r in P if r["mk"] == mk]) for mk in sorted({r["mk"] for r in P})}},
        "ml": {"all": agg(M), "week": agg([r for r in M if r["d"] >= wk]),
               "b50": agg([r for r in M if r["p"] < .6]), "b60": agg([r for r in M if .6 <= r["p"] < .7]),
               "b70": agg([r for r in M if .7 <= r["p"] < .8]), "b80": agg([r for r in M if r["p"] >= .8])},
        "since": min([r["d"] for r in P + M] or [None]) if (P or M) else None,
        "recent": [{k: r[k] for k in ("d", "pl", "mk", "ln", "side", "p", "act", "hit", "mx")} for r in P[-30:]][::-1]}
    return out


# ---------- every player's recent games, for "Check a pick" (ESPN box scores, no Odds API credits) ----------
# players.json keeps the last BOX_KEEP games of passing, rushing and receiving for every NFL and FBS
# player, read from game box scores. Each run only reads games that finished since the last run.
BOX_COLS = ["py", "pa", "pc", "ptd", "int", "ry", "ra", "rcy", "rec"]   # after [date, opponent, home]
BOX_KEEP = 8
BOX_LOOKBACK = 49        # days read on the first run
BOX_SECONDS = 360        # time limit per run; whatever is left gets read next run
BOX = requests.Session()

def box_int(x):
    try: return int(round(float(str(x).replace(",", ""))))
    except (TypeError, ValueError): return 0

def box_score(sport, eid):
    """{athlete id: (name, team abbr, team id, opponent abbr, home 1/0, {stat: value})} for one finished game."""
    j = BOX.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATH[sport]}/summary",
                params={"event": eid}, timeout=30).json()
    sides = (j.get("boxscore") or {}).get("players") or []
    if len(sides) != 2:
        return {}
    comp = (((j.get("header") or {}).get("competitions")) or [{}])[0]
    ha = {str(c.get("id") or (c.get("team") or {}).get("id")): c.get("homeAway") for c in comp.get("competitors", [])}
    out = {}
    for i, side in enumerate(sides):
        t, o = side.get("team") or {}, (sides[1 - i].get("team") or {})
        tid = str(t.get("id", ""))
        home = 1 if (ha.get(tid) == "home" if ha.get(tid) else side.get("displayOrder", i + 1) == 2) else 0
        for cat in side.get("statistics", []):
            name, keys = cat.get("name"), cat.get("keys") or []
            if name not in ("passing", "rushing", "receiving"):
                continue
            for a in cat.get("athletes", []):
                ath, vals = a.get("athlete") or {}, dict(zip(keys, a.get("stats") or []))
                if not ath.get("id"):
                    continue
                row = out.setdefault(str(ath["id"]), (ath.get("displayName", ""), t.get("abbreviation", ""), tid,
                                                      o.get("abbreviation", ""), home, {}))[5]
                if name == "passing":
                    ca = str(vals.get("completions/passingAttempts", "0/0")).split("/")
                    row.update(pc=box_int(ca[0]), pa=box_int(ca[-1]), py=box_int(vals.get("passingYards")),
                               ptd=box_int(vals.get("passingTouchdowns")), int=box_int(vals.get("interceptions")))
                elif name == "rushing":
                    row.update(ra=box_int(vals.get("rushingAttempts")), ry=box_int(vals.get("rushingYards")))
                else:
                    row.update(rec=box_int(vals.get("receptions")), rcy=box_int(vals.get("receivingYards")))
    return out

def build_players(inj):
    """Adds finished games to players.json. Returns True when the file changed."""
    pj = load_json("players.json", {})
    players, done = pj.get("players", {}), pj.get("done", {})
    start, read, changed = time.time(), 0, False
    today = NOW.astimezone(ET).date()
    for sport in ("NFL", "CFB"):
        seen = set(done.get(sport, {}).get("ids", []))
        through = done.get(sport, {}).get("through")
        first = today - dt.timedelta(days=BOX_LOOKBACK)
        if through:   # re-read the last 2 days in case a game wasn't final yet
            first = max(first, dt.datetime.strptime(through, "%Y%m%d").date() - dt.timedelta(days=2))
        days = [today - dt.timedelta(days=k) for k in range((today - first).days + 1)]   # newest first
        timed_out = False
        for d in days:
            if time.time() - start > BOX_SECONDS:
                timed_out = True; break
            day = d.strftime("%Y%m%d")
            for eid in final_scores(sport, day):
                if eid in seen:
                    continue
                if time.time() - start > BOX_SECONDS:
                    timed_out = True; break
                try:
                    box = box_score(sport, eid)
                except Exception as e:
                    print("box score failed:", sport, eid, e); continue
                read += 1; seen.add(eid); changed = True
                for aid, (name, ab, tid, opp, home, st) in box.items():
                    p = players.setdefault(aid, {"n": name, "s": sport, "t": ab, "tid": tid, "g": []})
                    p["g"] = [g for g in p["g"] if g[0] != int(day)]
                    p["g"].append([int(day), opp, home] + [st.get(c, 0) for c in BOX_COLS])
                    p["g"].sort(key=lambda g: g[0], reverse=True)
                    p["g"] = p["g"][:BOX_KEEP]
                    if p["g"][0][0] == int(day):         # name and team as of his latest game
                        p.update(n=name, t=ab, tid=tid)
            if timed_out:
                break
        done[sport] = {"ids": sorted(seen)[-1500:],
                       "through": (done.get(sport, {}).get("through") if timed_out else (today - dt.timedelta(days=1)).strftime("%Y%m%d"))}
    # drop players who haven't played in 10 weeks or barely touch the ball
    old = int((today - dt.timedelta(days=70)).strftime("%Y%m%d"))
    def keeps(p):
        g = p["g"]
        if not g or g[0][0] < old: return False
        tot = [sum(x[3 + i] for x in g) for i in range(len(BOX_COLS))]
        c = dict(zip(BOX_COLS, tot))
        return c["pa"] >= 5 or c["py"] + c["ry"] + c["rcy"] >= 25 or c["rec"] >= 2
    before = len(players)
    players = {k: v for k, v in players.items() if keeps(v)}
    changed = changed or len(players) != before
    injuries = {}
    for team, lst in (inj or {}).items():
        for name, pos, status in lst:
            if status and status.lower() not in ("active",):
                injuries[pname(name)] = status
    if injuries != pj.get("inj"):
        changed = True
    print(f"players: read {read} box scores in {time.time() - start:.0f}s; {len(players)} players on file")
    if not changed:
        return False
    out = {"updated": iso(NOW), "cols": ["date", "opp", "home"] + BOX_COLS, "inj": injuries,
           "players": dict(sorted(players.items())), "done": done}
    with open(os.path.join(HERE, "players.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    return True


def main():
    s = settings()
    overrides = load_json("overrides.json", {})
    inj = get_injuries()
    games, events = build_games(s, overrides, inj)
    if events:
        props, budget, ledger = build_props(s, events)
        attach_form(props, {g["id"]: g for g in games}, inj)
    else:
        props, budget, ledger = [], 0, load_json("data.json", {}).get("ledger", {})
        if ledger.get("week") == str(week_start(NOW)):
            ledger["spent"] = round(float(ledger.get("spent", 0)) + CRED["spent"], 1)
    teams = build_team_stats(games) if games else {}
    try:
        record = update_history(games, props, teams) if games else None
    except Exception as e:
        print("track record failed:", e)
        record = None
    try:
        build_players(inj)
    except Exception as e:
        print("player list failed:", e)
    out = {"updated": iso(NOW), "games": games, "props": props,
           "markets": {k: MARKET_LABEL[k] for k in s["prop_markets"] if k in MARKET_LABEL},
           "books": BOOK_TITLES,
           "credits": {"remaining": CRED["remaining"], "used": CRED["used"], "spent": CRED["spent"], "prop_budget": budget}, "ledger": ledger, "teams": teams, "record": record}
    if not games:
        print("no games found; keeping previous data.json")
        return
    with open(os.path.join(HERE, "data.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {len(games)} games ({sum(g['sp'] == 'CFB' for g in games)} college), {len(props)} props")

if __name__ == "__main__":
    main()
