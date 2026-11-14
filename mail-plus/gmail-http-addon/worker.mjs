import {verifyGoogle,isAllowedEmail} from './auth.mjs';
const BASE='https://mail-plus-gmail.smwlyqswkwt232.workers.dev';
const esc=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const para=text=>({textParagraph:{text}});
const button=(text,path,parameters={})=>({buttonList:{buttons:[{text,onClick:{action:{function:BASE+path,parameters:Object.entries(parameters).map(([key,value])=>({key,value:String(value)}))}}}]}});
const card=(widgets,update=false)=>({action:{navigations:[{[update?'updateCard':'pushCard']:{header:{title:'מייל פלוס',subtitle:'כלים אישיים בתוך Gmail'},sections:[{widgets}]}}]}});
const input=(e,k)=>String(e.commonEventObject?.formInputs?.[k]?.stringInputs?.value?.[0]||'').trim();
async function home(env,user,update=false){
 const result=await env.DB.prepare('SELECT id,title FROM gmail_addon_tasks WHERE owner=? AND done=0 ORDER BY created DESC LIMIT 30').bind(user.email).all();
 const widgets=[para('המשימות שלך נשמרות בענן. פתח הודעה כדי ליצור ממנה משימת מעקב.'),{textInput:{name:'title',label:'משימה חדשה',type:'SINGLE_LINE'}},button('הוסף משימה','/add')];
 for(const t of result.results||[]) widgets.push(para(esc(t.title)),button('סמן כבוצע','/done',{id:t.id}));
 widgets.push({buttonList:{buttons:[{text:'פתיחת כלי המייל המלאים',onClick:{openLink:{url:'https://shmuel-lamed.github.io/07/mail-plus/'}}}]}});
 return card(widgets,update);
}
export default {async fetch(request,env){
 const url=new URL(request.url),p=url.pathname;
 const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(p==='/health'&&request.method==='GET')return json({service:'mail-plus-gmail',version:'1.0.0',status:env.ADDON_CLIENT_ID&&env.ADDON_SERVICE_ACCOUNT?'ready':'awaiting-google-registration'});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!['/home','/add','/done','/message','/followup','/compose'].includes(p))return json({error:'Not found'},404);
 if(!env.ADDON_CLIENT_ID||!env.ADDON_SERVICE_ACCOUNT)return json({error:'Google registration required'},503);
 if(Number(request.headers.get('content-length')||0)>65536)return json({error:'Payload too large'},413);
 try{
 const raw=await request.text();if(raw.length>65536)return json({error:'Payload too large'},413);
 let e;try{e=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
 // Verify both the Google deployment service account and the end user.
 const system=e.authorizationEventObject?.systemIdToken||(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 const sys=await verifyService(system,BASE+p,env.ADDON_SERVICE_ACCOUNT);
 if(!sys)return json({error:'Unauthorized'},401);
 const user=await verifyGoogle(new Request(BASE,{headers:{authorization:'Bearer '+(e.authorizationEventObject?.userIdToken||'')}}),env.ADDON_CLIENT_ID);
 if(!user||!(await isAllowedEmail(user.email)))return json({error:'Forbidden'},403);
 const params=e.commonEventObject?.parameters||{};
 if(p==='/add'){
  const title=input(e,'title').slice(0,200);if(!title)return json(card([para('נא לכתוב שם למשימה.')]));
  await env.DB.prepare('INSERT INTO gmail_addon_tasks(id,owner,title,created,done) VALUES(?,?,?,?,0)').bind(crypto.randomUUID(),user.email,title,Date.now()).run();
 }
 if(p==='/done')await env.DB.prepare('UPDATE gmail_addon_tasks SET done=1 WHERE id=? AND owner=?').bind(String(params.id||''),user.email).run();
 if(p==='/compose')return json(card([para('נוסח אישור קבלה:'),para('שלום,<br>קיבלתי את ההודעה, תודה. אבדוק את הפרטים ואחזור אליך בהקדם.'),para('אפשר להעתיק את הנוסח לטיוטה ולערוך אותו לפני השליחה.')]));
 if(p==='/message'||p==='/followup'){
  const scope='https://www.googleapis.com/auth/gmail.addons.current.message.metadata';
  if(!e.authorizationEventObject?.authorizedScopes?.includes(scope))return json({requesting_google_scopes:{scopes:[scope]}});
  const id=e.gmail?.messageId,token=e.authorizationEventObject?.userOAuthToken,access=e.gmail?.accessToken;
  if(typeof id!=='string'||!token||!access)return json(card([para('פתח הודעת מייל ונסה שוב.')]));
  const api=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(id));
  api.searchParams.set('format','metadata');api.searchParams.append('metadataHeaders','Subject');api.searchParams.append('metadataHeaders','From');
  const r=await fetch(api,{headers:{Authorization:'Bearer '+token,'X-Goog-Gmail-Access-Token':access},signal:AbortSignal.timeout(8000)});
  if(!r.ok)return json(card([para('לא ניתן לקרוא את פרטי ההודעה. בדוק שהרשאת ההודעה הנוכחית אושרה.')]));
  const msg=await r.json(),headers=msg.payload?.headers||[],subject=headers.find(h=>h.name.toLowerCase()==='subject')?.value||'ללא נושא';
  if(p==='/followup'){
   await env.DB.prepare('INSERT INTO gmail_addon_tasks(id,owner,title,created,done) VALUES(?,?,?,?,0)').bind(crypto.randomUUID(),user.email,('מעקב: '+subject).slice(0,200),Date.now()).run();
   return json(await home(env,user,true));
  }
  return json(card([para('<b>'+esc(subject)+'</b>'),para(esc(headers.find(h=>h.name.toLowerCase()==='from')?.value||'')),button('צור משימת מעקב','/followup')]));
 }
 return json(await home(env,user,p!=='/home'));
 }catch{return json(card([para('הפעולה נכשלה. נסה שוב בעוד רגע.')]));}
}};
let keys,until=0;
async function verifyService(token,audience,email){
 try{
 if(typeof token!=='string'||token.length>10000)return false;
 const parts=token.split('.');if(parts.length!==3)return false;
 const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const h=JSON.parse(new TextDecoder().decode(decode(parts[0]))),c=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Date.now()/1000;
 if(h.alg!=='RS256'||!h.kid||!['accounts.google.com','https://accounts.google.com'].includes(c.iss)||c.aud!==audience||c.email!==email||c.email_verified!==true||!Number.isFinite(c.exp)||c.exp<=now||!Number.isFinite(c.iat)||c.iat>now+60)return false;
 if(!keys||until<Date.now()){const r=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(8000)});if(!r.ok)return false;keys=(await r.json()).keys;until=Date.now()+300000}
 const jwk=keys.find(k=>k.kid===h.kid&&k.kty==='RSA');if(!jwk)return false;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
 }catch{return false}
}
