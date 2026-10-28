"""The autopilot: fake PrizePicks entries every day, so the boards can find out what makes money without anyone's money.

Each update, for that board's games in the next day and a half, it places up to 5 2-pick Power Plays ($10 of fake money
each, pays 3x) for each strategy below, never reusing a player within a strategy that day, and grades the older ones
from the board's own graded picks (history.json). Every strategy has its own fake $1,000 and keeps playing even if it
goes below zero, so it always gets practice. Nothing here spends Odds API credits or touches a real account.

Strategies:
  board   the board's two strongest picks (its chances, adjusted for its record)
  gaps    the two biggest line gaps, on the side the gap favors
  less    the two strongest Less picks
  proven  the two strongest picks from stat-and-side groups that have hit 55% or more over 40+ graded picks
  market  the side the sportsbooks favor most (their no-vig chance), ignoring the board's own math
  more    the two strongest More picks
  random  two random PrizePicks lines on a random side, for comparison: what luck alone does
Writes autopilot.json next to the board's data."""
import os, json, random, datetime as dt
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
STAKE, PAYOUT, START, PER_DAY = 10, 3.0, 1000, 5
STRATS = [("board", "The board's top picks"), ("gaps", "Biggest line gaps"), ("less", "Less only"), ("more", "More only"),
          ("market", "Books' favorite side"), ("proven", "Proven groups"), ("random", "Random (for comparison)")]

def _pt(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))

def _pairs(cands, key, n, used):
    """up to n pairs, best by key first: each pair from two different games, no player used twice"""
    best = sorted(cands, key=key, reverse=True)
    out = []
    for a in best:
        if len(out) >= n:
            break
        if a["pl"] in used:
            continue
        b = next((x for x in best if x["pl"] not in used and x["pl"] != a["pl"] and x["gid"] != a["gid"] and key(x) <= key(a)), None)
        if not b:
            continue
        used.update((a["pl"], b["pl"])); out.append([a, b])
    return out

def _leg(x, side=None, p=None):
    return {"pl": x["pl"], "mk": x["mk"], "stat": x["stat"], "ln": x["ln"], "side": side or ("o" if x["side"] == "More" else "u"),
            "p": round(p if p is not None else x["p"], 3), "game": x["game"], "kick": x["kick"], "gid": x["gid"], "sp": x["sp"]}

