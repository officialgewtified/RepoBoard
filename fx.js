/* Arena FX: touch light, pops, sparks, the sliding tab highlight, scoreboard count-ups,
   the slip's slide-up and ticket print, and one light-up when a tab opens.
   Shared by Gridline, Baseline and Crossover. It only watches the page; it never changes what a page does. */
(function(){
"use strict";
const RM=matchMedia("(prefers-reduced-motion: reduce)"),doc=document.documentElement;
const t=document.title.toLowerCase();doc.dataset.sport=t.includes("baseline")?"bb":t.includes("crossover")?"x":"fb";
const layer=document.createElement("div");layer.id="fx";layer.setAttribute("aria-hidden","true");document.body.appendChild(layer);
document.addEventListener("touchstart",()=>{},{passive:true});   // lets :active press states show on iPhone
const where=el=>el.closest("dialog[open]")||layer;               // inside an open sheet, draw on the sheet's layer
const fx=()=>!RM.matches;

/* ---------- a soft light spreads from where you touch ---------- */
const TAP="button,.pill,a.iconbtn,.checks label";
document.addEventListener("pointerdown",e=>{
 const el=e.target.closest(TAP);if(!el||el.disabled)return;
 if(navigator.vibrate&&e.pointerType==="touch"){try{navigator.vibrate(6)}catch(_){}}
 if(!fx())return;
 const r=el.getBoundingClientRect();if(r.width<4||r.height<4)return;
 const w=document.createElement("div");w.className="fx-ripple";
 Object.assign(w.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px",borderRadius:getComputedStyle(el).borderRadius});
 const d=2*Math.hypot(Math.max(e.clientX-r.left,r.right-e.clientX),Math.max(e.clientY-r.top,r.bottom-e.clientY)),i=document.createElement("i");
 Object.assign(i.style,{width:d+"px",height:d+"px",left:(e.clientX-r.left-d/2)+"px",top:(e.clientY-r.top-d/2)+"px"});
 w.appendChild(i);where(el).appendChild(w);setTimeout(()=>w.remove(),700)},{passive:true});

/* ---------- picking something pops it; adding a pick throws sparks ---------- */
function pop(el){el.classList.remove("fx-pop");void el.offsetWidth;el.classList.add("fx-pop");el.addEventListener("animationend",()=>el.classList.remove("fx-pop"),{once:true})}
function burst(el){const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,host=where(el),sp=doc.dataset.sport;
 const ring=document.createElement("div");ring.className="fx-ring";
 Object.assign(ring.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px",borderRadius:getComputedStyle(el).borderRadius});
 host.appendChild(ring);setTimeout(()=>ring.remove(),600);
 const n=20;for(let k=0;k<n;k++){const s=document.createElement("i"),a=(k/n)*Math.PI*2+Math.random()*.4,dist=44+Math.random()*56;
  const kind=k%4===0?"w":sp==="fb"?"fb":sp==="bb"?"bb":(k%2?"fb":"bb");
  s.className="fx-spark "+kind;
  s.style.cssText=`left:${cx}px;top:${cy}px;--dx:${Math.cos(a)*dist}px;--dy:${Math.sin(a)*dist}px;--rot:${Math.round(Math.random()*540-270)}deg;animation-duration:${.55+Math.random()*.35}s`;
  host.appendChild(s);setTimeout(()=>s.remove(),900)}}
const ATTRS=["data-pp","data-pick","data-sport","data-tab","data-plmode","data-stat","data-ppmode","data-ltside","data-ltkind","data-ltmode","data-ltres",
 "data-th","data-formw","data-matchw","data-day","data-ckmk","data-ckpick","data-useml","data-usepp","data-save","data-copy","data-copyall","data-scanpp","data-scanml"];
const isOn=el=>el.classList.contains("on")||el.getAttribute("aria-pressed")==="true";
let enterNext=false;
document.addEventListener("click",e=>{
 const el=e.target.closest("button");if(!el)return;
 const attr=ATTRS.find(a=>el.hasAttribute(a)),val=attr&&el.getAttribute(attr),was=isOn(el),r0=el.getBoundingClientRect();
 if(attr==="data-tab"||attr==="data-sport"||attr==="data-plmode"||attr==="data-stat")enterNext=true;
 if(el.closest(".mark"))return;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(!fx())return;
  // the page usually redraws on a tap, so find the same button again, nearest to where it was
  let now=document.contains(el)?el:null;
  if(!now&&attr){let best=1e9;document.querySelectorAll(`[${attr}="${CSS.escape(val)}"]`).forEach(n=>{const r=n.getBoundingClientRect();
   if(!r.width)return;const d=Math.abs(r.top-r0.top)+Math.abs(r.left-r0.left);if(d<best){best=d;now=n}})}
  if(!now)return;
  if(isOn(now)&&!was){pop(now);if(attr==="data-pp"||attr==="data-pick")burst(now)}
  else if(attr==="data-save"||attr==="data-copy"||attr==="data-copyall"||attr==="data-useml"||attr==="data-usepp"){pop(now);burst(now)}
  else if(attr==="data-tab"||attr==="data-sport")pop(now)}))},true);

/* ---------- the ball in the name spins when tapped ---------- */
document.addEventListener("click",e=>{const b=e.target.closest(".mark .bars");if(!b||!fx())return;
 b.classList.remove("fx-spin");void b.getBoundingClientRect();b.classList.add("fx-spin");b.addEventListener("animationend",()=>b.classList.remove("fx-spin"),{once:true})});

/* ---------- the tab highlight slides ---------- */
function placeInd(){document.querySelectorAll(".seg").forEach(seg=>{const on=seg.querySelector("button.on");if(!on)return;
 let ind=seg.querySelector(".fx-ind");const first=!ind;if(!ind){ind=document.createElement("span");ind.className="fx-ind";seg.prepend(ind);if(!seg.classList.contains("fx-has-ind"))seg.classList.add("fx-has-ind")}
 if(first)ind.style.transition="none";
 Object.assign(ind.style,{left:on.offsetLeft+"px",top:on.offsetTop+"px",width:on.offsetWidth+"px",height:on.offsetHeight+"px"});
 if(first){void ind.offsetWidth;ind.style.transition=""}})}
addEventListener("resize",placeInd);
document.querySelectorAll(".seg").forEach(s=>new MutationObserver(placeInd).observe(s,{subtree:true,attributes:true,attributeFilter:["class"]}));

/* ---------- scoreboard numbers count up when a tab opens ---------- */
function countUp(root){root.querySelectorAll(".rchd b,.hero .ev,.stat b,.pct,.recrow b,.side-b b").forEach(el=>{
 if(el.children.length)return;const m=/^([+−-]?)(\d+(?:\.\d+)?)(%|x)$/.exec(el.textContent.trim());if(!m)return;
 const to=+m[2],dp=(m[2].split(".")[1]||"").length,t0=performance.now(),D=750;
 const step=now=>{if(!el.isConnected)return;const k=Math.min(1,(now-t0)/D),v=to*(1-Math.pow(1-k,3));el.textContent=m[1]+v.toFixed(dp)+m[3];if(k<1)requestAnimationFrame(step)};
 el.textContent=m[1]+(0).toFixed(dp)+m[3];requestAnimationFrame(step)})}

/* ---------- one light-up when a page or tab opens ---------- */
const view=document.getElementById("view");let opened=false,enterAt=0,enterTimer=0;
function mark(){let i=0;for(const c of view.children){c.style.setProperty("--i",i++);
  for(const box of c.matches(".list,.res")?[c]:c.querySelectorAll(":scope > .list,:scope > .res"))[...box.children].forEach((x,j)=>x.style.setProperty("--i",i+j))}}
if(view)new MutationObserver(()=>{
 const loading=!!view.querySelector(".fx-sk");
 if(!fx()||loading||!view.children.length){placeInd();return}
 const fresh=!opened||enterNext;
 if(fresh){opened=true;enterNext=false;enterAt=performance.now();view.style.setProperty("--el","0ms");view.classList.add("fx-enter");mark();countUp(view);
  clearTimeout(enterTimer);enterTimer=setTimeout(()=>view.classList.remove("fx-enter"),1300)}
 else if(view.classList.contains("fx-enter")){view.style.setProperty("--el",Math.round(performance.now()-enterAt)+"ms");mark()}   // redrawn mid light-up: carry on, don't restart
 placeInd()}).observe(view,{childList:true});

/* ---------- the slip: slides up, its number ticks, the ticket prints ---------- */
const slip=document.getElementById("slip"),slipin=document.getElementById("slipin");
if(slip&&slipin){let had=false,lastK="",lastO="";
 new MutationObserver(()=>{const bar=slipin.querySelector(".sbar");
  if(!bar){had=false;lastK="";return}
  const k=(bar.querySelector(".k")||{}).textContent||"",o=bar.querySelector(".o");
  if(fx()){if(!had)bar.classList.add("fx-in");else if(k!==lastK&&o)o.classList.add("fx-tick")}
  had=true;lastK=k;lastO=o?o.textContent:""}).observe(slipin,{childList:true});
 let wasOpen=slip.classList.contains("open");
 new MutationObserver(()=>{const open=slip.classList.contains("open");
  if(open&&!wasOpen&&fx()){const rc=slip.querySelector(".receipt");if(rc){rc.classList.remove("fx-print");void rc.offsetWidth;rc.classList.add("fx-print")}}
  wasOpen=open}).observe(slip,{attributes:true,attributeFilter:["class"]});}
placeInd();
})();
