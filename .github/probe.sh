#!/bin/bash
mkdir -p out
cat > /tmp/p.js <<'JS'
const j=async(u,o)=>{const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 (sky report)"}});const t=await r.text();try{return JSON.parse(t)}catch(e){return {status:r.status,text:t.slice(0,300)}}};
(async()=>{
 const cad=await j("https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B10&dist-max=0.05&diameter=true&fullname=true&sort=dist");
 console.log("CAD fields",JSON.stringify(cad.fields),"count",cad.count);(cad.data||[]).slice(0,6).forEach(r=>console.log(JSON.stringify(r)));
 const kp=await j("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json");console.log("KP",JSON.stringify(kp).slice(0,200),"...",JSON.stringify(kp.slice?kp.slice(-12):kp).slice(0,900));
 const fl=await j("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json");console.log("FLARES",Array.isArray(fl)?fl.length:0,JSON.stringify(Array.isArray(fl)?fl.slice(-3):fl).slice(0,600));
 const sc=await j("https://services.swpc.noaa.gov/products/noaa-scales.json");console.log("SCALES",JSON.stringify(sc).slice(0,500));
 const ll=await j("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6&mode=normal");console.log("LL count",ll.count,ll.status||"");(ll.results||[]).forEach(r=>console.log(JSON.stringify({n:r.name,net:r.net,st:r.status&&r.status.abbrev,prov:r.launch_service_provider&&r.launch_service_provider.name,pad:r.pad&&r.pad.name,loc:r.pad&&r.pad.location&&r.pad.location.name,mis:r.mission&&r.mission.description&&r.mission.description.slice(0,120),orbit:r.mission&&r.mission.orbit&&r.mission.orbit.abbrev,prob:r.probability})));
 for(const q of ["asteroid","aurora","solar flare sun","rocket launch","moon","earth from space station","galaxy"]){
  const s=await j(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=video&year_start=2015`);const it=(s.collection||{}).items||[];
  console.log("\nQ",q,"hits",(s.collection||{}).metadata&&s.collection.metadata.total_hits);
  for(const x of it.slice(0,4)){const d=x.data[0];console.log(" -",d.nasa_id,"|",d.title.slice(0,60),"|",d.center,"|",(d.secondary_creator||"").slice(0,40),"|",/©|copyright|courtesy/i.test(d.description||"")?"COPYRIGHT?":"", "|",(d.date_created||"").slice(0,10),"| kw:",(d.keywords||[]).slice(0,4).join(","))}
  if(it[0]){const m=await j(it[0].href);console.log("  files",JSON.stringify(m).slice(0,500))}
 }
 for(const u of ["https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg","https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg","https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg"]){const r=await fetch(u);console.log(u,r.status,r.headers.get("content-type"),r.headers.get("content-length"))}
})().catch(e=>console.log("ERR",e));
JS
node /tmp/p.js
