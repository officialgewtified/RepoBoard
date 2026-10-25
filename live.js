/* Live: ESPN's free box scores and injury lists, read straight from your phone (ESPN allows it).
   Used by the sweat tracker on open tickets and the late scratch check on all three sites.
   Nothing here touches the Odds API, so it costs no credits. */
window.Live=(function(){
"use strict";
const PATH={NFL:"football/nfl",CFB:"football/college-football",NBA:"basketball/nba",CBB:"basketball/mens-college-basketball"};
const API="https://site.api.espn.com/apis/site/v2/sports/";
const nm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z ]/g,"").replace(/\b(jr|sr|ii|iii|iv|v)\b/g,"").replace(/\s+/g," ").trim();
const cache={},inflight={};
async function getJSON(url,maxAge){const c=cache[url];if(c&&Date.now()-c.t<maxAge)return c.d;if(inflight[url])return inflight[url];
 inflight[url]=fetch(url,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("ESPN "+r.status);return r.json()}).then(j=>{cache[url]={t:Date.now(),d:j};return j}).finally(()=>{delete inflight[url]});
 return inflight[url]}

/* one game's box score, boiled down to each player's numbers */
function parse(j){
 const comp=((j.header||{}).competitions||[])[0]||{},st=(comp.status||{}).type||{};
 const players={};
 for(const team of ((j.boxscore||{}).players)||[])for(const cat of team.statistics||[]){
  const labels=cat.labels||[],name=(cat.name||"").toLowerCase();
  for(const a of cat.athletes||[]){const n=nm(a.athlete&&a.athlete.displayName);if(!n)continue;const P=players[n]=players[n]||{};
   if(a.didNotPlay){P.dnp=a.reason||"Did not play";continue}
   const s=a.stats||[],v=l=>{const i=labels.indexOf(l);return i<0?null:s[i]},num=x=>{const f=parseFloat(x);return isFinite(f)?f:0};
   if(name==="passing"){const ca=String(v("C/ATT")||"0/0").split("/");P.pass_c=num(ca[0]);P.pass_a=num(ca[1]);P.pass_yds=num(v("YDS"));P.pass_td=num(v("TD"));P.pass_int=num(v("INT"))}
   else if(name==="rushing"){P.rush_att=num(v("CAR"));P.rush_yds=num(v("YDS"))}
   else if(name==="receiving"){P.rec=num(v("REC"));P.rec_yds=num(v("YDS"))}
   else if(labels.includes("PTS")){P.pts=num(v("PTS"));P.reb=num(v("REB"));P.ast=num(v("AST"));P.stl=num(v("STL"));P.blk=num(v("BLK"));P.to=num(v("TO"));
    P.tpm=num(String(v("3PT")||"0").split("-")[0]);P.min=v("MIN")}}}
 const state=st.state||"pre",completed=!!st.completed||state==="post";
 return{state,completed,detail:st.shortDetail||st.detail||"",players,sig:(st.shortDetail||"")+"|"+JSON.stringify(players)}}

const VAL={player_pass_yds:P=>P.pass_yds,player_pass_tds:P=>P.pass_td,player_pass_completions:P=>P.pass_c,player_pass_attempts:P=>P.pass_a,
 player_pass_interceptions:P=>P.pass_int,player_rush_yds:P=>P.rush_yds,player_rush_attempts:P=>P.rush_att,player_reception_yds:P=>P.rec_yds,
 player_receptions:P=>P.rec,player_rush_reception_yds:P=>(P.rush_yds||0)+(P.rec_yds||0),player_pass_rush_yds:P=>(P.pass_yds||0)+(P.rush_yds||0),
 player_points:P=>P.pts,player_rebounds:P=>P.reb,player_assists:P=>P.ast,player_threes:P=>P.tpm,
 player_points_rebounds_assists:P=>(P.pts||0)+(P.reb||0)+(P.ast||0),player_points_rebounds:P=>(P.pts||0)+(P.reb||0),
 player_points_assists:P=>(P.pts||0)+(P.ast||0),player_rebounds_assists:P=>(P.reb||0)+(P.ast||0),player_blocks:P=>P.blk,player_steals:P=>P.stl,
 player_blocks_steals:P=>(P.blk||0)+(P.stl||0),player_turnovers:P=>P.to};

return{
 nm,
 /* a game's live box score (cached for maxAge ms) */
 async game(sp,eid,maxAge=30000){if(!PATH[sp]||!eid)throw new Error("no game");return parse(await getJSON(`${API}${PATH[sp]}/summary?event=${eid}`,maxAge))},
 /* a player's number for a PrizePicks stat; players who haven't touched the ball yet aren't in a football box score, so they count as 0 */
 stat(d,pl,mk){const P=d.players[nm(pl)];if(P&&P.dnp)return{dnp:P.dnp};const f=VAL[mk];if(!f)return null;const v=P?f(P):0;return{v:v==null?0:v,seen:!!P}},
 /* where a pick stands: ok (hit), no (missed), push, live (still going), dnp */
 judge(s,ln,side,d){if(!s)return null;if(s.dnp)return{c:"dnp",t:"Didn't play"};const v=s.v,fin=d.completed;
  if(side==="o"){if(v>ln)return{c:"ok",t:"Hit"};if(fin)return v===ln?{c:"push",t:"Push"}:{c:"no",t:"Missed"};return{c:"live",t:`${+(ln-v+(Number.isInteger(ln)?1:.5)).toFixed(1)} to go`}}
  if(v>ln)return{c:"no",t:"Missed"};if(fin)return v===ln?{c:"push",t:"Push"}:{c:"ok",t:"Hit"};return{c:"live",t:`${+(ln-v).toFixed(1)} under`}},
 /* every player listed out, doubtful or questionable in a league right now */
 async injuries(sp,maxAge=600000){if(!PATH[sp])return{};const j=await getJSON(`${API}${PATH[sp]}/injuries`,maxAge),out={};
  for(const t of j.injuries||[])for(const i of t.injuries||[]){const n=nm(i.athlete&&i.athlete.displayName);if(n)out[n]=i.status||((i.type||{}).description)||""}
  return out},
 isOut:s=>/out|doubtful|injured reserve|suspen|inactive/i.test(s||"")
}})();
