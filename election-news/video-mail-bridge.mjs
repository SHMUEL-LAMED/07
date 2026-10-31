// Narrow server-to-server bridge: the pinned collector can mail only its owner.
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const LIMIT = 8 * 1024 * 1024;
const HOSTS = ['mako.co.il','n12.co.il','13tv.co.il','c14.co.il','i24news.tv','kan.org.il','youtube.com'];
const enc = new TextEncoder();
const b64 = bytes => { let out=''; for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(out); };
const utf64 = s => b64(enc.encode(s));
const url64 = s => utf64(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const wrap = s => s.match(/.{1,76}/g)?.join('\r\n') || '';
const json = (x,status=200) => Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const digest = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const get = async (env,key,fallback=null) => JSON.parse(await env.KV.get('news-video:'+key) || JSON.stringify(fallback));
const put = (env,key,value) => env.KV.put('news-video:'+key,JSON.stringify(value));

export function validateVideoManifest(value, now=Date.now()) {
 if(!value || !Array.isArray(value.items) || !value.items.length || value.items.length>100 || !Number.isInteger(value.parts) || value.parts<1 || value.parts>100)throw Error('invalid_manifest');
 const ids=new Set();
 for(const item of value.items){
  if(typeof item.id!=='string'||item.id.length>1600||typeof item.title!=='string'||!item.title.trim()||item.title.length>600)throw Error('invalid_item');
  const u=new URL(item.id); if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('invalid_source');
  if(u.hash&&!/^#media=\d+$/.test(u.hash))throw Error('invalid_clip');
  const published=Date.parse(item.publishedAt);if(!Number.isFinite(published)||published>now+600000||published<now-7*86400000)throw Error('invalid_date');
  if(ids.has(item.id))throw Error('duplicate_item');ids.add(item.id);
 }
 return {items:value.items.map(x=>({id:x.id,title:x.title,publishedAt:x.publishedAt})),parts:value.parts};
}

export function createVideoMailBridge({verify, google, storeVideo, loadVideo, sendMail=false}) {
 async function mailbox(env){
  const recipient=String(env.BUSINESS_EMAIL||'').toLowerCase();
  if(!/^[^@\s\r\n]+@[^@\s\r\n]+\.[^@\s\r\n]+$/.test(recipient))throw Error('owner_not_configured');
  const profile=await google(env,GMAIL+'profile');
  if(String(profile.emailAddress||'').toLowerCase()!==recipient)throw Error('mailbox_mismatch');
  return recipient;
 }
 async function recordPart(env,pending,part,gmailId){
  await put(env,`receipt:${pending.id}:${part}`,{gmailId,at:Date.now()});
  const receipts=await Promise.all(Array.from({length:pending.parts},(_,i)=>get(env,`receipt:${pending.id}:${i+1}`)));
  pending.sent=[...new Set([...(pending.sent||[]),part,...receipts.flatMap((x,i)=>x?.gmailId?[i+1]:[])])];
  if(pending.sent.length===pending.parts){
   const state=await get(env,'state',{sent:[],windowStart:Date.now()});
   const since=Date.now()-7*86400000;
   state.sent=[...(state.sent||[]).filter(x=>x.at>=since),...pending.items.map(x=>({id:x.id,at:Date.now()}))];
   state.lastSentAt=Date.now();await put(env,'state',state);await env.KV.delete('news-video:pending');
  }else await put(env,'pending',pending);
  return {ok:true,part,parts:pending.parts,gmailId,complete:pending.sent.length===pending.parts};
 }
 async function finishSingle(env,pending,recipient){
  const files=await Promise.all(Array.from({length:pending.parts},(_,i)=>get(env,`file:${pending.id}:${i+1}`)));
  if(files.some(x=>!x))return {ok:true,staged:true,complete:false};
  if(!sendMail){
   let result;
   for(let part=1;part<=pending.parts;part++)result=await recordPart(env,pending,part,'drive:'+files[part-1].id);
   return {...result,gmailId:undefined,archived:true,emails:0};
  }
  const messageId=`news-video-${pending.id}-all@yemot-mail.smwlyqswkwt232.workers.dev`;
  const old=await google(env,GMAIL+'messages?q='+encodeURIComponent('in:sent rfc822msgid:'+messageId)+'&maxResults=1');
  let gmailId=old.messages?.[0]?.id;
  if(!gmailId){
   const intentKey=`intent:${pending.id}:all`;
   if(await get(env,intentKey))throw Error('delivery_uncertain: waiting for sent-message verification');
   const attach=files.reduce((n,x)=>n+x.size,0)<=16*1024*1024;
   const date=new Date().toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'});
   const subject=`כתבות הפוליטיקה — עדכון שעתי — ${date}`;
   const body=`כל כתבות הווידאו במייל אחד. ${attach?'הקבצים מצורפים.':'הקבצים גדולים מדי לצירוף; קישורי ההורדה הפרטיים בדרייב מופיעים בהמשך.'}\n\n`+pending.items.map((x,i)=>`${i+1}. ${x.title}\n${x.id}`).join('\n\n')+'\n\n'+files.map((x,i)=>`${i+1}. ${x.name}\n${x.url}`).join('\n');
   const boundary='news-'+pending.id.slice(0,32);
   const mime=[`To: ${recipient}`,`From: ${recipient}`,`Subject: =?UTF-8?B?${utf64(subject)}?=`,`Message-ID: <${messageId}>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(utf64(body))];
   if(attach)for(const file of files){
    const bytes=await loadVideo(env,file.id);
    if(bytes.length!==file.size)throw Error('stored_video_size_mismatch');
    mime.push(`--${boundary}`,'Content-Type: video/mp4',`Content-Disposition: attachment; filename="${file.name}"`,'Content-Transfer-Encoding: base64','',wrap(b64(bytes)));
   }
   mime.push(`--${boundary}--`,'');
   await put(env,intentKey,{at:Date.now()});
   let result;
   try{result=await google(env,GMAIL+'messages/send',{body:{raw:url64(mime.join('\r\n'))}});}catch(error){
    if(error.status>=400&&error.status<500)await env.KV.delete('news-video:'+intentKey);
    throw error;
   }
   if(!result.id)throw Error('send_not_confirmed');gmailId=result.id;
  }
  // A single confirmation covers every attachment; partial completion is recoverable.
  let result;
  for(let part=1;part<=pending.parts;part++)result=await recordPart(env,pending,part,gmailId);
  return {...result,emails:1};
 }
 return async function videoMailRoute(request,env){
  const u=new URL(request.url),path=u.pathname;
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  try{if(!token)throw Error();await verify(token,env,u.origin);}catch{return json({error:'unauthorized'},401);}
  try{
   const recipient=await mailbox(env);
   if(path==='/news-video/state'&&request.method==='GET'){
    let state=await get(env,'state');
    if(!state){state={sent:[],initializedAt:Date.now()};await put(env,'state',state);}
    let pending=await get(env,'pending');
    if(pending){
     const receipts=await Promise.all(Array.from({length:pending.parts},(_,i)=>get(env,`receipt:${pending.id}:${i+1}`)));
     if(receipts.every(x=>x?.gmailId)){await recordPart(env,pending,1,receipts[0].gmailId);state=await get(env,'state',state);pending=null;}
    }
    return json({...state,pending,recipient});
   }
   if(path==='/news-video/start'&&request.method==='POST'){
    const body=await request.text();if(enc.encode(body).length>262144)return json({error:'manifest_too_large'},413);
    const manifest=validateVideoManifest(JSON.parse(body));
    manifest.delivery=sendMail?'single-email':'drive-only';
    const id=await digest(JSON.stringify(manifest.items.map(x=>x.id).sort()));
    const existing=await get(env,'pending');if(existing&&existing.id!==id)return json({error:'batch_pending'},409);
    const state=await get(env,'state',{sent:[]});const sent=new Set(state.sent.map(x=>x.id));
    if(manifest.items.some(x=>sent.has(x.id)))return json({error:'already_sent_items'},409);
    const pending=existing||{...manifest,id,sent:[],createdAt:Date.now()};
    if(pending.parts!==manifest.parts)return json({error:'part_count_changed'},409);
    await put(env,'pending',pending);return json(pending);
   }
   const match=/^\/news-video\/part\/([a-f0-9]{64})\/(\d+)$/.exec(path);
   if(match&&request.method==='POST'){
    const part=Number(match[2]);const receipt=await get(env,`receipt:${match[1]}:${part}`);
    const pending=await get(env,'pending');
    if(!pending||pending.id!==match[1])return receipt?json({ok:true,existing:true,gmailId:receipt.gmailId}):json({error:'unknown_batch'},409);
    if(part<1||part>pending.parts)return json({error:'invalid_part'},400);
    if(receipt)return json(await recordPart(env,pending,part,receipt.gmailId));
    if((pending.delivery==='single-email'||!sendMail) && await get(env,`file:${pending.id}:${part}`))return json(await finishSingle(env,pending,recipient));
    if(request.headers.get('Content-Type')!=='video/mp4')return json({error:'mp4_required'},415);
    const length=Number(request.headers.get('Content-Length'));if(!length||length>LIMIT)return json({error:'video_size'},413);
    const reader=request.body.getReader();let size=0;const chunks=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();return json({error:'video_size'},413);}chunks.push(value);}
    if(size!==length)return json({error:'length_mismatch'},400);
    const video=new Uint8Array(size);let offset=0;for(const chunk of chunks){video.set(chunk,offset);offset+=chunk.length;}
    if(size<12||new TextDecoder().decode(video.subarray(4,8))!=='ftyp')return json({error:'invalid_mp4'},400);
    if(pending.delivery==='single-email'||!sendMail){
     const name=`news-${pending.id.slice(0,12)}-${part}.mp4`;
     const day=new Date(pending.createdAt).toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
     const saved=await storeVideo(env,{name,bytes:video,day});
     if(!saved?.id||!saved.webViewLink)throw Error('drive_upload_not_confirmed');
     const link=new URL(saved.webViewLink);
     if(link.protocol!=='https:'||link.hostname!=='drive.google.com')throw Error('invalid_drive_link');
     await put(env,`file:${pending.id}:${part}`,{id:saved.id,url:link.href,name,size});
     return json(await finishSingle(env,pending,recipient));
    }
    const messageId=`news-video-${pending.id}-${part}@yemot-mail.smwlyqswkwt232.workers.dev`;
    const old=await google(env,GMAIL+'messages?q='+encodeURIComponent('in:sent rfc822msgid:'+messageId)+'&maxResults=1');
    let gmailId=old.messages?.[0]?.id;
    if(!gmailId){
     const date=new Date().toLocaleString('he-IL',{timeZone:'Asia/Jerusalem'});
     const subject=`כתבות הפוליטיקה — עדכון שעתי — ${date} — חלק ${part}/${pending.parts}`;
     const body=`כתבות הווידאו החדשות. חלק ${part} מתוך ${pending.parts}.\n\n`+pending.items.map((x,i)=>`${i+1}. ${x.title}\n${x.id}`).join('\n\n');
     const boundary='news-'+pending.id.slice(0,32);
     const raw=[`To: ${recipient}`,`From: ${recipient}`,`Subject: =?UTF-8?B?${utf64(subject)}?=`,`Message-ID: <${messageId}>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(utf64(body)),`--${boundary}`,'Content-Type: video/mp4',`Content-Disposition: attachment; filename="news-${pending.id.slice(0,12)}-${part}.mp4"`,'Content-Transfer-Encoding: base64','',wrap(b64(video)),`--${boundary}--`,''].join('\r\n');
     const intent=await get(env,`intent:${pending.id}:${part}`);
     if(intent)throw Error('delivery_uncertain: waiting for sent-message verification');
     await put(env,`intent:${pending.id}:${part}`,{at:Date.now()});
     let result;
     try{result=await google(env,GMAIL+'messages/send',{body:{raw:url64(raw)}});}catch(error){
      // Explicit HTTP failures were rejected; transport failures may have sent.
      if(error.status>=400&&error.status<500)await env.KV.delete(`news-video:intent:${pending.id}:${part}`);
      throw error;
     }
     if(!result.id)throw Error('send_not_confirmed');gmailId=result.id;
    }
    return json(await recordPart(env,pending,part,gmailId));
   }
   return json({error:'not_found'},404);
  }catch(error){console.error('news_video_mail',String(error.message).slice(0,160));return json({error:String(error.message).slice(0,160)},502);}
 };
}
