"""Builds data.json for Baseline (basketball): NBA and men's college basketball.

What it pulls each run:
  * NBA and college moneylines from every US sportsbook in the feed (about 1 credit per league)
  * ESPN: schedule, college rankings, records, team colors, venues, spreads and totals, NBA injuries
  * ESPN box scores for every finished game (no credits): every player's recent games and
    every team's points, rebounds, assists and threes allowed, for matchups
  * PrizePicks lines + sportsbook player props for the day's games, paced so the
    monthly Odds API quota lasts (see settings.json)
Without an Odds API key it still builds the schedule (with ESPN's own line) and player games.
"""
import os, re, json, math, time, difflib, unicodedata, datetime as dt
from statistics import NormalDist, median
from zoneinfo import ZoneInfo
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ET = ZoneInfo("America/New_York")
API = "https://api.the-odds-api.com/v4"
KEY = os.environ.get("ODDS_API_KEY", "").strip()
NOW = dt.datetime.now(dt.timezone.utc)
ND = NormalDist()

SPORTS = {"NBA": "basketball_nba", "CBB": "basketball_ncaab"}
ESPN_PATH = {"NBA": "basketball/nba", "CBB": "basketball/mens-college-basketball"}
ESPN_GROUPS = {"CBB": 50}          # Division I
ESPN = requests.Session()

# Props: PrizePicks plus up to 9 sportsbooks = 1 "region" of cost per market.
PROP_BOOKS = ["prizepicks", "draftkings", "fanduel", "betmgm", "betrivers", "espnbet",
              "hardrockbet", "bovada", "betonlineag", "lowvig"]

DEFAULTS = {
    "days_ahead": {"NBA": 2, "CBB": 2},
    "prop_markets": ["player_points", "player_rebounds", "player_assists"],
    "daily_credits": "auto",             # "auto" = what's left this month spread evenly over the days left, or a number
    "prop_credits_per_run": "auto",      # optional cap per run
    "credit_reserve": 30,                # never spend below this (keeps game lines running)
    "props_refresh_hours": 10,           # reuse props fetched more recently than this
    # Scheduled runs in UTC, every day: [hour, weight]. Keep in sync with .github/workflows/baseline.yml
    "schedule": [[5, 1]],
}

MARKET_LABEL = {
    "player_points": "Points", "player_rebounds": "Rebounds", "player_assists": "Assists",
    "player_threes": "3-PT Made", "player_points_rebounds_assists": "Pts+Rebs+Asts",
    "player_points_rebounds": "Pts+Rebs", "player_points_assists": "Pts+Asts",
    "player_rebounds_assists": "Rebs+Asts", "player_blocks": "Blocked Shots", "player_steals": "Steals",
    "player_blocks_steals": "Blks+Stls", "player_turnovers": "Turnovers",
}
COUNT_MARKETS = {"player_rebounds", "player_assists", "player_threes", "player_blocks", "player_steals",
                 "player_blocks_steals", "player_turnovers"}
# Game-to-game spread of the bigger stats, as a function of the line
SIGMA = {
    "player_points": lambda L: 1.5 + 0.24 * L,
    "player_points_rebounds_assists": lambda L: 2.0 + 0.175 * L,
    "player_points_rebounds": lambda L: 1.8 + 0.2 * L,
    "player_points_assists": lambda L: 1.8 + 0.2 * L,
    "player_rebounds_assists": lambda L: 1.0 + 0.24 * L,
}
# players.json columns after [date, opponent, home]
BOX_COLS = ["min", "pts", "reb", "ast", "tpm", "stl", "blk", "to"]
FORM_STAT = {"player_points": ["pts"], "player_rebounds": ["reb"], "player_assists": ["ast"], "player_threes": ["tpm"],
             "player_points_rebounds_assists": ["pts", "reb", "ast"], "player_points_rebounds": ["pts", "reb"],
             "player_points_assists": ["pts", "ast"], "player_rebounds_assists": ["reb", "ast"],
             "player_blocks": ["blk"], "player_steals": ["stl"], "player_blocks_steals": ["blk", "stl"],
             "player_turnovers": ["to"]}

CRED = {"remaining": None, "used": None, "spent": 0.0}
BOOK_TITLES = {"prizepicks": "PrizePicks"}


# ---------- helpers ----------
def load_json(name, default):
    try:
        with open(os.path.join(HERE, name)) as f:
            return json.load(f)
    except Exception:
        return default

