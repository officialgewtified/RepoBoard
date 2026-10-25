#!/bin/bash
# temporary: checks whether the sites can read ESPN's free live stats straight from a phone (CORS)
O="https://officialgewtified.github.io"
for u in \
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard" \
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard" \
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80" \
  "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard" \
  "https://cdn.espn.com/core/nfl/scoreboard?xhr=1" ; do
  echo "=== $u"
  curl -sS -m 20 -D - -o /tmp/body -H "Origin: $O" "$u" | grep -i -E "^HTTP|access-control|cache-control" || true
  head -c 150 /tmp/body; echo
done
EID=$(curl -sS "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['events'][0]['id'])")
echo "=== NFL summary $EID"
curl -sS -m 20 -D - -o /tmp/s -H "Origin: $O" "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=$EID" | grep -i -E "^HTTP|access-control" || true
python3 - <<'PY'
import json
d=json.load(open('/tmp/s'))
print('keys',list(d.keys()))
bs=d.get('boxscore',{}).get('players',[])
print('teams in boxscore',len(bs))
if bs:
    t=bs[0];print('team',t['team'].get('abbreviation'))
    for st in t['statistics'][:4]:
        print(' ',st.get('name'),st.get('labels'),[(a['athlete']['displayName'],a['stats']) for a in st.get('athletes',[])[:2]])
comp=d.get('header',{}).get('competitions',[{}])[0]
print('status',comp.get('status',{}).get('type',{}))
inj=d.get('injuries') or []
print('injuries',[(t.get('team',{}).get('abbreviation'),[(i['athlete']['displayName'],i.get('status')) for i in t.get('injuries',[])[:3]]) for t in inj][:2])
PY
NID=$(curl -sS "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['events'][0]['id'])")
echo "=== NBA summary $NID"
curl -sS -m 20 -D - -o /tmp/n -H "Origin: $O" "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=$NID" | grep -i -E "^HTTP|access-control" || true
python3 - <<'PY'
import json
d=json.load(open('/tmp/n'));bs=d.get('boxscore',{}).get('players',[]);print('nba box teams',len(bs))
if bs: print([(s.get('names') or s.get('labels')) for s in bs[0]['statistics']][:1]); print([(a['athlete']['displayName'],a.get('stats'),a.get('didNotPlay'),a.get('reason')) for a in bs[0]['statistics'][0].get('athletes',[])[:3]])
print('injuries',[(t.get('team',{}).get('abbreviation'),[(i['athlete']['displayName'],i.get('status')) for i in t.get('injuries',[])[:3]]) for t in d.get('injuries',[])][:2])
PY
echo "=== NFL injuries endpoint"
curl -sS -m 20 -D - -o /tmp/i -H "Origin: $O" "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries" | grep -i -E "^HTTP|access-control" || true
head -c 300 /tmp/i; echo
