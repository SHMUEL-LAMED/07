// Narrow server-to-server bridge: the pinned collector can mail only its owner.
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const LIMIT = 8 * 1024 * 1024;
const PENDING_TTL = 86400000;
const INTENT_GRACE = 30 * 60000;
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

export function archiveFilename(title, batch, part) {
 const safe=String(title).normalize('NFC').replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,160)||'כתבה';
 return `${safe} — ${batch.slice(0,8)}-${part}.mp4`;
}

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
 if(value.partTitles!==undefined&&(!Array.isArray(value.partTitles)||value.partTitles.length!==value.parts||value.partTitles.some(x=>typeof x!=='string'||!x.trim()||x.length>700)))throw Error('invalid_part_titles');
 return {...(value.partTitles?{partTitles:value.partTitles}:{}),items:value.items.map(x=>({id:x.id,title:x.title,publishedAt:x.publishedAt})),parts:value.parts};
}

export function parseWomenFrameResult(value,count){
 const parsed=typeof value==='string'?JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/g,'')):value;
 if(!Array.isArray(parsed?.frames)||parsed.frames.length!==count)throw Error('incomplete_blur_analysis');
 const seen=new Set();
 for(const frame of parsed.frames){
  if(!Number.isInteger(frame.index)||frame.index<0||frame.index>=count||seen.has(frame.index)||!Array.isArray(frame.boxes)||frame.boxes.length>50)throw Error('invalid_blur_analysis');
  seen.add(frame.index);
  for(const box of frame.boxes)if(!Array.isArray(box)||box.length!==4||box.some(x=>!Number.isFinite(x))||!(0<=box[0]&&box[0]<box[2]&&box[2]<=1000&&0<=box[1]&&box[1]<box[3]&&box[3]<=1000))throw Error('invalid_blur_box');
 }
 return {policy:'women-body-v1',frames:parsed.frames};
}

