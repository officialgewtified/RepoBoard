/* Broadcast FX: touch light, pops, sparks, the sliding tab plate, scoreboard count-ups,
   the slip's slide-up and ticket print, and one quick light-up when a tab opens.
   Shared by Gridline, Baseline and Crossover. It only watches the page; it never changes what a page does. */
(function(){
"use strict";
const RM=matchMedia("(prefers-reduced-motion: reduce)"),doc=document.documentElement;
if(!doc.dataset.sport){const t=document.title.toLowerCase();doc.dataset.sport=t.includes("baseline")?"bb":t.includes("crossover")?"x":"fb"}
const layer=document.createElement("div");layer.id="fx";layer.setAttribute("aria-hidden","true");document.body.appendChild(layer);
const host=el=>el.closest("dialog[open]")||layer;                // inside an open sheet, draw on the sheet
const fx=()=>!RM.matches;

/* ---------- switch between the three sites, from the top of any of them ---------- */
(function(){const brand=document.querySelector(".brand");if(!brand||document.querySelector(".net"))return;
 const sp=doc.dataset.sport,up=sp==="fb"?"":"../";
 const links=[["fb","Football",sp==="fb"?"./":up],["bb","Basketball",sp==="bb"?"./":up+"baseline/"],["x","Both",sp==="x"?"./":up+"crossover/"]];
 const nav=document.createElement("nav");nav.className="net";nav.setAttribute("aria-label","Sports");
 nav.innerHTML=links.map(([k,l,h])=>`<a class="${k}${k===sp?" on":""}" href="${h}"${k===sp?' aria-current="page"':""}><i aria-hidden="true"></i>${l}</a>`).join("");
 brand.prepend(nav)})();
function shapeOf(el,box){const cs=getComputedStyle(el);
 if(cs.clipPath&&cs.clipPath!=="none")box.style.clipPath=cs.clipPath;else box.style.borderRadius=cs.borderRadius}

/* ---------- a tap presses the button in and spreads a soft light from your finger ----------
   Nothing shows the moment a finger lands, because that's also how a scroll starts. The press shows
   after a short hold, or when the finger lifts without moving; moving the finger cancels it. */
const TAP="button,.pill,a.iconbtn,.net a,.checks label";
let press=null;
function ripple(el,px,py){if(!fx()||!el.isConnected)return;const r=el.getBoundingClientRect();if(r.width<4||r.height<4)return;
 const w=document.createElement("div");w.className="fx-ripple";
 Object.assign(w.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});shapeOf(el,w);
 const d=2*Math.hypot(Math.max(px-r.left,r.right-px),Math.max(py-r.top,r.bottom-py)),i=document.createElement("i");
 Object.assign(i.style,{width:d+"px",height:d+"px",left:(px-r.left-d/2)+"px",top:(py-r.top-d/2)+"px"});
 w.appendChild(i);host(el).appendChild(w);setTimeout(()=>w.remove(),650)}
function pressOn(p){if(p.shown)return;p.shown=true;p.el.classList.add("fx-press");ripple(p.el,p.x,p.y)}
function pressOff(p,cancel){clearTimeout(p.t);if(cancel){p.el.classList.remove("fx-press");return}
 setTimeout(()=>p.el.classList.remove("fx-press"),90)}
document.addEventListener("pointerdown",e=>{
 const el=e.target.closest(TAP);if(!el||el.disabled||e.button>0)return;
 const p=press={el,x:e.clientX,y:e.clientY,shown:false};p.t=setTimeout(()=>{if(press===p)pressOn(p)},110)},{passive:true});
document.addEventListener("pointermove",e=>{const p=press;if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>8){pressOff(p,true);press=null}},{passive:true});
document.addEventListener("pointercancel",()=>{if(press){pressOff(press,true);press=null}},{passive:true});
document.addEventListener("scroll",()=>{if(press){pressOff(press,true);press=null}},{passive:true,capture:true});
document.addEventListener("pointerup",e=>{const p=press;if(!p)return;press=null;
 if(navigator.vibrate&&e.pointerType==="touch"){try{navigator.vibrate(6)}catch(_){}}
 pressOn(p);pressOff(p,false)},{passive:true});

