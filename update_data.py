"""Builds data.json for the Parlay Board.

What it pulls each run:
  * NFL and college football moneylines from every US sportsbook in the feed (1 credit per sport)
  * ESPN: college rankings, records, team colors, venues, NFL injuries
  * Open-Meteo: kickoff weather for outdoor stadiums
  * PrizePicks lines + sportsbook player props for upcoming games, paced so the
    monthly Odds API quota lasts (see settings.json)
"""
import os, json, math, difflib, unicodedata, calendar, datetime as dt
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
    "prop_credits_per_run": "auto",      # "auto" paces the monthly quota, or a number
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
            "color": "#" + t["color"] if t.get("color") else None}

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
    try:
        p = {"name": city, "count": 10, "language": "en", "format": "json"}
        if not country or country in ("USA", "United States"): p["countryCode"] = "US"
        rs = requests.get("https://geocoding-api.open-meteo.com/v1/search", params=p, timeout=20).json().get("results", [])
        full = STATES.get(state or "")
        pick = next((r for r in rs if full and r.get("admin1") == full), rs[0] if rs else None)
        if pick: res = (pick["latitude"], pick["longitude"])
    except Exception as e:
        print("geocode failed:", city, e)
    GEO[k] = res
    return res

def level(temp, wind, gust, rain):
    if gust >= 30 or (rain >= 70 and wind >= 15) or temp <= 15: return 3
    if wind >= 18 or gust >= 25 or rain >= 70 or temp <= 25: return 2
    if wind >= 12 or rain >= 40 or temp <= 35: return 1
    return 0

WX = {}
def weather(lat, lon, roof, kick):
    if roof == "closed":
        return 0, "Dome or covered stadium"
    if lat is None:
        return 0, "Forecast unavailable. Check it yourself."
    k = kick.replace(minute=0, second=0, microsecond=0)
    try:
        key = (round(lat, 3), round(lon, 3))
        if key not in WX:
            WX[key] = requests.get("https://api.open-meteo.com/v1/forecast", params={
                "latitude": lat, "longitude": lon, "timezone": "UTC", "forecast_days": 16,
                "hourly": "temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m",
                "temperature_unit": "fahrenheit", "wind_speed_unit": "mph"}, timeout=30).json()["hourly"]
        h = WX[key]
        i = h["time"].index(k.strftime("%Y-%m-%dT%H:00"))
        t, w, g, p = h["temperature_2m"][i], h["wind_speed_10m"][i], h["wind_gusts_10m"][i], h["precipitation_probability"][i] or 0
        return level(t, w, g, p), f"{t:.0f}°F, wind {w:.0f} mph (gusts {g:.0f}), {p}% chance of rain"
    except Exception as e:
        print("weather failed:", e)
        return 0, "Forecast unavailable. Check it yourself."


# ---------- game lines ----------
def team_obj(sport, full, et):
    if sport == "NFL":
        ab = T[full][0] if full in T else (et["abbr"] if et else "".join(w[0] for w in full.split())[:3].upper())
        n = (et or {}).get("nick") or full.split()[-1]
        return {"ab": ab, "n": n, "full": full, "rec": (et or {}).get("rec"), "c": (et or {}).get("color")}
    if et:
        return {"ab": et["abbr"] or et["short"][:4].upper(), "n": et["short"] or full, "full": full,
                "rk": et["rank"], "rec": et["rec"], "c": et["color"]}
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
            w, wn = weather(lat, lon, roof, kick)

            if sp == "NFL":
                notes = [n for n in (inj_note(away, A["ab"], inj), inj_note(home, H["ab"], inj)) if n]
                inj_txt = " | ".join(notes) or "Injury data unavailable"
            else:
                inj_txt = "College teams don't publish a full injury feed. Check team news before kickoff."

            g = {"id": e["id"], "sp": sp, "kick": iso(kick), "a": A, "h": H, "px": px, "fair": round(fair, 4),
                 "w": w, "wn": wn, "inj": inj_txt}
            if em and em["neutral"]: g["neu"] = True
            if vname: g["v"] = vname
            games.append(g)
            events.append((g, key, em))
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

def prop_budget(s):
    rem = CRED["remaining"]
    sched = s["schedule"]
    # Runs left this month (rough: assumes the quota resets on the 1st).
    today = NOW.date()
    last = today.replace(day=calendar.monthrange(today.year, today.month)[1])
    runs, weight_left = 0, 0.0
    d = today
    while d <= last:
        for wd, hr, wt in sched:
            if d.weekday() == wd and (d > today or hr >= NOW.hour - 1):
                runs += 1; weight_left += wt
        d += dt.timedelta(days=1)
    reserve = max(float(s["credit_reserve"]), 2.0 * runs + 4)
    if rem is None:
        return 0
    spendable = max(0.0, rem - reserve)
    cfg = s["prop_credits_per_run"]
    if isinstance(cfg, (int, float)):
        return int(min(cfg, spendable))
    wt_now = next((wt for wd, hr, wt in sched if wd == NOW.weekday()), 1)
    return int(spendable * wt_now / max(weight_left, 1.0))

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
    budget = prop_budget(s)
    end = window_end(s)
    print(f"prop budget this run: {budget} credits; window until {iso(end)}; remaining {CRED['remaining']}")
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
    print(f"props: fetched {fetched} games this run, {len(rows)} prop lines total, "
          f"{sum(1 for r in rows if r['pp'])} with PrizePicks lines")
    return rows, budget


def main():
    s = settings()
    overrides = load_json("overrides.json", {})
    inj = get_injuries()
    games, events = build_games(s, overrides, inj)
    props, budget = build_props(s, events) if events else ([], 0)
    out = {"updated": iso(NOW), "games": games, "props": props,
           "markets": {k: MARKET_LABEL[k] for k in s["prop_markets"] if k in MARKET_LABEL},
           "books": BOOK_TITLES,
           "credits": {"remaining": CRED["remaining"], "used": CRED["used"], "spent": CRED["spent"], "prop_budget": budget}}
    if not games:
        print("no games found; keeping previous data.json")
        return
    with open(os.path.join(HERE, "data.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {len(games)} games ({sum(g['sp'] == 'CFB' for g in games)} college), {len(props)} props")

if __name__ == "__main__":
    main()
