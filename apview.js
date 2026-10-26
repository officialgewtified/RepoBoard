/* The autopilot's results on the page: fake PrizePicks entries it places every day for each strategy and grades after
   the games (autopilot_sports.py writes autopilot.json). Shared by Gridline, Baseline and Crossover. */
window.APV=(function(){
"use strict";
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd=v=>(v<0?"-":"")+"$"+Math.abs(Math.round(v)).toLocaleString();
const pc=v=>v==null?"–":(v>0?"+":"")+Math.round(v*100)+"%";
function stats(A,k){const E=(A.entries||[]).filter(e=>e.s===k),G=E.filter(e=>e.res);
 const w=G.filter(e=>e.res==="won").length,l=G.filter(e=>e.res==="lost").length,rf=G.filter(e=>e.res==="refund").length;
 const staked=G.reduce((s,e)=>s+e.stake,0),paid=G.reduce((s,e)=>s+(e.paid||0),0),open=E.filter(e=>!e.res);
 return{w,l,rf,n:G.length,open:open.length,net:paid-staked,roi:staked?(paid-staked)/staked:null,value:A.strats[k].bank+open.reduce((s,e)=>s+e.stake,0)}}
const legTxt=l=>`${esc(l.pl)} <span>${l.side==="o"?"More":"Less"} ${esc(l.ln)} ${esc(l.stat)}</span>${l.r?` <em class="${l.r}">${l.r==="hit"?"✓":l.r==="miss"?"✕":"="}${l.act!=null?" "+esc(l.act):""}</em>`:""}`;
function board(A,title){if(!A||!A.v)return "";const K=Object.keys(A.strats);
 const rows=K.map(k=>[k,A.strats[k].name,stats(A,k)]).sort((a,b)=>b[2].net-a[2].net||a[0].localeCompare(b[0]));
 const any=(A.entries||[]).length,best=rows.find(r=>r[2].n>=1);
 let h=`<div class="card apc">${title?`<div class="apt">${esc(title)}</div>`:""}`;
 h+=rows.map(([k,n,s])=>`<div class="apr"><span class="apn"><b>${esc(n)}</b><small>${s.n?`${s.w}-${s.l}${s.rf?"-"+s.rf:""}`:"no results yet"}${s.open?` · ${s.open} waiting`:""}</small></span>
  <span class="apv"><b class="${s.value>A.start?"gold":s.value<A.start?"red":""}">${usd(s.value)}</b><small>${s.n?pc(s.roi)+" return":"of "+usd(A.start)}</small></span></div>`).join("");
 const open=(A.entries||[]).filter(e=>!e.res).slice(-6).reverse(),done=(A.entries||[]).filter(e=>e.res).slice(-6).reverse();
 if(open.length)h+=`<h4 class="aph">Waiting on games</h4>${open.map(e=>`<div class="ape"><div class="apeh"><b>${esc(A.strats[e.s].name)}</b><small>${esc(e.day)} · $${e.stake} to win $${e.stake*A.payout}</small></div>${e.legs.map(l=>`<div class="apl">${legTxt(l)}</div>`).join("")}</div>`).join("")}`;
 if(done.length)h+=`<h4 class="aph">Last results</h4>${done.map(e=>`<div class="ape ${e.res}"><div class="apeh"><b>${esc(A.strats[e.s].name)}</b><small>${esc(e.day)} · ${e.res==="won"?`won $${e.paid}`:e.res==="refund"?"refunded":"lost $"+e.stake}</small></div>${e.legs.map(l=>`<div class="apl">${legTxt(l)}</div>`).join("")}</div>`).join("")}`;
 if(!any)h+=`<p class="fine" style="margin:10px 0 0">Its first entries go in with the next overnight update.</p>`;
 return h+`</div>`}
/* boards: [{A, title}] */
function html(boards){const B=boards.filter(b=>b.A&&b.A.v);
 return `<h2>Autopilot</h2><p class="lede">Every day it places a fake $10 2-pick Power Play for each strategy and grades it after the games. Each strategy has its own fake $1,000, so you can see which one actually makes money without spending yours. A 2-pick Power Play pays 3x, so both picks have to hit about 58% of the time just to break even.</p>`+
  (B.length?B.map(b=>board(b.A,b.title)).join(""):`<div class="card empty">Its first entries go in with the next overnight update.</div>`)+
  `<p class="fine">"Random" picks lines and sides by chance: if a strategy can't beat it over a few weeks, it isn't real. A handful of entries is mostly luck.</p>`}
return{html,stats}})();
