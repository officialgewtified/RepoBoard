/* Game sheet: tap any game in today's games strip to see the score, team stats, the players' numbers and
   the play-by-play, live from ESPN's free game summary (live.js). Shared by Gridline, Baseline and Crossover.
   Players on your open tickets are highlighted. */
window.GameSheet=(function(){
"use strict";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let cur=null,timer=0,tab="stats";
function dlg(){let d=document.getElementById("gamedlg");if(d)return d;
 d=document.createElement("dialog");d.id="gamedlg";d.setAttribute("aria-label","Game");d.innerHTML='<div class="sheet gsheet" id="gamesheet"></div>';document.body.appendChild(d);
 d.addEventListener("click",e=>{if(e.target===d){d.close();return}const b=e.target.closest("[data-gtab],[data-gclose]");if(!b)return;
  if(b.dataset.gclose!==undefined){d.close();return}tab=b.dataset.gtab;draw()});
 d.addEventListener("close",()=>{clearInterval(timer);cur=null});return d}
const mine=()=>{try{return window.gameMine?window.gameMine():new Set()}catch(e){return new Set()}};
function head(j){const c=((j.header||{}).competitions||[])[0]||{},st=((c.status||{}).type)||{},T=k=>(c.competitors||[]).find(x=>x.homeAway===k)||{};
 const side=k=>{const t=T(k),tm=t.team||{},logo=(tm.logos&&tm.logos[0]&&tm.logos[0].href)||tm.logo||"";
  return `<div class="gt">${logo?`<img src="${esc(logo)}" alt="" loading="lazy">`:""}<b>${esc(tm.abbreviation||tm.shortDisplayName||"")}</b><small>${esc(tm.shortDisplayName||tm.displayName||"")}${t.record&&t.record[0]?` · ${esc(t.record[0].summary||"")}`:""}</small></div>`};
 const sc=k=>T(k).score!=null&&st.state!=="pre"?esc(T(k).score):"";
 const when=st.state==="pre"&&c.date?new Date(c.date).toLocaleString([],{weekday:"short",hour:"numeric",minute:"2-digit"}):"";
 return `<div class="ghead">${side("away")}<div class="gsc"><b>${sc("away")}</b><span class="${st.state==="in"?"live":""}">${st.state==="in"?"<i></i>":""}${esc(when||st.shortDetail||st.detail||"")}</span><b>${sc("home")}</b></div>${side("home")}</div>`}
function teamStats(j){const T=((j.boxscore||{}).teams)||[];if(T.length<2)return"";const a=T[0],h=T[1],hv={};
 for(const s of h.statistics||[])hv[s.name||s.label]=s;
 const rows=(a.statistics||[]).map(s=>{const o=hv[s.name||s.label];if(!o)return"";const av=parseFloat(String(s.displayValue).replace(/[^0-9.\-]/g,"")),bv=parseFloat(String(o.displayValue).replace(/[^0-9.\-]/g,""));
  const tot=Math.abs(av)+Math.abs(bv),w=tot&&isFinite(av)&&isFinite(bv)?Math.abs(av)/tot*100:50;
  return `<div class="gstat"><b>${esc(s.displayValue)}</b><span>${esc(s.label||s.name)}</span><b>${esc(o.displayValue)}</b><i><em style="width:${w.toFixed(0)}%"></em></i></div>`}).filter(Boolean).slice(0,14);
 return rows.length?`<div class="gstats"><div class="gstat gh"><b>${esc((a.team||{}).abbreviation)}</b><span></span><b>${esc((h.team||{}).abbreviation)}</b></div>${rows.join("")}</div>`:""}
function players(j){const P=((j.boxscore||{}).players)||[];if(!P.length)return"";const M=mine();
 return P.map(t=>`<h4 class="rp-h">${esc((t.team||{}).displayName||(t.team||{}).abbreviation||"")}</h4>${(t.statistics||[]).map(cat=>{
  const L=cat.labels||[],keep=cat.name==="passing"?["C/ATT","YDS","TD","INT"]:cat.name==="rushing"?["CAR","YDS","TD","LONG"]:cat.name==="receiving"?["REC","YDS","TD","TGTS"]:L.includes("PTS")?["MIN","PTS","REB","AST","3PT"]:L.slice(0,4);
  const idx=keep.map(k=>L.indexOf(k)).filter(i=>i>=0);if(!idx.length)return"";
  let A=(cat.athletes||[]).filter(a=>!a.didNotPlay&&a.stats&&a.stats.length);if(L.includes("PTS")){const pi=L.indexOf("PTS");A=A.sort((x,y)=>(+y.stats[pi]||0)-(+x.stats[pi]||0))}
  A=A.slice(0,cat.name?6:10);if(!A.length)return"";
  return `<table class="gbox"><tr><th>${esc(cat.name?cat.name[0].toUpperCase()+cat.name.slice(1):"Players")}</th>${idx.map(i=>`<th>${esc(L[i])}</th>`).join("")}</tr>
   ${A.map(a=>{const n=(a.athlete||{}).displayName||"",me=M.has(window.Live?Live.nm(n):n.toLowerCase());return `<tr class="${me?"me":""}"><td>${me?"★ ":""}${esc((a.athlete||{}).shortName||n)}</td>${idx.map(i=>`<td>${esc(a.stats[i])}</td>`).join("")}</tr>`}).join("")}</table>`}).join("")}`).join("")}
function plays(j){let L=[];
 if(Array.isArray(j.plays)&&j.plays.length)L=j.plays.map(p=>({t:p.text,q:(p.period||{}).number,c:(p.clock||{}).displayValue,s:p.scoringPlay,sc:p.awayScore!=null?`${p.awayScore}-${p.homeScore}`:""}));
 else if(j.drives){const D=[...((j.drives.previous)||[]),...(j.drives.current?[j.drives.current]:[])];for(const d of D)for(const p of d.plays||[])L.push({t:p.text,q:(p.period||{}).number,c:(p.clock||{}).displayValue,s:p.scoringPlay,sc:p.awayScore!=null?`${p.awayScore}-${p.homeScore}`:"",dr:(d.team||{}).abbreviation})}
 L=L.filter(p=>p.t).slice(-40).reverse();if(!L.length)return `<p class="fine">Plays show up here once the game starts.</p>`;
 return `<div class="gplays">${L.map(p=>`<div class="${p.s?"sc":""}"><span>${p.q?`Q${p.q} `:""}${esc(p.c||"")}${p.dr?` · ${esc(p.dr)}`:""}${p.s&&p.sc?` · ${esc(p.sc)}`:""}</span>${esc(p.t)}</div>`).join("")}</div>`}
function pregame(j){const out=[];const L=j.leaders||[];
 if(L.length)out.push(`<h4 class="rp-h">Season leaders</h4>`+L.map(t=>`<div class="glead"><b>${esc((t.team||{}).abbreviation||"")}</b>${(t.leaders||[]).slice(0,3).map(c=>{const x=(c.leaders||[])[0];return x?`<span>${esc(c.displayName||c.name)}: <b>${esc((x.athlete||{}).shortName||(x.athlete||{}).displayName||"")}</b> ${esc(x.displayValue||"")}</span>`:""}).join("")}</div>`).join(""));
 const I=(j.injuries||[]).map(t=>({tm:(t.team||{}).abbreviation,L:(t.injuries||[]).filter(i=>/out|doubtful|questionable/i.test(i.status||""))})).filter(t=>t.L.length);
 if(I.length)out.push(`<h4 class="rp-h">Injuries</h4>`+I.map(t=>`<div class="glead"><b>${esc(t.tm)}</b>${t.L.slice(0,8).map(i=>`<span>${esc((i.athlete||{}).displayName||"")} <em>${esc(i.status)}</em></span>`).join("")}</div>`).join(""));
 return out.join("")||`<p class="fine">More shows up here closer to game time.</p>`}
function draw(){if(!cur)return;const el=document.getElementById("gamesheet"),j=cur.j;
 if(!j){el.innerHTML=`<div class="ghead"><div class="gsc"><span>${esc(cur.err?"Couldn't reach ESPN for this game. Try again in a minute.":"Loading the game…")}</span></div></div><div class="btns"><button class="btn" data-gclose>Close</button></div>`;return}
 const st=((((j.header||{}).competitions||[])[0]||{}).status||{}).type||{},pre=st.state==="pre";
 const tabs=pre?[["pre","Preview"]]:[["stats","Team stats"],["players","Players"],["plays","Play-by-play"]];if(!tabs.some(t=>t[0]===tab))tab=tabs[0][0];
 el.innerHTML=`${head(j)}<div class="filters">${tabs.map(([k,l])=>`<button class="pill ${tab===k?"on":""}" data-gtab="${k}">${l}</button>`).join("")}</div>
  <div class="gbody">${tab==="pre"?pregame(j):tab==="stats"?(teamStats(j)||`<p class="fine">Team stats show up once the game starts.</p>`):tab==="players"?(players(j)||`<p class="fine">No player numbers yet.</p>`):plays(j)}</div>
  <p class="fine">From ESPN${st.state==="in"?", updating every 30 seconds":""}. ★ marks players on your open tickets.</p><div class="btns"><button class="btn" data-gclose>Close</button></div>`}
async function load(force){if(!cur||!window.Live)return;try{cur.j=await Live.raw(cur.sp,cur.eid,force?0:15000);cur.err=false}catch(e){cur.err=true}draw()}
function open(sp,eid){const d=dlg();cur={sp,eid,j:null};tab="stats";draw();if(!d.open)d.showModal();load(true);
 clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&cur&&cur.j){const st=((((cur.j.header||{}).competitions||[])[0]||{}).status||{}).type||{};if(st.state==="in")load(true)}},30000)}
document.addEventListener("click",e=>{const b=e.target.closest("[data-game]");if(!b)return;const[sp,eid]=b.dataset.game.split("|");if(sp&&eid)open(sp,eid)});
return{open}})();
