declare const Deno: {serve:(handler:(req:Request)=>Promise<Response>)=>void};
import {verifyGoogle,GOOGLE_CLIENT_ID} from './google-auth.mjs';
const ORIGIN='https://shmuel-lamed.github.io';
const UPSTREAM='https://mail-plus-cloud.smwlyqswkwt232.workers.dev/bridge';
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Max-Age':'600','Vary':'Origin'};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{...cors,'Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');if(origin&&origin!==ORIGIN)return json({error:'מקור לא מורשה'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const u=new URL(req.url),prefix='/mail-plus-bridge',i=u.pathname.indexOf(prefix),path=i>=0?u.pathname.slice(i+prefix.length):'';
 if(path==='/config'&&req.method==='GET')return json({clientId:GOOGLE_CLIENT_ID});
 if(!['/me','/work','/ai'].includes(path)||u.search)return json({error:'נתיב לא מורשה'},404);
 if(!['GET','POST'].includes(req.method)||(path==='/ai'&&req.method!=='POST')||(path==='/me'&&req.method!=='GET'))return json({error:'שיטה לא מורשית'},405);
 const user=await verifyGoogle(req);if(!user)return json({error:'נדרשת כניסה לחשבון Google שלך'},401);
 if(path==='/me')return json({email:user.email,name:user.name});
 let body:Uint8Array|undefined;if(req.method==='POST'){if(Number(req.headers.get('content-length'))>60000)return json({error:'בקשה גדולה מדי'},413);const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>60000){await reader.cancel();return json({error:'בקשה גדולה מדי'},413);}chunks.push(value);}}body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}}
 try{const r=await fetch(UPSTREAM+path,{method:req.method,headers:{'Authorization':req.headers.get('authorization')!,'Content-Type':'application/json'},body:body?.buffer as ArrayBuffer|undefined,redirect:'manual',signal:AbortSignal.timeout(30000)});if(r.status>=300&&r.status<400)return json({error:'חיבור הגשר לשרת עדיין אינו פעיל'},502);return new Response(r.body,{status:r.status,headers:{...cors,'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'}});}catch{return json({error:'החיבור לשרת לא הצליח. נסה שוב.'},502);}
});