def run(here, site, picks, gaps, now):
    path = os.path.join(here, "autopilot.json")
    try:
        with open(path) as f:
            A = json.load(f)
    except Exception:
        A = {}
    if not A.get("v"):
        A = {"v": 1, "site": site, "started": now.isoformat(), "start": START, "stake": STAKE, "payout": PAYOUT,
             "strats": {k: {"name": n, "bank": START} for k, n in STRATS}, "entries": []}
    for k, n in STRATS:
        A["strats"].setdefault(k, {"name": n, "bank": START})
    try:
        with open(os.path.join(here, "history.json")) as f:
            H = json.load(f).get("props", [])
    except Exception:
        H = []

    # 1. grade: each leg against what the player really did (from the board's graded picks)
    acts = {}
    for r in H:
        if r.get("act") is not None:
            acts[(r["d"], r["pl"], r["mk"], r["ln"])] = r["act"]
    graded = 0
    for e in A["entries"]:
        if e.get("res"):
            continue
        out = []
        for l in e["legs"]:
            # the board files results under the game's Eastern date (a 10pm ET tip is already "tomorrow" in UTC)
            a = acts.get((_pt(l["kick"]).astimezone(ET).strftime("%Y-%m-%d"), l["pl"], l["mk"], l["ln"]))
            if a is None:
                # never graded five days after the game (didn't play, game moved): PrizePicks voids it
                out.append("void" if now - _pt(l["kick"]) > dt.timedelta(days=5) else None)
            else:
                l["act"] = a
                out.append("push" if a == l["ln"] else ("hit" if (a > l["ln"]) == (l["side"] == "o") else "miss"))
        if None in out:
            continue
        for l, o in zip(e["legs"], out):
            l["r"] = o
        if "miss" in out:
            e["res"], e["paid"] = "lost", 0
        elif all(o == "hit" for o in out):
            e["res"], e["paid"] = "won", STAKE * PAYOUT
        else:          # a push or a void drops a 2-pick entry to 1 pick, which PrizePicks refunds
            e["res"], e["paid"] = "refund", STAKE
        A["strats"][e["s"]]["bank"] = round(A["strats"][e["s"]]["bank"] + e["paid"], 2)
        e["graded"] = now.isoformat()
        graded += 1

    # 2. place today's entries: games starting in the next 36 hours, up to PER_DAY per strategy per day
    day = now.astimezone(ET).strftime("%Y-%m-%d")
    soon = [x for x in picks if x.get("gid") and now < _pt(x["kick"]) < now + dt.timedelta(hours=36)]
    gsoon = [x for x in gaps if x.get("gid") and now < _pt(x["kick"]) < now + dt.timedelta(hours=36)]
    have, used = {}, {}
    for e in A["entries"]:
        if e["day"] == day:
            have[e["s"]] = have.get(e["s"], 0) + 1
            used.setdefault(e["s"], set()).update(l["pl"] for l in e["legs"])
    grp = {}
    for r in H:
        if r.get("pp") and r.get("hit") in (True, False):
            g = grp.setdefault((r["mk"], r["side"]), [0, 0]); g[1] += 1; g[0] += 1 if r["hit"] else 0
    proven = {k for k, (w, n) in grp.items() if n >= 40 and w / n >= .55}
    side_of = lambda x: "o" if x["side"] == "More" else "u"
    rng = random.Random(f"{site}|{day}")
    placed = 0
    for k, n in STRATS:
        room = PER_DAY - have.get(k, 0)
        if room <= 0:
            continue
        U = used.setdefault(k, set())
        if k == "board":
            E = [[_leg(x) for x in P] for P in _pairs(soon, lambda x: x["p"], room, U)]
        elif k == "gaps":
            E = [[_leg(x, side_of(x)) for x in P] for P in _pairs(gsoon, lambda x: abs(x.get("gz", 0)), room, U)]
        elif k == "less":
            E = [[_leg(x) for x in P] for P in _pairs([x for x in soon if x["side"] == "Less"], lambda x: x["p"], room, U)]
        elif k == "more":
            E = [[_leg(x) for x in P] for P in _pairs([x for x in soon if x["side"] == "More"], lambda x: x["p"], room, U)]
        elif k == "market":
            mk = [x for x in soon if x.get("po") is not None]
            E = [[_leg(x, "o" if x["po"] >= .5 else "u", max(x["po"], 1 - x["po"])) for x in P] for P in _pairs(mk, lambda x: max(x["po"], 1 - x["po"]), room, U)]
        elif k == "proven":
            E = [[_leg(x) for x in P] for P in _pairs([x for x in soon if (x["mk"], side_of(x)) in proven], lambda x: x["p"], room, U)]
        else:          # random: a shuffled order, a coin flip for the side
            pool = soon[:]; rng.shuffle(pool); order = {id(x): i for i, x in enumerate(pool)}
            E = []
            for P in _pairs(pool, lambda x: -order[id(x)], room, U):
                legs = []
                for x in P:
                    sd = rng.choice(["o", "u"]); legs.append(_leg(x, sd, x["p"] if sd == side_of(x) else 1 - x["p"]))
                E.append(legs)
        for legs in E:
            i = have.get(k, 0); have[k] = i + 1
            A["strats"][k]["bank"] = round(A["strats"][k]["bank"] - STAKE, 2)
            A["entries"].append({"id": f"{day}-{k}-{i}", "day": day, "s": k, "stake": STAKE, "legs": legs, "placed": now.isoformat(),
                                 "p": round(legs[0]["p"] * legs[1]["p"], 3)})
            placed += 1

    A["entries"] = A["entries"][-3000:]
    A["updated"] = now.isoformat()
    with open(path, "w") as f:
        json.dump(A, f, separators=(",", ":"))
    print(f"autopilot: graded {graded}, placed {placed}; " + ", ".join(f"{k} ${v['bank']:.0f}" for k, v in A["strats"].items()))
