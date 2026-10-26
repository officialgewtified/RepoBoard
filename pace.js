/* Live pace: while games are on, every player with a line and how close he is to hitting it, from ESPN's free live
   box scores (no Odds API credits). The read you'd make yourself in the 4th quarter: how many he has, how many he
   needs, how much game is left, and the pace he's on. Shared by Gridline, Baseline and Crossover; needs live.js. */
window.Pace=(function(){
"use strict";
const FMT={NBA:[4,720],CBB:[2,1200],NFL:[4,900],CFB:[4,900]};       // periods, seconds in each
const LAB={player_points:"Points",player_rebounds:"Rebounds",player_assists:"Assists",player_threes:"3-PT Made",player_points_rebounds_assists:"Pts+Rebs+Asts",
 player_points_rebounds:"Pts+Rebs",player_points_assists:"Pts+Asts",player_rebounds_assists:"Rebs+Asts",player_blocks:"Blocks",player_steals:"Steals",player_blocks_steals:"Blks+Stls",
 player_turnovers:"Turnovers",player_pass_yds:"Pass Yards",player_rush_yds:"Rush Yards",player_reception_yds:"Receiving Yards",player_receptions:"Receptions",player_pass_tds:"Pass TDs",
 player_pass_completions:"Completions",player_pass_attempts:"Pass Attempts",player_rush_attempts:"Rush Attempts",player_pass_interceptions:"Interceptions",
 player_rush_reception_yds:"Rush+Rec Yards",player_pass_rush_yds:"Pass+Rush Yards"};
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LIVE={};let busy=false,at=0;

/* how far through the game it is, 0 to 1 */
function progress(sp,d){const F=FMT[sp];if(!F||!d)return null;if(d.completed)return 1;if(d.state!=="in")return 0;
 const[N,L]=F,p=d.period||1,c=d.clock!=null?Math.min(L,d.clock):L;if(p>N)return .99;   // overtime: nearly done
 return Math.max(.01,Math.min(.99,((p-1)*L+(L-c))/(N*L)))}
/* games with a line that have started in the last few hours */
function liveGames(lines){const now=Date.now(),seen={};
 for(const l of lines){const g=l.g;if(!g||!g.eid||!g.t||seen[g.eid])continue;if(g.t>now||now-g.t>5.5*36e5)continue;
  const d=LIVE[g.eid];if(d&&d.completed&&now-g.t>3.5*36e5)continue;seen[g.eid]=g}
 return Object.values(seen)}
/* fetch their box scores (ESPN allows it from the phone); returns true when something changed */
async function refresh(lines,force){if(busy||!window.Live)return false;if(!force&&Date.now()-at<45000)return false;
 const G=liveGames(lines);if(!G.length)return false;busy=true;at=Date.now();let ch=false;
 try{await Promise.all(G.slice(0,16).map(async g=>{try{const d=await Live.game(g.sp,g.eid,40000);const o=LIVE[g.eid];LIVE[g.eid]=d;if(!o||o.sig!==d.sig)ch=true}catch(e){}}))}finally{busy=false}
 return ch}
/* every line in a live game, with where the player stands */
function rows(lines){const out=[],seen=new Set();
 for(const l of lines){const g=l.g,d=g&&LIVE[g.eid];if(!d||d.state==="pre")continue;
  const key=Live.nm(l.pl)+"|"+l.mk;if(seen.has(key))continue;seen.add(key);
  const s=Live.stat(d,l.pl,l.mk);if(!s||s.dnp||s.wait||!s.seen)continue;
  const P=d.players[Live.nm(l.pl)]||{},f=progress(l.sp,d);if(f==null)continue;
  const target=Math.floor(l.ln)+1,v=s.v,need=target-v,proj=f>0?v/f:0,flags=[];
  const late=l.sp==="NBA"?d.period>=4:l.sp==="CBB"?d.period>=2&&f>=.75:d.period>=4,m=d.score?Math.abs(d.score.h-d.score.a):0;
  if(!d.completed&&late&&m>=(l.sp==="NFL"||l.sp==="CFB"?21:18))flags.push("Blowout: starters may sit");
  if(!d.completed&&P.pf!=null&&((l.sp==="NBA"&&P.pf>=5)||(l.sp==="CBB"&&P.pf>=4)))flags.push(`${P.pf} fouls`);
  out.push({l,g,d,v,target,need,proj,f,ratio:target?proj/target:0,flags,tm:P.tm||"",min:P.min,hit:need<=0,done:!!d.completed})}
 return out}
const tagOf=x=>x.ratio>=1.25?["hot","Way ahead"]:x.ratio>=1.05?["on","On pace"]:x.ratio>=.9?["close","Close"]:["cold","Behind"];
function left(x){const d=x.d;if(d.completed)return"Final";const t=String(d.detail||"");const m=t.match(/^([\d:.]+)\s*-\s*(.+)$/);return m?`${m[1]} left in the ${m[2]}`:t}
function row(x,cold){const l=x.l,t=cold?["cold","Running cold"]:x.hit?["hit","Hit"]:tagOf(x),w=Math.min(100,x.v/x.target*100),pm=Math.min(100,x.proj/x.target*100*.8);
 return `<button class="pc t-${t[0]}" data-game="${esc(x.g.sp)}|${esc(x.g.eid)}"><span class="pc1"><b>${esc(l.pl)}</b><em>${t[1]}</em></span>
  <span class="pc0">${esc(x.tm?x.tm+" · ":"")}${esc(LAB[l.mk]||l.mk)} · line ${esc(l.ln)}${l.pp?" on PrizePicks":""}</span>
  <span class="pcbar"><i style="width:${(w*.8).toFixed(1)}%"></i><s style="left:80%"></s>${x.hit||x.done?"":`<u style="left:${pm.toFixed(1)}%"></u>`}</span>
  <span class="pc2"><span><b>${x.v}</b> of ${x.target}</span>${x.hit?"":`<span>${cold?`on pace for <b>${x.proj.toFixed(1)}</b>`:`needs <b>${x.need}</b>`}</span>`}<span>${esc(left(x))}</span>${x.hit||cold?"":`<span>pace <b>${x.proj.toFixed(1)}</b></span>`}${x.min?`<span>${esc(x.min)} min</span>`:""}</span>
  ${x.flags.length?`<span class="pcf">${x.flags.map(f=>`<i>${esc(f)}</i>`).join("")}</span>`:""}</button>`}
/* the board: who's cooking, who's running cold (for Less), and lines already hit */
function html(lines,opt){opt=opt||{};const R=rows(lines),G=liveGames(lines);
 if(!G.length)return opt.empty||"";
 const on=R.filter(x=>!x.done&&!x.hit&&x.ratio>=.9).sort((a,b)=>b.ratio-a.ratio||a.need-b.need).slice(0,opt.max||20);
 const cold=R.filter(x=>!x.done&&!x.hit&&x.f>=.5&&x.ratio<=.6&&x.l.ln>=2).sort((a,b)=>a.ratio-b.ratio).slice(0,8);
 const hit=R.filter(x=>x.hit).sort((a,b)=>(b.v-b.target)-(a.v-a.target)).slice(0,10);
 const n=G.filter(g=>LIVE[g.eid]&&LIVE[g.eid].state==="in").length;
 let h=`<h2>${opt.title||"Cooking right now"}</h2><p class="lede">${n?`${n} game${n>1?"s":""} on.`:"Loading the live box scores…"} Players on pace to go over their pregame line, from ESPN's live box scores. The line on your app will have moved since tip-off, so check it before you bet. Updates about every minute.</p>`;
 h+=on.length?`<div class="list pcl">${on.map(x=>row(x)).join("")}</div>`:`<div class="card empty">${n?"Nobody's on pace for their line yet. It fills in as the games go.":"Waiting on the first numbers…"}</div>`;
 if(cold.length)h+=`<h3 class="pch">Running cold</h3><p class="lede">Past halftime and way under their line: the Less side.</p><div class="list pcl">${cold.map(x=>row(x,true)).join("")}</div>`;
 if(hit.length)h+=`<h3 class="pch">Already over</h3><div class="list pcl">${hit.map(x=>row(x)).join("")}</div>`;
 h+=`<p class="fine">Pace assumes he keeps the rate he's had so far. Blowouts, foul trouble and rest cut minutes, and a player on pace can still miss. For entertainment only.</p>`;
 return h}
const anyLive=lines=>liveGames(lines).length>0;
return{refresh,liveGames,rows,html,anyLive,progress,LIVE}})();