/* ---------- picking something pops it; adding a pick throws sparks ---------- */
function pop(el){el.classList.remove("fx-pop");void el.offsetWidth;el.classList.add("fx-pop");el.addEventListener("animationend",()=>el.classList.remove("fx-pop"),{once:true})}
function burst(el){const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,h=host(el),sp=doc.dataset.sport;
 const ring=document.createElement("div");ring.className="fx-ring";
 Object.assign(ring.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});shapeOf(el,ring);
 h.appendChild(ring);setTimeout(()=>ring.remove(),560);
 const n=20;for(let k=0;k<n;k++){const s=document.createElement("i"),a=(k/n)*Math.PI*2+Math.random()*.4,dist=44+Math.random()*56;
  const kind=k%4===0?"w":sp==="fb"?"fb":sp==="bb"?"bb":(k%2?"fb":"bb");
  s.className="fx-spark "+kind;
  s.style.cssText=`left:${cx}px;top:${cy}px;--dx:${Math.cos(a)*dist}px;--dy:${Math.sin(a)*dist}px;--rot:${Math.round(Math.random()*540-270)}deg;animation-duration:${.55+Math.random()*.35}s`;
  h.appendChild(s);setTimeout(()=>s.remove(),950)}}
const ATTRS=["data-pp","data-pick","data-sport","data-tab","data-plmode","data-stat","data-ppmode","data-ltside","data-ltkind","data-ltmode","data-ltres",
 "data-th","data-formw","data-matchw","data-day","data-ckmk","data-ckpick","data-useml","data-usepp","data-save","data-copy","data-copyall","data-scanpp","data-scanml",
 "data-gaponly","data-agreeonly","data-share","data-limitsave","data-xp","data-xslip","data-xcopyall","data-xmode","data-xsave"];
const OPENS=["data-tab","data-sport","data-plmode","data-stat"];
const isOn=el=>el.classList.contains("on")||el.getAttribute("aria-pressed")==="true";
let enterNext=false;
document.addEventListener("click",e=>{
 const el=e.target.closest("button");if(!el)return;
 const attr=ATTRS.find(a=>el.hasAttribute(a)),val=attr&&el.getAttribute(attr),was=isOn(el),r0=el.getBoundingClientRect();
 if(OPENS.includes(attr)&&!was)enterNext=true;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  enterNext=false;
  if(!fx()||!attr)return;
  // the page usually redraws on a tap, so find the same button again, nearest to where it was
  let now=document.contains(el)?el:null;
  if(!now){let best=1e9;document.querySelectorAll(`[${attr}="${CSS.escape(val)}"]`).forEach(n=>{const r=n.getBoundingClientRect();
   if(!r.width)return;const d=Math.abs(r.top-r0.top)+Math.abs(r.left-r0.left);if(d<best){best=d;now=n}})}
  if(!now)return;
  if(isOn(now)&&!was){pop(now);if(attr==="data-pp"||attr==="data-pick"||attr==="data-xp")burst(now)}
  else if(["data-save","data-copy","data-copyall","data-useml","data-usepp","data-share","data-limitsave","data-xslip","data-xcopyall","data-xsave"].includes(attr)){pop(now);burst(now)}}))},true);

/* ---------- the ball in the name spins when tapped ---------- */
document.addEventListener("click",e=>{const b=e.target.closest(".mark .bars");if(!b||!fx())return;
 b.classList.remove("fx-spin");void b.getBoundingClientRect();b.classList.add("fx-spin");b.addEventListener("animationend",()=>b.classList.remove("fx-spin"),{once:true})});