export function createVideoMailBridge({verify, google, storeVideo, loadVideo, replaceVideo, fileGone, sendMail=false, analyzeFrames, requireWomenBlur=false}) {
 async function mailbox(env){
  const recipient=String(env.BUSINESS_EMAIL||'').toLowerCase();
  if(!/^[^@\s\r\n]+@[^@\s\r\n]+\.[^@\s\r\n]+$/.test(recipient))throw Error('owner_not_configured');
  const profile=await google(env,GMAIL+'profile');
  if(String(profile.emailAddress||'').toLowerCase()!==recipient)throw Error('mailbox_mismatch');
  return recipient;
 }
 async function recordPart(env,pending,part,gmailId){
  await put(env,`receipt:${pending.id}:${part}`,{gmailId,at:Date.now()});
  return settle(env,pending,part,gmailId);
 }
 // KV allows one write per second to a key. Recording a whole batch part by part rewrote
 // 'pending' once per part and was refused with 429, on every retry.
 async function recordAll(env,pending,idFor){
  for(let part=1;part<=pending.parts;part++){
   const id=idFor(part),old=await get(env,`receipt:${pending.id}:${part}`);
   if(old?.gmailId!==id)await put(env,`receipt:${pending.id}:${part}`,{gmailId:id,at:Date.now()});
  }
  return settle(env,pending,pending.parts,idFor(pending.parts));
 }
 async function settle(env,pending,part,gmailId){
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
   const result=await recordAll(env,pending,part=>'drive:'+files[part-1].id);
   return {...result,gmailId:undefined,archived:true,emails:0};
  }
  const messageId=`news-video-${pending.id}-all@yemot-mail.smwlyqswkwt232.workers.dev`;
  const old=await google(env,GMAIL+'messages?q='+encodeURIComponent('in:sent rfc822msgid:'+messageId)+'&maxResults=1');
  let gmailId=old.messages?.[0]?.id;
  if(!gmailId){
   const intentKey=`intent:${pending.id}:all`;
   const intent=await get(env,intentKey);
   if(intent&&Date.now()-Number(intent.at||0)<INTENT_GRACE)throw Error('delivery_uncertain: waiting for sent-message verification');
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
  const result=await recordAll(env,pending,()=>gmailId);
  return {...result,emails:1};
 }
 return async function videoMailRoute(request,env){
  const u=new URL(request.url),path=u.pathname;
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  try{if(!token)throw Error();await verify(token,env,u.origin);}catch{return json({error:'unauthorized'},401);}
  try{
   const recipient=await mailbox(env);
   // Only files created by this authenticated archive may be post-processed.
   if(path==='/news-video/post-blur'&&request.method==='GET'){
    const queue=await get(env,'post-blur',[]);
    if(!fileGone)return json({items:queue});
    // The owner may delete archived files or their folder. A task for a file that no longer
    // exists can never finish, so it leaves the queue instead of being retried on every run.
    const keep=[];let checked=0;
    for(const item of queue){
     if(checked>=40){keep.push(item);continue;}
     checked++;
     const file=await get(env,'file:'+item.key);
     if(file?.id&&!(await fileGone(env,file.id)))keep.push(item);
    }
    if(keep.length!==queue.length)await put(env,'post-blur',keep);
    return json({items:keep});
   }
   if(path==='/news-video/post-blur/defer'&&request.method==='POST'){
    const length=Number(request.headers.get('Content-Length'));if(!length||length>512)return json({error:'invalid_task'},400);
    const {key}=await request.json(),queue=await get(env,'post-blur',[]),item=queue.find(x=>x.key===key);
    if(!item)return json({error:'unknown_task'},404);
    await put(env,'post-blur',[...queue.filter(x=>x.key!==key),item]);return json({ok:true});
   }
   const postBlur=/^\/news-video\/post-blur\/([a-f0-9]{64})\/(\d+)$/.exec(path);
   if(postBlur){
    const key=postBlur[1]+':'+postBlur[2],file=await get(env,'file:'+key);
    if(!file?.rawHash)return json({error:'unknown_archive_file'},404);
    if(request.method==='GET')return new Response(await loadVideo(env,file.id),{headers:{'Content-Type':'video/mp4','Cache-Control':'no-store'}});
    if(request.method!=='POST')return json({error:'method_not_allowed'},405);
    if(request.headers.get('X-News-Filter')!=='women-body-v1'||request.headers.get('X-Original-SHA256')!==file.rawHash)return json({error:'filter_or_source_mismatch'},409);
    if(file.blurred)return json({ok:true,existing:true,id:file.id});
    if(request.headers.get('Content-Type')!=='video/mp4')return json({error:'mp4_required'},415);
    const length=Number(request.headers.get('Content-Length'));
    if(!length||length>LIMIT)return json({error:'video_size'},413);
    const reader=request.body.getReader(),chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();return json({error:'video_size'},413);}chunks.push(value);}
    if(size!==length)return json({error:'length_mismatch'},400);
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(size<12||new TextDecoder().decode(bytes.subarray(4,8))!=='ftyp')return json({error:'invalid_mp4'},400);
    if(!replaceVideo)throw Error('archive_replacement_unavailable');
    const saved=await replaceVideo(env,file.id,bytes,file.rawHash);
    if(saved?.id!==file.id)throw Error('replacement_not_confirmed');
    await put(env,'file:'+key,{...file,blurred:true,size});
    const queue=await get(env,'post-blur',[]);await put(env,'post-blur',queue.filter(x=>x.key!==key));
    return json({ok:true,id:file.id,blurred:true});
   }
   // Explicit owner exception: Eretz Nehederet originals plus separately blurred copies.
   // Independent receipts avoid interfering with the news digest's pending batch.
   if(path==='/news-video/eretz'&&request.method==='GET')return json(await get(env,'eretz',{files:{}}));
   if(path==='/news-video/eretz'&&request.method==='POST'){
    const source=request.headers.get('X-Eretz-Source')||'',variant=request.headers.get('X-Eretz-Variant');
    const sourceUrl=new URL(source);
    if(sourceUrl.origin!=='https://www.mako.co.il'||!/^\/mako-vod-keshet\/eretz_nehederet-s\d+\/VOD-[a-f0-9]+\.htm$/.test(sourceUrl.pathname)||sourceUrl.search||sourceUrl.hash)return json({error:'invalid_episode_source'},400);
    if(!['original','blurred'].includes(variant))return json({error:'invalid_episode_variant'},400);
    if(variant==='blurred'&&request.headers.get('X-News-Filter')!=='women-body-v1')return json({error:'filtered_video_required'},409);
    const part=Number(request.headers.get('X-Eretz-Part')),total=Number(request.headers.get('X-Eretz-Parts'));
    if(!Number.isInteger(part)||!Number.isInteger(total)||part<1||part>total||total>100)return json({error:'invalid_episode_part'},400);
    const key=await digest(source+':'+variant+':'+part);
    const state=await get(env,'eretz',{files:{}});
    if(state.files[key])return json({ok:true,existing:true,...state.files[key]});
    if(request.headers.get('Content-Type')!=='video/mp4')return json({error:'mp4_required'},415);
    const length=Number(request.headers.get('Content-Length'));
    if(!length||length>LIMIT)return json({error:'video_size'},413);
    const reader=request.body.getReader(),chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();return json({error:'video_size'},413);}chunks.push(value);}
    if(size!==length)return json({error:'length_mismatch'},400);
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(size<12||new TextDecoder().decode(bytes.subarray(4,8))!=='ftyp')return json({error:'invalid_mp4'},400);
    const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
    const name=`eretz-${(await digest(source)).slice(0,12)}-${variant}-${part}-of-${total}.mp4`;
    const saved=await storeVideo(env,{name,bytes,day});
    if(!saved?.id||!saved.webViewLink)throw Error('drive_upload_not_confirmed');
    state.files[key]={id:saved.id,url:saved.webViewLink,source,variant,part,total,day};
    await put(env,'eretz',state);
    return json({ok:true,...state.files[key]});
   }
   if(path==='/news-video/blur-frames'&&request.method==='POST'){
    const text=await request.text();if(text.length>2400000)return json({error:'frames_too_large'},413);
    const frames=JSON.parse(text).frames;
    if(!Array.isArray(frames)||!frames.length||frames.length>8||frames.some(x=>typeof x!=='string'||x.length>300000||!/^\/9j\/[A-Za-z0-9+/=]+$/.test(x)))return json({error:'invalid_jpeg_frames'},400);
    if(!analyzeFrames)throw Error('blur_provider_not_configured');
    return json(parseWomenFrameResult(await analyzeFrames(env,frames),frames.length));
   }
   if(path==='/news-video/backfill'&&request.method==='POST'){
    if(requireWomenBlur)return json({ok:true,archived:0,more:false,disabled:'unfiltered_backfill_disabled'});
    const input=await request.text();if(input.length>8192)return json({error:'request_too_large'},413);
    const cursor=JSON.parse(input||'{}').pageToken||'';
    if(typeof cursor!=='string'||cursor.length>4096)return json({error:'invalid_cursor'},400);
    const query='in:anywhere in:sent from:me subject:"כתבות הפוליטיקה" has:attachment filename:mp4 newer_than:7d';
    const listing=await google(env,GMAIL+'messages?q='+encodeURIComponent(query)+'&includeSpamTrash=true&maxResults=100'+(cursor?'&pageToken='+encodeURIComponent(cursor):''));
    let archived=0;
    for(const entry of listing.messages||[]){
     if(!/^[a-f0-9]+$/.test(entry.id))continue;
     if(await get(env,'backfill-mail:'+entry.id))continue;
     const message=await google(env,GMAIL+'messages/'+entry.id+'?format=full');
     const subject=(message.payload?.headers||[]).find(x=>x.name.toLowerCase()==='subject')?.value||'';
     if(!(message.labelIds||[]).includes('SENT')||!subject.startsWith('כתבות הפוליטיקה — עדכון שעתי'))continue;
     const date=new Date(Number(message.internalDate));if(!Number.isFinite(date.getTime()))continue;
     const day=date.toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
     const parts=[];function walk(node){if(node)parts.push(node);for(const child of node?.parts||[])walk(child);}walk(message.payload);
     for(const part of parts){
      if(part.mimeType!=='video/mp4'||!/^news-[a-f0-9]{12}-[0-9]+\.mp4$/.test(part.filename||''))continue;
      const key='backfill-file:'+entry.id+':'+part.partId;
      if(await get(env,key))continue;
      if(!part.body?.size||part.body.size>LIMIT)throw Error('mail_attachment_size');
      const attachment=part.body.attachmentId?await google(env,GMAIL+'messages/'+entry.id+'/attachments/'+encodeURIComponent(part.body.attachmentId)):part.body;
      if(typeof attachment.data!=='string'||attachment.data.length>LIMIT*1.4)throw Error('invalid_mail_attachment');
      const raw=atob(attachment.data.replace(/-/g,'+').replace(/_/g,'/'));
      const bytes=Uint8Array.from(raw,x=>x.charCodeAt(0));
      if(bytes.length!==part.body.size||bytes.length<12||new TextDecoder().decode(bytes.subarray(4,8))!=='ftyp')throw Error('invalid_mail_mp4');
      const saved=await storeVideo(env,{name:part.filename,bytes,day});
      if(!saved?.id||!saved.webViewLink)throw Error('drive_upload_not_confirmed');
      await put(env,key,{id:saved.id,url:saved.webViewLink,day,at:Date.now()});archived++;
      if(archived>=4)return json({ok:true,archived,more:true,pageToken:cursor});
     }
     await put(env,'backfill-mail:'+entry.id,{at:Date.now()});
    }
    return json({ok:true,archived,more:Boolean(listing.nextPageToken),pageToken:listing.nextPageToken||''});
   }
   if(path==='/news-video/state'&&request.method==='GET'){
    let state=await get(env,'state');
    if(!state){state={sent:[],initializedAt:Date.now()};await put(env,'state',state);}
    let pending=await get(env,'pending');
    if(requireWomenBlur&&pending&&pending.policy!=='women-body-v1'){await put(env,'pending-before-filter:'+pending.id,pending);await env.KV.delete('news-video:pending');pending=null;}
    if(pending){
     const receipts=await Promise.all(Array.from({length:pending.parts},(_,i)=>get(env,`receipt:${pending.id}:${i+1}`)));
     if(receipts.every(x=>x?.gmailId)){await recordPart(env,pending,1,receipts[0].gmailId);state=await get(env,'state',state);pending=null;}
     else if(Date.now()-Number(pending.createdAt||0)>PENDING_TTL){await put(env,'pending-expired:'+pending.id,pending);await env.KV.delete('news-video:pending');pending=null;}
    }
    return json({...state,pending,recipient,requireWomenBlur});
   }
   if(path==='/news-video/start'&&request.method==='POST'){
    const body=await request.text();if(enc.encode(body).length>262144)return json({error:'manifest_too_large'},413);
    const manifest=validateVideoManifest(JSON.parse(body));
    manifest.delivery=sendMail?'single-email':'drive-only';
    if(requireWomenBlur)manifest.policy='women-body-v1';
    const id=await digest((manifest.policy?manifest.policy+':':'')+JSON.stringify(manifest.items.map(x=>x.id).sort()));
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
    if(requireWomenBlur&&request.headers.get('X-News-Filter')!=='women-body-v1')return json({error:'filtered_video_required'},409);
    if(request.headers.get('Content-Type')!=='video/mp4')return json({error:'mp4_required'},415);
    const length=Number(request.headers.get('Content-Length'));if(!length||length>LIMIT)return json({error:'video_size'},413);
    const reader=request.body.getReader();let size=0;const chunks=[];
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();return json({error:'video_size'},413);}chunks.push(value);}
    if(size!==length)return json({error:'length_mismatch'},400);
    const video=new Uint8Array(size);let offset=0;for(const chunk of chunks){video.set(chunk,offset);offset+=chunk.length;}
    if(size<12||new TextDecoder().decode(video.subarray(4,8))!=='ftyp')return json({error:'invalid_mp4'},400);
    if(pending.delivery==='single-email'||!sendMail){
     const title=pending.partTitles?.[part-1]||(pending.items.length===1?pending.items[0].title:'כתבות חדשות — חלק '+part);
     const name=archiveFilename(title,pending.id,part);
     const day=new Date(pending.createdAt).toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});
     const saved=await storeVideo(env,{name,bytes:video,day});
     if(!saved?.id||!saved.webViewLink)throw Error('drive_upload_not_confirmed');
     const link=new URL(saved.webViewLink);
     if(link.protocol!=='https:'||link.hostname!=='drive.google.com')throw Error('invalid_drive_link');
     const rawHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',video))].map(x=>x.toString(16).padStart(2,'0')).join('');
     const key=pending.id+':'+part;
     await put(env,`file:${key}`,{id:saved.id,url:link.href,name,size,rawHash});
     if(request.headers.get('X-News-Filter')!=='women-body-v1'){
      const queue=await get(env,'post-blur',[]);
      if(!queue.some(x=>x.key===key))await put(env,'post-blur',[...queue,{key,batch:pending.id,part,rawHash}]);
     }
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
     if(intent&&Date.now()-Number(intent.at||0)<INTENT_GRACE)throw Error('delivery_uncertain: waiting for sent-message verification');
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
