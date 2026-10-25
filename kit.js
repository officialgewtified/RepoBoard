/* Kit: backup and restore for all three sites, and the win celebration. Shared by Gridline, Baseline and Crossover. */
window.Kit=(function(){
"use strict";
const KEEP=/^(pb_|bl_|cx_|arena_)/;          // everything the three sites save on this phone (they share it)
const RM=matchMedia("(prefers-reduced-motion: reduce)");
function snapshot(){const data={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(KEEP.test(k))data[k]=localStorage.getItem(k)}}catch(e){}return data}
return{
 /* save a backup file: on a phone the share menu offers Save to Files; elsewhere it downloads */
 backup(btn){const data=snapshot(),n=Object.keys(data).length,day=new Date().toLocaleDateString("en-CA");
  const blob=new Blob([JSON.stringify({app:"RepoBoard",v:1,at:new Date().toISOString(),data},null,1)],{type:"application/json"});
  const name=`picks-backup-${day}.json`,file=new File([blob],name,{type:"application/json"});
  let can=false;try{can=!!(navigator.canShare&&navigator.canShare({files:[file]}))}catch(e){}
  if(can){navigator.share({files:[file],title:"Picks backup"}).catch(()=>{});}
  else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},3000)}
  if(btn){const t=btn.textContent;btn.textContent=`Saved ${n} items`;setTimeout(()=>{btn.textContent=t},2200)}},
 /* read a backup file back in, after asking; replaces what's on this phone */
 restore(){const inp=document.createElement("input");inp.type="file";inp.accept=".json,application/json";
  inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;const rd=new FileReader();
   rd.onload=()=>{let j;try{j=JSON.parse(rd.result)}catch(e){alert("That file isn't a picks backup.");return}
    if(!j||j.app!=="RepoBoard"||!j.data||typeof j.data!=="object"){alert("That file isn't a picks backup.");return}
    const keys=Object.keys(j.data).filter(k=>KEEP.test(k));if(!keys.length){alert("That backup is empty.");return}
    const when=j.at?new Date(j.at).toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"an earlier day";
    if(!confirm(`Restore your tickets, slips and settings from ${when}? This replaces what's saved on this phone for all three sites.`))return;
    try{const old=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(KEEP.test(k))old.push(k)}old.forEach(k=>localStorage.removeItem(k));
     keys.forEach(k=>localStorage.setItem(k,String(j.data[k])))}catch(e){alert("Couldn't restore: this phone's storage is full or blocked.");return}
    location.reload()};
   rd.readAsText(f)};
  inp.click()},
 /* confetti in the site's colors and a banner, once per win */
 cheer(text,sub){const doc=document.documentElement,css=getComputedStyle(doc),led=css.getPropertyValue("--led").trim()||"#ffb420",go=css.getPropertyValue("--go").trim()||"#35e2a0";
  if(navigator.vibrate&&(!navigator.userActivation||navigator.userActivation.hasBeenActive)){try{navigator.vibrate([18,50,18,50,40])}catch(e){}}
  const wrap=document.createElement("div");wrap.className="kit-cheer";wrap.setAttribute("role","status");
  wrap.innerHTML=`<div class="kit-ban"><b>${text}</b>${sub?`<small>${sub}</small>`:""}</div>`;
  if(!RM.matches){const cols=[led,go,"#ffffff",led,"#ffe08a"];for(let i=0;i<90;i++){const p=document.createElement("i"),w=6+Math.random()*7;
   p.style.cssText=`left:${Math.random()*100}vw;width:${w}px;height:${w*(.4+Math.random()*.9)}px;background:${cols[i%cols.length]};--x:${(Math.random()*2-1)*120}px;--r:${Math.random()*900-450}deg;animation-delay:${Math.random()*.35}s;animation-duration:${1.6+Math.random()*1.2}s`;
   wrap.appendChild(p)}}
  document.body.appendChild(wrap);wrap.addEventListener("click",()=>wrap.remove());setTimeout(()=>wrap.remove(),3600)}
}})();
