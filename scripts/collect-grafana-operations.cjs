// Read-only collection of Cloud Lab's publicly shared Grafana LIVE panels.
// Node >=18, no AWS keys required. Data is saved locally and never pushed automatically.
const fs=require("node:fs"),path=require("node:path");
const host="https://zestyjungle807.grafana.net";
const token="15c00b34bed84915a1169bff946af122";
const base=host+"/api/public/dashboards/"+token;
const args=process.argv.slice(2);
const flag=(n,d)=>args.includes(n)?args[args.indexOf(n)+1]:d;
// --from/--to (ISO, 예: 2026-11-28T14:00:00+09:00): 드릴 회차 구간을 나중에 그대로 다시 뽑을 때. 없으면 지금부터 --minutes 전
const from=flag("--from"),to=flag("--to");
const end=to?Date.parse(to):Date.now(),start=from?Date.parse(from):end-Number(flag("--minutes","60"))*60000;
const minutes=Math.round((end-start)/60000);
if(!Number.isFinite(start)||!Number.isFinite(end)||minutes<5||minutes>240)throw Error("구간은 5 ~ 240분 (--minutes 또는 --from/--to ISO 시각)");
const stamp=new Date(end).toISOString().replace(/[.:]/g,"-");
const dest=path.resolve(flag("--out","load/results/grafana-operations-"+stamp));
const request=async(url,options={})=>{
 const r=await fetch(url,{...options,headers:{Accept:"application/json",...options.headers},signal:AbortSignal.timeout(25000)});
 const raw=await r.text();let data;
 try{data=JSON.parse(raw)}catch{data={message:raw.slice(0,200)}}
 if(!r.ok)throw Error("HTTP "+r.status+": "+(data.message||data.error||"request failed"));
 return data;
};
const leaf=(panels,out=[])=>{
 for(const p of panels||[]){
  if(p.type==="row"){
   if(/^0[78]\s*·/.test(p.title||""))continue;
   leaf(p.panels,out);
  } else if(p.id!=null&&(p.targets||[]).length)out.push({id:p.id,title:p.title||"",type:p.type});
 }
 return out;
};
const framesOf=data=>Object.values(data.results||data.data?.results||{}).flatMap(v=>v.frames||[]);
const seriesOf=frame=>{
 const fields=frame.schema?.fields||[],arrays=frame.data?.values||[];
 const tIdx=fields.findIndex(f=>f.type==="time"||/^time$/i.test(f.name||""));
 if(tIdx<0||!Array.isArray(arrays[tIdx]))return [];
 const all=[];
 for(let i=0;i<fields.length;i++){
  if(i===tIdx||!Array.isArray(arrays[i])||fields[i].type==="string")continue;
  const points=[];
  for(let k=0;k<Math.min(arrays[tIdx].length,arrays[i].length);k++){
   let t=Number(arrays[tIdx][k]);const v=arrays[i][k];
   if(!Number.isFinite(t)||!Number.isFinite(v))continue;
   if(t<1e11)t*=1000;
   if(t>=start&&t<=end)points.push([Math.round((t-start)/100)/10,v]);
  }
  if(points.length)all.push({field:fields[i].name||"value",labels:fields[i].labels||{},unit:fields[i].config?.unit||"",points});
 }
 return all;
};
(async()=>{
 const meta=await request(base);
 const dashboard=meta.dashboard||meta;
 const panels=leaf(dashboard.panels);
 if(args.includes("--list")){console.log(JSON.stringify({dashboard:dashboard.title,panels},null,2));return;}
 fs.mkdirSync(dest,{recursive:true});
 const manifest={source:host+"/public-dashboards/"+token,
  start:new Date(start).toISOString(),end:new Date(end).toISOString(),
  note:"No Data is unobserved, not zero or healthy. Local only; don't publish raw task identifiers.",
  panels:[],summary:{observed:0,no_data:0,error:0}};
 const replay=[];
 let index=0;
 async function worker(){
  for(;;){
   const p=panels[index++];if(!p)break;
   const row={id:p.id,title:p.title,status:"unqueried",series:0};
   try{
    const data=await request(base+"/panels/"+p.id+"/query",{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({from:String(start),to:String(end),intervalMs:60000,
       maxDataPoints:minutes+20,timezone:"Asia/Seoul"})
    });
    const frames=framesOf(data),series=frames.flatMap(seriesOf);
    row.series=series.length;row.status=series.length?"observed":"no_data";
    manifest.summary[row.status]++;
    fs.writeFileSync(path.join(dest,"panel-"+p.id+".json"),JSON.stringify(data));
    for(let j=0;j<series.length;j++){
     const s=series[j],labels=Object.entries(s.labels).map(([k,v])=>k+"="+v).join(" ");
     replay.push({id:"panel"+p.id+"-"+j,
      label:p.title+" · "+s.field+(labels?" · "+labels:""),
      unit:s.unit,source:"grafana-panel-"+p.id,
      duration:minutes*60,measuredAt:manifest.end,points:JSON.stringify(s.points)});
    }
   }catch(e){row.status="error";row.error=String(e.message).slice(0,300);manifest.summary.error++;}
   manifest.panels.push(row);
   console.log(p.id,row.status,p.title);
  }
 }
 await Promise.all([worker(),worker(),worker()]);
 manifest.panels.sort((a,b)=>panels.findIndex(p=>p.id===a.id)-panels.findIndex(p=>p.id===b.id));
 fs.writeFileSync(path.join(dest,"manifest.json"),JSON.stringify(manifest,null,2));
 fs.writeFileSync(path.join(dest,"replay-rows.json"),JSON.stringify(replay));
 console.log("완료:",dest);
 console.log("시계열",replay.length,"개 / 관측 패널",manifest.summary.observed,
   "/ No Data",manifest.summary.no_data,"/ 조회 오류",manifest.summary.error);
})().catch(e=>{console.error("수집 실패:",e.message);process.exitCode=1;});
