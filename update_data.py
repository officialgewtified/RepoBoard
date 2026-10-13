"""Builds data.json for the Parlay Board: odds, weather, injuries."""
import os, json, requests, datetime as dt
from zoneinfo import ZoneInfo

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
BOOKS = ["draftkings", "fanduel", "betmgm", "williamhill_us", "espnbet", "bovada"]
HERE = os.path.dirname(os.path.abspath(__file__))

def get_odds():
    r = requests.get("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/",
        params={"regions": "us", "markets": "h2h", "oddsFormat": "american", "apiKey": os.environ["ODDS_API_KEY"]}, timeout=30)
    r.raise_for_status()
    return r.json()

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

def inj_note(name, inj):
    if name not in inj:
        return None
    ab = T[name][0]
    qbs = [f"{n} ({s})" for n, p, s in inj[name] if p == "QB" and s in ("Out", "Doubtful", "Questionable")]
    outs = sum(1 for n, p, s in inj[name] if s == "Out" and p != "QB")
    txt = "QB " + ", ".join(qbs) if qbs else "no QB listed"
    if outs: txt += f"; {outs} others out"
    return f"{ab}: {txt}"

def level(temp, wind, gust, rain):
    if gust >= 30 or (rain >= 70 and wind >= 15) or temp <= 15: return 3
    if wind >= 18 or gust >= 25 or rain >= 70 or temp <= 25: return 2
    if wind >= 12 or rain >= 40 or temp <= 35: return 1
    return 0

def weather(venue, kick):
    if venue[3] == "closed":
        return 0, "Dome or covered stadium"
    try:
        h = requests.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": venue[1], "longitude": venue[2], "timezone": "UTC", "forecast_days": 16,
            "hourly": "temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m",
            "temperature_unit": "fahrenheit", "wind_speed_unit": "mph"}, timeout=30).json()["hourly"]
        i = h["time"].index(kick.strftime("%Y-%m-%dT%H:00"))
        t, w, g, p = h["temperature_2m"][i], h["wind_speed_10m"][i], h["wind_gusts_10m"][i], h["precipitation_probability"][i] or 0
        return level(t, w, g, p), f"{t:.0f}F, wind {w:.0f} mph (gusts {g:.0f}), {p}% chance of rain"
    except Exception as e:
        print("weather failed:", e)
        return 0, "Forecast unavailable. Check it yourself."

def main():
    try: over = json.load(open(os.path.join(HERE, "overrides.json")))
    except Exception: over = {}
    now = dt.datetime.now(dt.timezone.utc)
    inj = get_injuries()
    games = []
    for e in sorted(get_odds(), key=lambda x: x["commence_time"]):
        kick = dt.datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00"))
        if kick < now or kick > now + dt.timedelta(days=8): continue
        away, home = e["away_team"], e["home_team"]
        if away not in T or home not in T: continue
        prices = {}
        for b in e["bookmakers"]:
            for m in b["markets"]:
                if m["key"] == "h2h":
                    prices[b["key"]] = {o["name"]: o["price"] for o in m["outcomes"]}
        keys = [k for k in BOOKS if k in prices] + [k for k in prices if k not in BOOKS]
        if not keys: continue
        A = prices[keys[0]]; B = prices[keys[1]] if len(keys) > 1 else {}
        o = over.get(f"{away}@{home}", {})
        venue = (T[home][0], o.get("lat", T[home][1]), o.get("lon", T[home][2]), o.get("roof", T[home][3]))
        w, wn = weather(venue, kick.replace(minute=0, second=0, microsecond=0))
        notes = [n for n in (inj_note(away, inj), inj_note(home, inj)) if n]
        games.append({"a": T[away][0], "h": T[home][0], "day": kick.astimezone(ZoneInfo("America/New_York")).strftime("%a"),
            "am": A.get(away), "hm": A.get(home), "am2": B.get(away), "hm2": B.get(home),
            "w": w, "wn": wn, "inj": " | ".join(notes) or "Injury data unavailable"})
    games = [g for g in games if g["am"] is not None and g["hm"] is not None]
    json.dump({"updated": now.isoformat(), "games": games}, open(os.path.join(HERE, "data.json"), "w"), indent=1)
    print("wrote", len(games), "games")

if __name__ == "__main__":
    main()
