/* Share a slip as a picture, on Gridline, Baseline and Crossover.
   The picture is built first and shown in a sheet with Share, Save image and Copy as text.
   Sharing then happens on its own tap, because iPhones only open the share menu straight from a tap,
   and building the picture takes longer than that allows. */
(function(){
"use strict";
const money=v=>"$"+(+v||0).toFixed(2);
function cut(x,X,Y,w,h,c){x.beginPath();x.moveTo(X+c,Y);x.lineTo(X+w,Y);x.lineTo(X+w,Y+h-c);x.lineTo(X+w-c,Y+h);x.lineTo(X,Y+h);x.lineTo(X,Y+c);x.closePath()}
function wrap(x,text,maxW){const out=[];let line="";for(const w of String(text).split(" ")){const t=line?line+" "+w:w;if(x.measureText(t).width>maxW&&line){out.push(line);line=w}else line=t}if(line)out.push(line);return out}

async function build(o){
 const led=o.led||"#ffb420",n=o.rows.length,W=1080,rowH=168,gap=18,hasMoney=+o.entry>0;
 const cv=document.createElement("canvas"),x=cv.getContext("2d");
 try{await Promise.all([document.fonts.load('italic 900 80px Archivo'),document.fonts.load('800 40px Archivo'),document.fonts.load('500 30px Archivo')])}catch(e){}
 const font=(f,stretch)=>{x.font=f+' Archivo, system-ui, sans-serif';try{x.fontStretch=stretch||"normal"}catch(e){}};
 font("500 26px");const recLines=o.record?wrap(x,o.record,W-128):[];
 const H=300+n*(rowH+gap)+190+recLines.length*36+150;cv.width=W;cv.height=H;
 font("500 26px");   // resizing the canvas resets the font
 // night background with the sport's light
 let g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,"#0e192b");g.addColorStop(1,"#070d18");x.fillStyle=g;x.fillRect(0,0,W,H);
 const rg=x.createRadialGradient(W*.22,120,0,W*.22,120,W*.75);rg.addColorStop(0,led+"55");rg.addColorStop(1,led+"00");x.fillStyle=rg;x.fillRect(0,0,W,H);
 x.fillStyle=led;x.fillRect(0,0,W,10);
 // name, date and play
 font("italic 900 92px","condensed");x.fillStyle=led;x.shadowColor=led;x.shadowBlur=30;x.fillText(o.site.toUpperCase(),64,140);x.shadowBlur=0;
 x.textAlign="right";x.fillStyle="#8999b6";font("600 28px");x.fillText(new Date().toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"}),W-64,136);x.textAlign="left";
 x.fillStyle="#f1f4fa";font("italic 900 62px","condensed");x.fillText(o.head,64,226);
 x.fillStyle=led;x.beginPath();x.moveTo(64,252);x.lineTo(150,252);x.lineTo(144,264);x.lineTo(58,264);x.closePath();x.fill();
 // picks
 let y=300;for(const r of o.rows){cut(x,64,y,W-128,rowH,22);x.fillStyle="#17253d";x.fill();
  x.fillStyle=led;x.fillRect(64,y+22,6,rowH-44);
  x.fillStyle="#f1f4fa";font("800 46px","semi-condensed");x.fillText(r.a,100,y+62,W-430);
  x.fillStyle=led;font("700 34px");x.fillText(r.b,100,y+108,W-430);
  x.fillStyle="#8999b6";font("500 28px");x.fillText(r.c||"",100,y+146,W-430);
  if(r.p!=null){x.textAlign="right";x.fillStyle="#f1f4fa";font("italic 900 74px","condensed");x.fillText(Math.round(r.p*100)+"%",W-104,y+104);
   x.fillStyle="#8999b6";font("600 24px");x.fillText(o.chanceLabel||"chance",W-104,y+140);x.textAlign="left"}
  y+=rowH+gap}
 // money
 const box=(bx,bw,label,val)=>{cut(x,bx,y+10,bw,150,18);x.fillStyle="#0e192b";x.fill();x.strokeStyle="#24375a";x.lineWidth=2;x.stroke();
  x.fillStyle="#8999b6";font("600 26px");x.fillText(label,bx+28,y+56);x.fillStyle="#f1f4fa";font("italic 900 64px","condensed");x.fillText(val,bx+28,y+128,bw-56)};
 if(hasMoney){box(64,300,"Entry",money(o.entry));box(390,300,"Pays",money(o.pays));box(716,300,"Odds",o.odds)}
 else box(64,W-128,"Pays",o.odds);
 y+=190;
 x.fillStyle="#b4c0d6";font("500 26px");for(const l of recLines){x.fillText(l,64,y+20);y+=36}
 x.fillStyle="#56657f";font("600 24px");x.fillText(o.url||location.host,64,H-92,W-128);
 font("500 22px");x.fillText("Chances are estimates, not guarantees. 21+ where legal. Gambling problem? Call 1-800-GAMBLER.",64,H-48,W-128);
 return await new Promise(r=>cv.toBlob(r,"image/png"))}

function sheet(){let d=document.getElementById("sharedlg");
 if(!d){d=document.createElement("dialog");d.id="sharedlg";d.setAttribute("aria-label","Share your slip");document.body.appendChild(d);
  d.addEventListener("close",()=>{if(d._url){URL.revokeObjectURL(d._url);d._url=null}d.innerHTML=""})}
 return d}
function copy(text,b){const done=()=>{const t=b.textContent;b.textContent="Copied";setTimeout(()=>{b.textContent=t},1300)};
 if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,()=>prompt("Copy this:",text));else prompt("Copy this:",text)}

/* o: {site, head, rows:[{a,b,c,p}], entry, pays, odds, led, chanceLabel, record, url, text, file} */
window.shareSlipImage=async function(o,btn){
 if(!o||!o.rows||!o.rows.length)return;
 const label=btn&&btn.textContent;if(btn){btn.textContent="Making image…";btn.disabled=true}
 let blob=null;try{blob=await build(o)}catch(e){blob=null}finally{if(btn){btn.textContent=label;btn.disabled=false}}
 if(!blob){if(o.text&&btn)copy(o.text,btn);return}
 const name=o.file||"slip.png",file=new File([blob],name,{type:"image/png"}),d=sheet();
 if(d._url)URL.revokeObjectURL(d._url);const url=d._url=URL.createObjectURL(blob);
 let canShare=false;try{canShare=!!(navigator.canShare&&navigator.canShare({files:[file]}))}catch(e){}
 d.innerHTML=`<div class="shr"><img src="${url}" alt="Your slip as a picture">
  <p class="shr-t">${canShare?"Tap Share, then Save Image to put it in your Photos, or send it straight to a chat.":"Save the picture, then send it from your photos."}</p>
  <div class="shr-b">${canShare?'<button class="btn go" data-shr="share">Share</button>':`<a class="btn go" href="${url}" download="${name}">Save image</a>`}
  ${o.text?'<button class="btn" data-shr="copy">Copy as text</button>':""}<button class="btn" data-shr="close">Done</button></div></div>`;
 d.onclick=async e=>{if(e.target===d){d.close();return}const b=e.target.closest("[data-shr]");if(!b)return;const k=b.dataset.shr;
  if(k==="close")d.close();
  else if(k==="copy")copy(o.text,b);
  else if(k==="share"){try{await navigator.share({files:[file],title:o.site+" slip"})}   // the picture alone, so phones offer Save Image
   catch(err){if(err&&err.name!=="AbortError")b.textContent="Use Save image"}}};
 if(!d.open)d.showModal()};
})();