/* ---------- the tab plate slides ---------- */
function placeInd(){document.querySelectorAll(".seg").forEach(seg=>{const on=seg.querySelector("button.on");if(!on)return;
 let ind=seg.querySelector(".fx-ind");const first=!ind;
 if(first){ind=document.createElement("span");ind.className="fx-ind";seg.prepend(ind);ind.style.transition="none"}
 const L=on.offsetLeft+"px",W=on.offsetWidth+"px";
 if(ind.style.left!==L||ind.style.width!==W)Object.assign(ind.style,{left:L,top:on.offsetTop+"px",width:W,height:on.offsetHeight+"px"});
 if(first){void ind.offsetWidth;ind.style.transition="";seg.classList.add("fx-has-ind")}})}
addEventListener("resize",placeInd);
document.querySelectorAll(".seg").forEach(s=>new MutationObserver(placeInd).observe(s,{subtree:true,attributes:true,attributeFilter:["class"]}));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(placeInd);

/* ---------- headline numbers count up like a scoreboard when a tab opens ---------- */
function countUp(root){root.querySelectorAll(".rchd b,.hero .ev,.hero .stat b,.rcard .stat b").forEach(el=>{
 if(el.children.length)return;const m=/^([+−-]?)(\d+(?:\.\d+)?)(%|x)$/.exec(el.textContent.trim());if(!m)return;
 const to=+m[2],dp=(m[2].split(".")[1]||"").length,t0=performance.now(),D=650;
 const step=now=>{if(!el.isConnected)return;const k=Math.min(1,(now-t0)/D),v=to*(1-Math.pow(1-k,3));el.textContent=m[1]+v.toFixed(dp)+m[3];if(k<1)requestAnimationFrame(step)};
 el.textContent=m[1]+(0).toFixed(dp)+m[3];requestAnimationFrame(step)})}

/* ---------- one quick light-up when a page or tab opens; any other redraw shows instantly ---------- */
const view=document.getElementById("view");let opened=false,enterTimer=0;
function mark(){let i=0;for(const c of view.children){c.style.setProperty("--i",i++);
  for(const box of c.matches(".list,.res")?[c]:c.querySelectorAll(":scope > .list,:scope > .res"))[...box.children].forEach((x,j)=>x.style.setProperty("--i",i+j))}}
if(view)new MutationObserver(()=>{
 placeInd();
 if(!fx()||!view.children.length||view.querySelector(".fx-sk"))return;
 if(!opened||enterNext){opened=true;enterNext=false;view.classList.remove("fx-enter");void view.offsetWidth;mark();view.classList.add("fx-enter");countUp(view);
  clearTimeout(enterTimer);enterTimer=setTimeout(()=>view.classList.remove("fx-enter"),900)}
 else if(view.classList.contains("fx-enter")){view.classList.remove("fx-enter");clearTimeout(enterTimer)}}).observe(view,{childList:true});

/* ---------- the slip: slides up, its number ticks, the ticket prints ---------- */
const slip=document.getElementById("slip"),slipin=document.getElementById("slipin");
if(slip&&slipin){let had=false,lastK="";
 new MutationObserver(()=>{const bar=slipin.querySelector(".sbar");
  if(!bar){had=false;lastK="";return}
  const k=(bar.querySelector(".k")||{}).textContent||"",o=bar.querySelector(".o");
  if(fx()){if(!had)bar.classList.add("fx-in");else if(k!==lastK&&o)o.classList.add("fx-tick")}
  had=true;lastK=k}).observe(slipin,{childList:true});
 let wasOpen=slip.classList.contains("open");
 new MutationObserver(()=>{const open=slip.classList.contains("open");
  if(open&&!wasOpen&&fx()){const rc=slip.querySelector(".receipt");if(rc){rc.classList.remove("fx-print");void rc.offsetWidth;rc.classList.add("fx-print")}}
  wasOpen=open}).observe(slip,{attributes:true,attributeFilter:["class"]});}
placeInd();
})();