def save_json(name, obj):
    with open(os.path.join(HERE, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"))

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

def num(x):
    """'o228.5' / '+3' / '-3' / 41.5 -> float, else None."""
    if x is None: return None
    if isinstance(x, (int, float)): return float(x)
    m = re.search(r"[-+]?\d+(\.\d+)?", str(x))
    return float(m.group()) if m else None

def pname(s):
    s = norm(s)
    for suf in ("jr", "sr", "iii", "ii", "iv", "v"):
        if s.endswith(suf) and len(s) > len(suf) + 3:
            return s[: -len(suf)]
    return s

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

def espn_get(sport, part, **params):
    if sport in ESPN_GROUPS and part in ("scoreboard", "teams"):
        params.setdefault("groups", ESPN_GROUPS[sport])
    return ESPN.get(f"https://site.api.espn.com/apis/site/v2/sports/{ESPN_PATH[sport]}/{part}",
                    params=params, timeout=30).json()


# ---------- ESPN schedule ----------
def espn_team(c):
    t = c.get("team", {})
    rk = (c.get("curatedRank") or {}).get("current")
    rec = next((r.get("summary") for r in c.get("records", []) if r.get("type") in ("total", "ytd")), None)
    return {"name": t.get("displayName", ""), "short": t.get("shortDisplayName") or t.get("location", ""),
            "nick": t.get("name", ""), "abbr": t.get("abbreviation", ""),
            "rank": rk if rk and rk <= 25 else None, "rec": rec,
            "color": "#" + t["color"] if t.get("color") else None, "id": str(t.get("id")) if t.get("id") else None}

def espn_odds(comp):
    """ESPN's own line: spread (home team's line), total, and its moneylines."""
    try:
        o = (comp.get("odds") or [None])[0]
        if not o: return None
        out = {"spr": num(o.get("spread")), "tot": num(o.get("overUnder"))}
        ps, tt = o.get("pointSpread") or {}, o.get("total") or {}
        out["spr_o"] = num((((ps.get("home") or {}).get("open")) or {}).get("line"))
        out["tot_o"] = num((((tt.get("over") or {}).get("open")) or {}).get("line"))
        ml = o.get("moneyline") or {}
        def side_ml(s):
            v = ((o.get(f"{s}TeamOdds") or {}).get("moneyLine"))
            if v is None:
                d = ml.get("home" if s == "home" else "away") or {}
                v = num(((d.get("close") or d.get("current") or {}).get("odds")))
            return int(v) if v is not None and abs(v) >= 100 else None
        out["ml_a"], out["ml_h"] = side_ml("away"), side_ml("home")
        out["prov"] = ((o.get("provider") or {}).get("name")) or "ESPN"
        return out
    except Exception:
        return None

def espn_games(sport, days):
    out = []
    today = NOW.astimezone(ET).date()
    for i in range(days + 1):
        d = (today + dt.timedelta(days=i)).strftime("%Y%m%d")
        try:
            j = espn_get(sport, "scoreboard", dates=d, limit=500)
        except Exception as e:
            print(f"ESPN {sport} {d} failed:", e)
            continue
        for ev in j.get("events", []):
            try:
                comp = ev["competitions"][0]
                cs = {c["homeAway"]: espn_team(c) for c in comp["competitors"]}
                v = comp.get("venue") or {}
                addr = v.get("address") or {}
                state = ((comp.get("status") or ev.get("status") or {}).get("type") or {}).get("state")
                out.append({"kick": parse_t(ev["date"]), "home": cs["home"], "away": cs["away"],
                            "id": ev.get("id"), "odds": espn_odds(comp), "state": state,
                            "neutral": bool(comp.get("neutralSite")),
                            "venue": {"name": v.get("fullName"), "city": addr.get("city"), "state": addr.get("state")}})
            except Exception:
                continue
    return out

def match_espn(away, home, kick, espn):
    na, nh = norm(away), norm(home)
    best, score, swapped = None, 0.0, False
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
    """NBA injury report from ESPN: {team display name: [(player, position, status)]}."""
    out = {}
    try:
        j = ESPN.get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries", timeout=30).json()
        for team in j.get("injuries", []):
            lst = []
            for i in team.get("injuries", []):
                a = i.get("athlete", {})
                lst.append((a.get("displayName", "?"), (a.get("position") or {}).get("abbreviation", ""), i.get("status", "")))
            out[team.get("displayName", "")] = lst
    except Exception as e:
        print("injury fetch failed:", e)
    return out

BAD = ("Out", "Doubtful", "Questionable", "Day-To-Day")
def inj_note(name, ab, inj):
    if name not in inj:
        return None
    hurt = [f"{n} ({s})" for n, p, s in inj[name] if s in BAD]
    return f"{ab}: " + (", ".join(hurt[:5]) + (f" +{len(hurt) - 5} more" if len(hurt) > 5 else "") if hurt else "nobody listed")


# ---------- game lines ----------
def team_obj(sport, full, et):
    if et:
        o = {"ab": et["abbr"] or et["short"][:4].upper(), "n": (et["nick"] if sport == "NBA" else et["short"]) or full,
             "full": full, "rec": et["rec"], "c": et["color"], "tid": et.get("id")}
        if sport == "CBB" and et.get("rank"): o["rk"] = et["rank"]
        return o
    parts = full.split()
    n = parts[-1] if sport == "NBA" else (" ".join(parts[:-1]) if len(parts) > 1 else full)
    return {"ab": "".join(w[0] for w in parts)[:4].upper(), "n": n, "full": full}

def game_extras(g, em, sw, inj):
    """Venue, injuries and ESPN's spread/total on a game."""
    sp, A, H = g["sp"], g["a"], g["h"]
    if em:
        v = em["venue"]
        vname = ", ".join(x for x in (v.get("name"), v.get("city")) if x)
        if vname: g["v"] = vname
        if em["neutral"]: g["neu"] = True
        if em.get("id"): g["eid"] = em["id"]
    if sp == "NBA":
        notes = [n for n in (inj_note(A["full"], A["ab"], inj), inj_note(H["full"], H["ab"], inj)) if n]
        g["inj"] = " | ".join(notes) or "Injury data unavailable"
    else:
        g["inj"] = "College teams don't publish a full injury report. Check team news before tip-off."
    od = em.get("odds") if em else None
    if od:
        spr_home = od.get("spr")
        if spr_home is not None and sw: spr_home = -spr_home
        if od.get("tot") and spr_home is not None:
            H["imp"] = round((od["tot"] - spr_home) / 2, 1)
            A["imp"] = round((od["tot"] + spr_home) / 2, 1)
        gl = {"tot": od.get("tot"), "spr": spr_home, "tot_o": od.get("tot_o"),
              "spr_o": (-od["spr_o"] if sw and od.get("spr_o") is not None else od.get("spr_o"))}
        gl = {k: v for k, v in gl.items() if v is not None}
        if gl: g["gl"] = gl

def build_games(s, inj):
    games, events = [], []
    for sp, key in SPORTS.items():
        days = s["days_ahead"].get(sp, 2)
        espn = espn_games(sp, days)
        raw = []
        if KEY:
            try:
                raw = odds_get(f"/sports/{key}/odds", regions="us", markets="h2h", oddsFormat="american")
            except Exception as e:
                print(f"odds fetch failed for {sp}:", e)
        print(f"{sp}: {len(raw)} odds events, {len(espn)} ESPN games")
        used = set()
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
            em, sw = match_espn(away, home, kick, espn)
            if em: used.add(em["id"])
            ea = (em["home"] if sw else em["away"]) if em else None
            eh = (em["away"] if sw else em["home"]) if em else None
            g = {"id": e["id"], "sp": sp, "kick": iso(kick), "a": team_obj(sp, away, ea), "h": team_obj(sp, home, eh),
                 "px": px, "fair": round(median(no_vig(a, h) for a, h in px.values()), 4)}
            game_extras(g, em, sw, inj)
            games.append(g)
            events.append((g, key))
        # Games the odds feed didn't have (or no key): ESPN's own line, so the schedule still shows
        for em in espn:
            if em["id"] in used or em["kick"] < NOW or em["kick"] > NOW + dt.timedelta(days=days) or em.get("state") == "post":
                continue
            od = em.get("odds") or {}
            if od.get("ml_a") is None or od.get("ml_h") is None:
                continue
            bk = "espn_" + norm(od.get("prov") or "espn")
            BOOK_TITLES[bk] = od.get("prov") or "ESPN"
            g = {"id": "espn-" + str(em["id"]), "sp": sp, "kick": iso(em["kick"]),
                 "a": team_obj(sp, em["away"]["name"], em["away"]), "h": team_obj(sp, em["home"]["name"], em["home"]),
                 "px": {bk: [od["ml_a"], od["ml_h"]]}, "fair": round(no_vig(od["ml_a"], od["ml_h"]), 4), "src": "espn"}
            game_extras(g, em, False, inj)
            games.append(g)
    prev_games = {x["id"]: x for x in load_json("data.json", {}).get("games", [])}
    for g in games:
        pg = prev_games.get(g["id"])
        g["of"] = (pg.get("of", pg.get("fair")) if pg else None) or g["fair"]
    games.sort(key=lambda g: g["kick"])
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

def sigma_for(mk, L):
    if mk in SIGMA: return SIGMA[mk](max(L, 1))
    if mk in COUNT_MARKETS: return math.sqrt(max(L, .5)) + .3
    return 1.5 + .22 * L

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
    sd = sigma_for(market, book_line)
    mu = book_line + sd * ND.inv_cdf(p)
    return 1 - ND.cdf((line - mu) / sd)

def parse_props(ev_json, market_keys):
    by = {}
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
    """Credits this run may spend on props: what's left above the reserve, spread evenly over the days left
    in the month, after holding back game-line credits for the runs still to come."""
    rem = CRED["remaining"]
    if rem is None:
        return 0, 0
    today = NOW.date()
    nxt = (today.replace(day=28) + dt.timedelta(days=4)).replace(day=1)   # credits reset on the 1st
    days_left = max(1, (nxt - today).days)
    reserve = min(float(s["credit_reserve"]), 5.0 + 2.0 * days_left)     # shrinks near the end so nothing is wasted
    runs = max(1, len(s["schedule"]))
    cfg = s.get("daily_credits", "auto")
    if cfg == "auto":
        per_day = (rem - reserve - 2.0 * runs * (days_left - 1)) / days_left
    else:
        per_day = float(cfg)
    budget = min(per_day / runs, rem - reserve)
    cfg_run = s.get("prop_credits_per_run", "auto")
    if isinstance(cfg_run, (int, float)):
        budget = min(budget, float(cfg_run))
    return max(0, int(budget)), days_left

def window_end(s):
    """Fetch props for games that start before the next scheduled run (+1h), so no game is fetched twice."""
    best = None
    for add in range(0, 3):
        d = NOW.date() + dt.timedelta(days=add)
        for hr, _ in s["schedule"]:
            t = dt.datetime(d.year, d.month, d.day, hr, tzinfo=dt.timezone.utc)
            if t > NOW + dt.timedelta(hours=3) and (best is None or t < best):
                best = t
    return (best or NOW + dt.timedelta(hours=24)) + dt.timedelta(hours=1)

def build_props(s, events):
    prev = load_json("data.json", {})
    prev_by = {}
    for r in prev.get("props", []):
        prev_by.setdefault(r.get("g"), []).append(r)
    markets = [m for m in s["prop_markets"] if m in MARKET_LABEL]
    budget, days_left = prop_budget(s)
    end = window_end(s)
    print(f"prop budget this run: {budget} credits ({days_left} days left this month); window until {iso(end)}; "
          f"remaining {CRED['remaining']}")
    start_spent = CRED["spent"]

    def prio(item):
        g, _ = item
        rk = min([x for x in (g["a"].get("rk"), g["h"].get("rk")) if x] or [99])
        return (0 if g["sp"] == "NBA" else 1, rk, g["kick"])

    live = {g["id"] for g, _ in events}
    rows, fetched, use_regions = [], 0, False
    for g, key in sorted(events, key=prio):
        kick = parse_t(g["kick"])
        old = prev_by.get(g["id"], [])
        old_t = parse_t(old[0]["t"]) if old and old[0].get("t") else None
        recent = old_t and (NOW - old_t) < dt.timedelta(hours=40)
        fresh = old_t and (NOW - old_t) < dt.timedelta(hours=s["props_refresh_hours"])
        if kick > end or fresh or CRED["spent"] - start_spent + len(markets) > budget:
            if recent: rows += old
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
        rows += new or (old if recent else [])
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
    return rows, budget


# ---------- box scores: every player's recent games and every team's game log (no credits) ----------
BOX_KEEP = 12            # games kept per player
TEAM_KEEP = 20           # games kept per team
BOX_LOOKBACK = 21        # days read on the first run
BOX_SECONDS = 420        # time limit per run; whatever is left gets read next run
LABELS = {"MIN": "min", "PTS": "pts", "REB": "reb", "AST": "ast", "3PT": "3pt", "STL": "stl", "BLK": "blk",
          "TO": "to", "FG": "fg", "FT": "ft", "OREB": "oreb"}
KEYS = {"minutes": "min", "points": "pts", "rebounds": "reb", "totalRebounds": "reb", "assists": "ast",
        "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "3pt", "steals": "stl", "blocks": "blk",
        "turnovers": "to", "fieldGoalsMade-fieldGoalsAttempted": "fg", "freeThrowsMade-freeThrowsAttempted": "ft",
        "offensiveRebounds": "oreb"}

def fnum(x):
    try: return float(str(x).replace(",", "").split(":")[0])
    except (TypeError, ValueError): return 0.0

def made_att(x):
    p = str(x or "0-0").split("-")
    return fnum(p[0]), fnum(p[-1])

SCORES = {}
def final_scores(sport, day):
    """{espn event id: (away score, home score)} for finished games on an ET date."""
    if (sport, day) in SCORES: return SCORES[(sport, day)]
    out = {}
    try:
        j = espn_get(sport, "scoreboard", dates=day, limit=500)
        for ev in j.get("events", []):
            if (ev.get("season") or {}).get("type") == 1:      # preseason doesn't count
                continue
            comp = ev["competitions"][0]
            if not ((comp.get("status") or ev.get("status") or {}).get("type") or {}).get("completed"):
                continue
            sc = {c["homeAway"]: num(c.get("score")) for c in comp["competitors"]}
            out[ev["id"]] = (sc.get("away"), sc.get("home"))
    except Exception as e:
        print("scores failed:", sport, day, e)
    SCORES[(sport, day)] = out
    return out

def box_score(sport, eid):
    """Players: {athlete id: (name, team abbr, team id, opp abbr, home 1/0, {stat: value})}; teams: {team id: totals}."""
    j = espn_get(sport, "summary", event=eid)
    sides = (j.get("boxscore") or {}).get("players") or []
    if len(sides) != 2:
        return {}, {}
    comp = (((j.get("header") or {}).get("competitions")) or [{}])[0]
    ha = {str(c.get("id") or (c.get("team") or {}).get("id")): c.get("homeAway") for c in comp.get("competitors", [])}
    players, teams = {}, {}
    for i, side in enumerate(sides):
        t, o = side.get("team") or {}, (sides[1 - i].get("team") or {})
        tid = str(t.get("id", ""))
        home = 1 if (ha.get(tid) == "home" if ha.get(tid) else i == 1) else 0
        tot = teams.setdefault(tid, {"ab": t.get("abbreviation", ""), "opp": str(o.get("id", "")), "home": home,
                                     "pts": 0.0, "reb": 0.0, "ast": 0.0, "tpm": 0.0, "fga": 0.0, "fta": 0.0, "oreb": 0.0, "to": 0.0})
        for cat in (side.get("statistics") or [])[:1]:
            labels, keys = cat.get("labels") or [], cat.get("keys") or []
            cols = [LABELS.get(l) or KEYS.get(k) for l, k in zip(labels or [None] * len(keys), keys or [None] * len(labels))]
            for a in cat.get("athletes", []):
                ath, st = a.get("athlete") or {}, a.get("stats") or []
                if not ath.get("id") or a.get("didNotPlay") or not st:
                    continue
                v = {}
                for c, x in zip(cols, st):
                    if c in ("3pt", "fg", "ft"):
                        m, att = made_att(x)
                        if c == "3pt": v["tpm"] = m
                        elif c == "fg": v["fga"] = att
                        else: v["fta"] = att
                    elif c:
                        v[c] = fnum(x)
                if v.get("min", 0) <= 0 and not any(v.get(k) for k in ("pts", "reb", "ast")):
                    continue
                players[str(ath["id"])] = (ath.get("displayName", ""), t.get("abbreviation", ""), tid,
                                           o.get("abbreviation", ""), home, {c: int(round(v.get(c, 0))) for c in BOX_COLS})
                for k in ("pts", "reb", "ast", "tpm", "fga", "fta", "oreb", "to"):
                    tot[k] += v.get(k, 0.0)
    return players, teams

def build_players(inj):
    """Adds finished games to players.json (players and team logs). Returns the file's contents."""
    pj = load_json("players.json", {})
    players, teams, done = pj.get("players", {}), pj.get("teams", {}), pj.get("done", {})
    start, read, changed = time.time(), 0, False
    today = NOW.astimezone(ET).date()
    for sport in SPORTS:
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
                    box, tbox = box_score(sport, eid)
                except Exception as e:
                    print("box score failed:", sport, eid, e); continue
                read += 1; seen.add(eid); changed = True
                for aid, (name, ab, tid, opp, home, st) in box.items():
                    p = players.setdefault(aid, {"n": name, "s": sport, "t": ab, "tid": tid, "g": []})
                    p["g"] = [g for g in p["g"] if g[0] != int(day)]
                    p["g"].append([int(day), opp, home] + [st.get(c, 0) for c in BOX_COLS])
                    p["g"].sort(key=lambda g: g[0], reverse=True)
                    p["g"] = p["g"][:BOX_KEEP]
                    if p["g"][0][0] == int(day):
                        p.update(n=name, t=ab, tid=tid)
                if len(tbox) == 2:
                    (ta, A), (tb, B) = list(tbox.items())
                    for tid, me, op in ((ta, A, B), (tb, B, A)):
                        poss = me["fga"] - me["oreb"] + me["to"] + 0.44 * me["fta"]
                        t = teams.setdefault(tid, {"s": sport, "ab": me["ab"], "g": []})
                        t["ab"] = me["ab"] or t["ab"]
                        t["g"] = [g for g in t["g"] if g[0] != int(day)]
                        t["g"].append([int(day), me["opp"], int(me["pts"]), int(op["pts"]), int(me["reb"]), int(op["reb"]),
                                       int(me["ast"]), int(op["ast"]), int(me["tpm"]), int(op["tpm"]), round(poss, 1)])
                        t["g"].sort(key=lambda g: g[0], reverse=True)
                        t["g"] = t["g"][:TEAM_KEEP]
            if timed_out:
                break
        done[sport] = {"ids": sorted(seen)[-4000:],
                       "through": (done.get(sport, {}).get("through") if timed_out else (today - dt.timedelta(days=1)).strftime("%Y%m%d"))}
    # drop players who haven't played in 5 weeks or barely play
    old = int((today - dt.timedelta(days=35)).strftime("%Y%m%d"))
    def keeps(p):
        g = p["g"]
        if not g or g[0][0] < old: return False
        mins = sum(x[3] for x in g) / len(g)
        return mins >= (12 if p["s"] == "CBB" else 6)
    before = len(players)
    players = {k: v for k, v in players.items() if keeps(v)}
    changed = changed or len(players) != before
    injuries = {}
    for team, lst in (inj or {}).items():
        for name, pos, status in lst:
            if status and status.lower() != "active":
                injuries[pname(name)] = status
    changed = changed or injuries != pj.get("inj")
    print(f"players: read {read} box scores in {time.time() - start:.0f}s; {len(players)} players, {len(teams)} teams on file")
    out = {"updated": iso(NOW), "cols": ["date", "opp", "home"] + BOX_COLS, "inj": injuries,
           "players": dict(sorted(players.items())), "teams": teams, "done": done}
    if changed:
        save_json("players.json", out)
    return out


# ---------- team stats from the box scores, ranked across each league ----------
TEAM_STATS = {   # key: (index in team game row, higher_is_better)
    "ppg": (2, True), "ppg_a": (3, False), "reb": (4, True), "reb_a": (5, False),
    "ast": (6, True), "ast_a": (7, False), "tpm": (8, True), "tpm_a": (9, False), "pace": (10, True),
}

def build_team_stats(games, pj):
    teams = pj.get("teams", {})
    need = {(g["sp"], g[s].get("tid")) for g in games for s in ("a", "h") if g[s].get("tid")}
    out = {}
    for sp in SPORTS:
        league = {}
        for tid, t in teams.items():
            if t.get("s") != sp or len(t["g"]) < 2:
                continue
            g = t["g"]
            v = {"gp": len(g)}
            for k, (i, _) in TEAM_STATS.items():
                v[k] = round(sum(x[i] for x in g) / len(g), 1)
            league[tid] = v
        if not league:
            continue
        avg = {}
        for k, (_, hib) in TEAM_STATS.items():
            vals = sorted(((t, v[k]) for t, v in league.items()), key=lambda x: x[1], reverse=hib)
            avg[k] = round(sum(x for _, x in vals) / len(vals), 2)
            for i, (t, _) in enumerate(vals):
                league[t].setdefault("rk", {})[k] = i + 1
        for tid, v in league.items():
            if (sp, tid) in need:
                out[f"{sp}:{tid}"] = v
        out[f"{sp}:_league"] = {"n": len(league), "avg": avg}
        print(f"team stats {sp}: {len(league)} teams ranked")
    return out


# ---------- recent form from the box scores ----------
def attach_form(rows, games_by_id, inj, pj):
    """Adds sd (player's side), aid, rf = {v: last 5, n, o, u, avg, med, ha, us: minutes}, ij, tmo."""
    players = pj.get("players", {})
    col = {c: 3 + i for i, c in enumerate(BOX_COLS)}
    by_team = {}
    for aid, p in players.items():
        by_team.setdefault((p["s"], str(p.get("tid"))), []).append((pname(p["n"]), aid))
    done = 0
    for r in rows:
        g = games_by_id.get(r["g"])
        if not g:
            continue
        key, aid = pname(r["pl"]), None
        best = (0.0, None, None)
        for side in ("a", "h"):
            for nm, a in by_team.get((g["sp"], str(g[side].get("tid"))), []):
                sc = sim(key, nm)
                if sc > best[0]: best = (sc, a, side)
        if best[0] >= .84:
            _, aid, r["sd"] = best
        if not aid:
            continue
        r["aid"] = aid
        if inj and g["sp"] == "NBA":
            team = g[r["sd"]].get("full", "")
            r.pop("ij", None)
            for n, pos, st in inj.get(team, []):
                if pname(n) == key and st and st.lower() != "active":
                    r["ij"] = st
            outs = [f"{n} ({st})" for n, pos, st in inj.get(team, []) if pname(n) != key and st in ("Out", "Doubtful")]
            if outs: r["tmo"] = outs[:4]
        stats = FORM_STAT.get(r["mk"])
        log = [x for x in players[aid]["g"] if x[col["min"]] > 0][:10]
        if not stats or len(log) < 2:
            continue
        vals = [sum(x[col[k]] for k in stats) for x in log]
        rf = {"v": vals[:5], "n": len(vals), "o": sum(1 for v in vals if v > r["ln"]), "u": sum(1 for v in vals if v < r["ln"]),
              "avg": round(sum(vals[:5]) / len(vals[:5]), 1), "med": round(median(vals), 1),
              "us": [x[col["min"]] for x in log[:5]], "ul": "Minutes"}
        hv = [v for v, x in zip(vals, log) if x[2] == 1]
        av = [v for v, x in zip(vals, log) if x[2] == 0]
        if hv and av:
            rf["ha"] = [round(sum(hv) / len(hv), 1), len(hv), round(sum(av) / len(av), 1), len(av)]
        r["rf"] = rf
        done += 1
    print(f"recent form added to {done} of {len(rows)} props")


# ---------- board chance (same math as the page at default settings) ----------
K_FORM, W_MATCH = 10, 0.5
MATCH_STAT_PY = {"player_points": ["ppg_a"], "player_rebounds": ["reb_a"], "player_assists": ["ast_a"],
                 "player_threes": ["tpm_a"], "player_points_rebounds_assists": ["ppg_a", "reb_a", "ast_a"],
                 "player_points_rebounds": ["ppg_a", "reb_a"], "player_points_assists": ["ppg_a", "ast_a"],
                 "player_rebounds_assists": ["reb_a", "ast_a"], "player_steals": ["pace"], "player_blocks": ["pace"],
                 "player_blocks_steals": ["pace"], "player_turnovers": ["pace"]}

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
    m_opp = m is not None and abs(m - 1) >= .06 and ((m > 1) != mkt)
    return bool(form_opp or (m_opp and not form_agree))

def all_agree(r, teams, gbi, p):
    mkt = r["po"] >= .5
    rf = r.get("rf"); n = (rf["o"] + rf["u"]) if rf else 0
    if n < 4 or r["nb"] < 2 or max(p, 1 - p) < .542: return False
    h = rf["o"] / n
    if (h >= .5) != mkt or abs(h - .5) < .0999: return False
    m = match_factor(r, teams, gbi)
    if m is not None and abs(m - 1) >= .03 and (m > 1) != mkt: return False
    if r.get("ij") and r["ij"].lower() in ("questionable", "doubtful", "out", "day-to-day"): return False
    return (p >= .5) == mkt


# ---------- track record: snapshot picks before tip-off, grade them after ----------
def tier_of(p):
    return "strong" if p >= .591 else "playable" if p >= .542 else "thin"

def update_history(games, props, teams, pj):
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
            "mx": is_mixed(r, teams, gbi), "ag": all_agree(r, teams, gbi, pf), "aid": r["aid"], "bm": r.get("bm"),
            # what went into the chance, so the page can replay any settings later
            "fo": (r.get("rf") or {}).get("o"), "fu": (r.get("rf") or {}).get("u"),
            "mf": (round(match_factor(r, teams, gbi), 4) if match_factor(r, teams, gbi) else None)}
    for g in games:
        if g.get("eid") and parse_t(g["kick"]) > NOW and g.get("src") != "espn":
            h["pending"][f"m|{g['id']}"] = {"t": "m", "sp": g["sp"], "kick": g["kick"], "eid": g["eid"],
                                           "a": g["a"]["n"], "h": g["h"]["n"], "side": "a" if g["fair"] >= .5 else "h",
                                           "p": round(max(g["fair"], 1 - g["fair"]), 4)}
    players = pj.get("players", {})
    col = {c: 3 + i for i, c in enumerate(BOX_COLS)}
    graded = 0
    for k, x in list(h["pending"].items()):
        kick = parse_t(x["kick"])
        if NOW - kick < dt.timedelta(hours=3):
            continue
        if NOW - kick > dt.timedelta(days=4):          # never got a result (didn't play, game moved)
            del h["pending"][k]; continue
        day = int(kick.astimezone(ET).strftime("%Y%m%d"))
        if x["t"] == "p":
            p = players.get(str(x.get("aid")))
            game = next((e for e in (p or {}).get("g", []) if e[0] == day), None)
            if not game:
                continue
            act = sum(game[col[s]] for s in FORM_STAT[x["mk"]])
            res = None if act == x["ln"] else ((act > x["ln"]) == (x["side"] == "o"))
            h["props"].append({"d": kick.astimezone(ET).strftime("%Y-%m-%d"), "sp": x["sp"], "pl": x["pl"], "mk": x["mk"],
                               "ln": x["ln"], "pp": x["pp"], "nb": x["nb"], "po": x["po"], "side": x["side"], "p": x["p"],
                               "mx": x["mx"], "ag": x.get("ag", False), "act": act, "hit": res, "bm": x.get("bm"), "fo": x.get("fo"), "fu": x.get("fu"), "mf": x.get("mf")})
        else:
            sc = final_scores(x["sp"], str(day)).get(x["eid"])
            if not sc or sc[0] is None or sc[1] is None:
                continue
            res = None if sc[0] == sc[1] else (("a" if sc[0] > sc[1] else "h") == x["side"])
            h["ml"].append({"d": kick.astimezone(ET).strftime("%Y-%m-%d"), "sp": x["sp"], "a": x["a"], "h": x["h"],
                            "side": x["side"], "p": x["p"], "hit": res})
        del h["pending"][k]
        graded += 1
    h["props"], h["ml"] = h["props"][-5000:], h["ml"][-3000:]
    save_json("history.json", h)
    print(f"track record: graded {graded} picks; {len(h['pending'])} waiting; {len(h['props'])} props and {len(h['ml'])} games on record")
    return summarize(h)

def summarize(h):
    def agg(rows):
        rows = [r for r in rows if r.get("hit") in (True, False)]
        n = len(rows)
        return {"n": n, "w": sum(1 for r in rows if r["hit"]), "ep": round(sum(r["p"] for r in rows) / n, 4) if n else None}
    wk = str((NOW - dt.timedelta(days=7)).astimezone(ET).date())
    P, M = h["props"], h["ml"]
    return {"props": {
        "all": agg(P), "week": agg([r for r in P if r["d"] >= wk]),
        "strong": agg([r for r in P if tier_of(r["p"]) == "strong"]),
        "playable": agg([r for r in P if tier_of(r["p"]) == "playable"]),
        "thin": agg([r for r in P if tier_of(r["p"]) == "thin"]),
        "clean": agg([r for r in P if not r["mx"]]), "mixed": agg([r for r in P if r["mx"]]),
        "agree": agg([r for r in P if r.get("ag")]),
        "scanner": agg([r for r in P if r["p"] >= .542 and not r["mx"] and r["nb"] >= 2]),
        "pp": agg([r for r in P if r["pp"]]), "more": agg([r for r in P if r["side"] == "o"]),
        "less": agg([r for r in P if r["side"] == "u"]),
        "nba": agg([r for r in P if r["sp"] == "NBA"]), "cbb": agg([r for r in P if r["sp"] == "CBB"]),
        "stat": {mk: agg([r for r in P if r["mk"] == mk]) for mk in sorted({r["mk"] for r in P})}},
        "ml": {"all": agg(M), "week": agg([r for r in M if r["d"] >= wk]),
               "b50": agg([r for r in M if r["p"] < .6]), "b60": agg([r for r in M if .6 <= r["p"] < .7]),
               "b70": agg([r for r in M if .7 <= r["p"] < .8]), "b80": agg([r for r in M if r["p"] >= .8])},
        "since": min([r["d"] for r in P + M] or [None]) if (P or M) else None,
        "recent": [{k: r[k] for k in ("d", "pl", "mk", "ln", "side", "p", "act", "hit", "mx")} for r in P[-30:]][::-1]}



# ---------- brief.json: a small summary for the morning message ----------
def fit_cal(P):
    """The honest-chances fit the pages use: chance = 50% + a + b x (board's chance - 50%), fitted to graded picks.
    With nothing graded, b = 1/2 (half as far from a coin flip as the board says)."""
    n, A = len(P), 30
    if not n:
        return 0.0, .5
    xs = [x["p"] - .5 for x in P]; ys = [(1 if x["hit"] else 0) - .5 for x in P]
    sx, sy = sum(xs), sum(ys); sxx = sum(u * u for u in xs); sxy = sum(u * v for u, v in zip(xs, ys))
    B = A * sxx / n; a11, a22, b2 = n + A, sxx + B, sxy + B * .5; det = a11 * a22 - sx * sx
    if det <= 1e-12:
        b = .5; a = (sy - b * sx) / (n + A)
    else:
        a = (sy * a22 - sx * b2) / det; b = (a11 * b2 - sx * sy) / det
        if b < .05 or b > 1:
            b = min(1, max(.05, b)); a = (sy - b * sx) / (n + A)
    return max(-.08, min(.08, a)), b

def write_brief(games, props, teams, site, url):
    """Today's strongest picks, the biggest line gaps and last night's results, small enough to read in a text."""
    gbi = {g["id"]: g for g in games}
    picks, gaps = {}, []
    h = load_json("history.json", {})
    P = [x for x in h.get("props", []) if x.get("pp") and x.get("hit") in (True, False)]
    ca, cb = fit_cal(P)
    # each stat with 40+ graded picks gets its own fit, blended with the overall one (half each at 150 picks), like the pages
    fits = {}
    for mk in {x["mk"] for x in P}:
        L = [x for x in P if x["mk"] == mk]
        if len(L) >= 40:
            sa, sb = fit_cal(L); w = len(L) / (len(L) + 150); fits[mk] = (w * sa + (1 - w) * ca, w * sb + (1 - w) * cb)
    # and each stat's More and Less sides get a nudge toward how that side has really done (30+ picks, half weight at 200, at most 4 points), like the pages
    shifts = {}
    for key in {(x["mk"], x["side"]) for x in P}:
        L = [x for x in P if (x["mk"], x["side"]) == key]
        if len(L) >= 30:
            a, b = fits.get(key[0], (ca, cb))
            gap = sum((1 if x["hit"] else 0) - min(.8, max(.3, .5 + a + b * (x["p"] - .5))) for x in L)
            shifts[key] = max(-.04, min(.04, len(L) / (len(L) + 200) * gap / len(L)))
    def honest_mk(q, mk, side):
        a, b = fits.get(mk, (ca, cb)); return min(.8, max(.3, .5 + a + b * (q - .5) + shifts.get((mk, side), 0)))   # chance on the board's side, adjusted for its record
    for r in props:
        g = gbi.get(r["g"])
        if not g or not r.get("pp") or r.get("nb", 0) < 2 or parse_t(g["kick"]) <= NOW:
            continue
        if r.get("ij") and r["ij"].lower().startswith(("out", "doubtful")):
            continue
        pf = board_prob(r, teams, gbi)
        side, p = ("o", pf) if pf >= .5 else ("u", 1 - pf)
        t = g[r["sd"]] if r.get("sd") else None
        o = g["h" if r.get("sd") == "a" else "a"] if r.get("sd") else None
        item = {"pl": r["pl"], "stat": MARKET_LABEL.get(r["mk"], r["mk"]), "side": "More" if side == "o" else "Less", "ln": r["ln"],
                "p": round(honest_mk(p, r["mk"], side), 3), "raw": round(p, 3), "sp": g["sp"],
                "game": (f"{t['ab']} {'at' if r['sd'] == 'a' else 'vs'} {o['ab']}" if t and o else f"{g['a']['ab']} @ {g['h']['ab']}"),
                "time": parse_t(g["kick"]).astimezone(ET).strftime("%a %-I:%M %p"), "kick": g["kick"], "mk": r["mk"], "gid": r["g"]}
        why, mkt, fm = [], (r["po"] if side == "o" else 1 - r["po"]), r.get("rf")
        if mkt >= .53: why.append(f"{r['nb']} books lean {item['side']} ({round(mkt * 100)}%)")
        if fm and fm.get("n", 0) >= 3:
            hit = fm["o"] if side == "o" else fm["u"]
            if hit / fm["n"] >= .6: why.append(f"{'over' if side == 'o' else 'under'} {r['ln']} in {hit} of his last {fm['n']}")
        if r.get("bm") is not None and (r["bm"] - r["ln"]) * (1 if side == "o" else -1) > 0 and abs((r["bm"] - r["ln"]) / sigma_for(r["mk"], r["ln"])) >= .15:
            why.append(f"books have {r['bm']} vs PrizePicks {r['ln']}")
        item["why"] = why
        if not is_mixed(r, teams, gbi) and (r["pl"] not in picks or picks[r["pl"]]["p"] < p):
            picks[r["pl"]] = item
        if r.get("bm") is not None:
            gz = (r["bm"] - r["ln"]) / sigma_for(r["mk"], r["ln"])
            if abs(gz) >= .15:
                gaps.append(dict(item, side="More" if gz > 0 else "Less", p=round(honest_mk(p, r["mk"], side) if (gz > 0) == (side == "o") else 1 - honest_mk(p, r["mk"], side), 3), books=r["bm"], gz=round(gz, 2)))
    last_day = max((x["d"] for x in P), default=None)
    last = [x for x in P if x["d"] == last_day] if last_day else []
    brief = {"updated": iso(NOW), "site": site, "url": url,
             "top": sorted(picks.values(), key=lambda x: -x["p"])[:5],
             "gaps": sorted(gaps, key=lambda x: -abs(x["gz"]))[:3],
             "last": {"day": last_day, "w": sum(1 for x in last if x["hit"]), "l": sum(1 for x in last if not x["hit"])},
             "record": {"w": sum(1 for x in P if x["hit"]), "n": len(P)}}
    # how picks on the side a line gap favors have really done
    G = [x for x in h.get("props", []) if x.get("pp") and x.get("bm") is not None and x.get("act") is not None and x["act"] != x["ln"]
         and x["bm"] != x["ln"] and abs((x["bm"] - x["ln"]) / sigma_for(x["mk"], x["ln"])) >= .15]
    brief["gaprec"] = {"w": sum(1 for x in G if (x["act"] > x["ln"]) == (x["bm"] > x["ln"])), "n": len(G)}
    with open(os.path.join(HERE, "brief.json"), "w") as fh:
        json.dump(brief, fh, separators=(",", ":"))
    # the autopilot: today's fake entries for each strategy, and grading the older ones (autopilot_sports.py)
    try:
        import sys
        for d in (HERE, os.path.dirname(HERE)):
            if d not in sys.path: sys.path.insert(0, d)
        import autopilot_sports
        autopilot_sports.run(HERE, site, list(picks.values()), gaps, NOW)
    except Exception as e:
        print("autopilot failed:", e)

def main():
    s = settings()
    inj = get_injuries()
    pj = build_players(inj)
    games, events = build_games(s, inj)
    props, budget = (build_props(s, events) if (KEY and events) else ([], 0))
    attach_form(props, {g["id"]: g for g in games}, inj, pj)
    teams = build_team_stats(games, pj)
    try:
        record = update_history(games, props, teams, pj)
    except Exception as e:
        print("track record failed:", e)
        record = None
    try:
        if games: write_brief(games, props, teams, "Baseline", "https://officialgewtified.github.io/RepoBoard/baseline/")
    except Exception as e:
        print("brief failed:", e)
    out = {"updated": iso(NOW), "games": games, "props": props, "nokey": not KEY,
           "markets": {k: MARKET_LABEL[k] for k in s["prop_markets"] if k in MARKET_LABEL},
           "books": BOOK_TITLES,
           "credits": {"remaining": CRED["remaining"], "used": CRED["used"], "spent": CRED["spent"], "prop_budget": budget},
           "teams": teams, "record": record}
    if not games and os.path.exists(os.path.join(HERE, "data.json")) and KEY:
        print("no games found; keeping previous data.json")
        return
    save_json("data.json", out)
    print(f"wrote {len(games)} games ({sum(g['sp'] == 'CBB' for g in games)} college), {len(props)} props")

if __name__ == "__main__":
    main()
