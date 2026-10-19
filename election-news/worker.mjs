import {mirrorPolls} from './poll-folder.mjs';
import {verifyCollectorToken} from './collector-auth.mjs';
import {cacheSourceFeed,publicationMillis} from './source-feed.mjs';
const SOURCES = [
 {id:'kan',name:'כאן 11',url:'https://www.kan.org.il/content/kan-news/politic/',host:'kan.org.il',article:/\/content\/kan-news\/[^/]+\/\d+\//},
 {id:'n12',name:'חדשות 12',url:'https://mobile.mako.co.il/news-israel-elections',host:'mako.co.il',article:/Article-[a-f0-9]+\.htm/i},
 {id:'reshet',name:'חדשות 13',url:'https://13tv.co.il/tags/survey/',host:'13tv.co.il',article:/\/news\/.+\d{5,}/},
 {id:'c14',name:'ערוץ 14',url:'https://www.c14.co.il/',host:'c14.co.il',article:/\/article\/\d+/},
 {id:'i24',name:'i24NEWS',url:'https://www.i24news.tv/he/news/israel-elections-2026',host:'i24news.tv',article:/\/he\/news\/.+artc-/}
];
export const relevant = text => /סקר|מנדטים|בחירות|אחוז החסימה|קמפיין|פריימריז/.test(text) && /מנדטים|בחירות|כנסת|אחוז החסימה|פריימריז|נתניהו|בנט|איזנקוט|לפיד|ליכוד|מפלג/.test(text) && !/בחירות (בארה[״"]ב|בארצות הברית|בצרפת|בבריטניה)/.test(text);
export function freshPublication(date,now=Date.now()){const value=publicationMillis(date);return Number.isFinite(value)&&value<=now+600000&&now-value<=7*86400000;}
export function recordingName(date,files,previous){
 if(previous&&files.some(f=>f.name===previous&&Number(f.duration)>0))return previous;
 const occupied=new Set(files.map(f=>f.name));let stamp=Math.floor(publicationMillis(date)/1000);if(!Number.isFinite(stamp))throw Error('missing_publication_date');
 while(occupied.has(String(stamp)+'.wav'))stamp++;
 return String(stamp)+'.wav';
}
export function spokenIntro(item){
 const channel={kan:'כאן חדשות',n12:'חדשות שתים עשרה',reshet:'חדשות שלוש עשרה',c14:'ערוץ ארבע עשרה',i24:'איי עשרים וארבע ניוז'}[item.source];
 const date=typeof item.published_at==='number'?item.published_at:publicationMillis(item.published_at);if(!channel||!Number.isFinite(date))throw Error('intro_metadata_missing');
 const title=decode(String(item.title||'')).replace(/^פורסם ב־[^—]+—\s*/,'').replace(/[\r\n=]/g,' ').replace(/\s+/g,' ').trim();
 const day=new Intl.DateTimeFormat('he-IL-u-ca-hebrew',{timeZone:'Asia/Jerusalem',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(date).replace(/^יום /,'');
 const poll=/סקר|מנדטים|מפת הגושים/.test(title)&&!/בצל|בעקבות הסקר/.test(title);
 return (poll?'האזינו לסקר של ':'האזינו לכתבה של ')+channel+', מיום '+day+'. '+title+'.';
}
export async function syncIntros(env){
 const rows=await env.DB.prepare("SELECT i.url,i.source,i.title,i.file,d.published_at FROM items i JOIN article_dates d ON d.url=i.url WHERE i.status='uploaded' ORDER BY d.published_at DESC").all();
 const lines=rows.results.filter(x=>/^\d+\.wav$/.test(x.file||'')).map(x=>x.file.replace(/\.wav$/,'')+'='+spokenIntro(x));
 await yemot(env,'UploadTextFile',{what:'ivr2:1/TitleVoice.ini',contents:lines.join('\n')+'\n'});
 await yemot(env,'UpdateExtension',{path:'ivr2:1',say_title_voice:'yes'});
 let polls;try{polls=await mirrorPolls(env,rows.results,yemot,spokenIntro);}catch(error){polls={error:error.message};console.error('poll_sync_failed',error.message);}
 return {ok:true,titles:lines.length,polls};
}
const limit=24*1024*1024;
function decode(s){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function safeURL(s){const u=new URL(s); if(u.protocol!=='https:'||u.username||u.password||!/[a-z]/i.test(u.hostname)||/^(localhost|.*\.local|.*\.internal)$/.test(u.hostname)||u.hostname.includes(':'))throw Error('invalid_public_url'); return u;}
export function mediaFrom(html){
 const result=[];
 // Only editorial JSON-LD media objects and explicit audio/video elements; do not harvest ads, navigation, or unrelated embedded podcasts.
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const walk=o=>{if(!o||typeof o!=='object')return;if(['VideoObject','AudioObject'].some(t=>[o['@type']].flat().includes(t))&&typeof o.contentUrl==='string')result.push(o.contentUrl);for(const v of Object.values(o))if(typeof v==='object'){if(Array.isArray(v))v.forEach(walk);else walk(v);}};walk(JSON.parse(m[1]));}catch{}
 }
 for(const m of html.matchAll(/<(audio|video)\b[^>]*>([\s\S]*?)<\/\1>/gi)){
  for(const n of m[0].matchAll(/\bsrc=["']([^"']+)["']/gi))result.push(decode(n[1]));
 }
 return [...new Set(result)].filter(u=>/^https:\/\//.test(u)&&/\.(mp3|wav|m4a|mp4)(\?|$)/i.test(u));
}
async function get(url){for(let i=0;i<5;i++){safeURL(url);const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0'}});if(r.status>=300&&r.status<400){url=new URL(r.headers.get('location'),url).href;continue;}if(!r.ok)throw Error('http_'+r.status);return r;}throw Error('redirect_limit');}
export function reshetEntry(html){
 const raw=html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
 if(!raw)return null;
 try{return JSON.parse(raw)?.props?.pageProps?.page?.Content?.Item?.video?.kalturaId||null;}catch{return null;}
}
export function selectPlayback(context){
 if(!context||context.objectType==='KalturaAPIException'||context.messages?.length||(context.actions||[]).some(a=>a.objectType!=='KalturaAccessControlLimitDeliveryProfilesAction'))throw Error('playback_restricted');
 const candidates=(context.sources||[]).filter(s=>['url','applehttp'].includes(s.format)&&!s.drm?.length).filter(s=>(context.actions||[]).every(a=>{const matches=String(a.deliveryProfileIds||'').split(',').includes(String(s.deliveryProfileId));return [true,1,'1'].includes(a.isBlockedList)?!matches:matches;}));
 const source=candidates.find(s=>s.format==='url')||candidates.find(s=>s.format==='applehttp');
 if(!source)throw Error('no_public_download');
 if(source.format==='applehttp'){safeURL(source.url);return source.url;}
 const permitted=new Set((source.flavorIds||'').split(','));
 const flavors=(context.flavorAssets||[]).filter(f=>permitted.has(f.id)&&f.status===2&&f.fileExt==='mp4'&&Number(f.sizeInBytes||f.size*1024)<=limit).sort((a,b)=>Number(a.sizeInBytes||a.size*1024)-Number(b.sizeInBytes||b.size*1024));
 if(!flavors.length)throw Error('file_too_large');
 const u=source.url.replace(/\/flavorIds\/[^/]+/,'/flavorIds/'+flavors[0].id);safeURL(u);return u;
}
async function reshetMedia(html){
 const id=reshetEntry(html);if(!id)return [];
 const body={apiVersion:'3.3.0',clientTag:'html5:v3.1.0',format:1,partnerId:2748741,
 '1':{service:'session',action:'startWidgetSession',widgetId:'_2748741',expiry:3600},
 '2':{service:'baseentry',action:'getPlaybackContext',entryId:id,ks:'{1:result:ks}',contextDataParams:{objectType:'KalturaPlaybackContextOptions',referrer:'https://13tv.co.il/'}}};
 const r=await fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('playback_http_'+r.status);
 const j=await r.json();return [selectPlayback(j[1])];
}
export function articleTitle(html,fallback){
 const titles=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>decode(m[1].replace(/<[^>]+>/g,' ')).trim());
 return titles.find(relevant)||titles[0]||fallback;
}
export function c14Embed(html){
 let embed=null;
 function walk(o){if(!o||typeof o!=='object')return;if(o['@type']==='VideoObject'&&typeof o.embedUrl==='string'&&o.embedUrl.startsWith('https://snippet.univtec.com/'))embed=o.embedUrl;for(const v of Object.values(o))if(typeof v==='object'){if(Array.isArray(v))v.forEach(walk);else walk(v);}}
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 return embed;
}
export function c14Download(data){
 const vod=data?.vod;if(!vod||vod.paidType||vod.approved!==true||vod.publish_status!=='Processed')throw Error('playback_restricted');
 const files=(vod.content||[]).filter(c=>c.type==='video'&&c.format==='mp4'&&c.downloadUrl?.startsWith('https://channel14.vod.immergo.tv/'));
 files.sort((a,b)=>Number(a.resolution?.split('x')[0]||99999)-Number(b.resolution?.split('x')[0]||99999));
 if(!files.length)throw Error('needs_source_adapter');return files[0].downloadUrl;
}
async function c14Media(html){
 const embed=c14Embed(html);if(!embed)return [];
 const u=new URL(embed);const id=u.searchParams.get('data-guid');if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('invalid_video_id');
 const url='https://insight-api-channel14.univtec.com/cms/interface/vods/play?'+new URLSearchParams({relations:'true',filter:'guid||$eq||'+id});
 const r=await fetch(url,{headers:{'x-tenant-id':'channel14'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('playback_http_'+r.status);
 return [c14Download(await r.json())];
}
export function nextData(html){const raw=html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];try{return raw?JSON.parse(raw):null;}catch{return null;}}
export async function makoMedia(html){
 const video=nextData(html)?.props?.pageProps?.pageData?.header?.mainVideo;if(!video?.videoVcmId)return [];
 const params=new URLSearchParams({jspName:'playlist12.jsp',vcmid:video.videoVcmId,videoChannelId:video.videoChannelId,galleryChannelId:video.videoGalleryChannelId,consumer:'responsive'});
 const raw=await(await get('https://www.mako.co.il/AjaxPage?'+params)).text();
 // Public player metadata encoding, as implemented by Mako's published player SDK.
 // This decodes the playlist, not the media. Protected content and encrypted HLS are rejected below.
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('LTf7r/zM2VndHwP+4So6bw=='),{name:'AES-CBC'},false,['decrypt']);
 const decoded=await crypto.subtle.decrypt({name:'AES-CBC',iv:new TextEncoder().encode('theExact16Chars=')},key,Uint8Array.from(atob(raw.trim()),c=>c.charCodeAt(0)));
 const data=JSON.parse(new TextDecoder().decode(decoded));if(data.videoDetails?.extraParams?.protectedContent||data.videoDetails?.isLive)throw Error('playback_restricted');
 return (data.media||[]).filter(m=>m.url?.startsWith('https://')&&!m.ssai).map(m=>m.url);
}
export function hlsPlaylist(text,url){
 if(!text.startsWith('#EXTM3U'))throw Error('invalid_hls');
 if(/#EXT-X-KEY:(?![^\r\n]*METHOD=NONE)/.test(text))throw Error('encrypted_hls');
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const variants=[];
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){const bandwidth=Number(lines[i].match(/BANDWIDTH=(\d+)/)?.[1]||Infinity);if(lines[i+1]&&!lines[i+1].startsWith('#'))variants.push({bandwidth,url:new URL(lines[i+1],url).href});}
 if(variants.length)return {variant:variants.sort((a,b)=>a.bandwidth-b.bandwidth)[0].url};
 if(!text.includes('#EXT-X-ENDLIST'))throw Error('live_hls_not_supported');
 if(text.includes('#EXT-X-BYTERANGE'))throw Error('byterange_hls_not_supported');
 const segments=lines.filter(s=>!s.startsWith('#')).map(s=>new URL(s,url).href);if(!segments.length||segments.length>35)throw Error('hls_segment_limit');
 const init=text.match(/#EXT-X-MAP:URI="([^"]+)"/)?.[1];
 return {segments:init?[new URL(init,url).href,...segments]:segments,extension:init?'mp4':'ts'};
}
async function downloadMedia(url){
 if(!/\.m3u8(?:\?|$)/i.test(url))return {blob:await bounded(await get(url),limit),extension:url.match(/\.(mp3|wav|m4a|mp4)(?:\?|$)/i)?.[1]||'mp4'};
 let parsed;
 for(let i=0;i<3;i++){
  parsed=hlsPlaylist(await(await get(url)).text(),url);if(!parsed.variant)break;url=parsed.variant;
 }
 if(parsed.variant)throw Error('nested_hls_limit');
 let size=0;const parts=[];
 for(const segment of parsed.segments){const blob=await bounded(await get(segment),limit-size);size+=blob.size;parts.push(blob);}
 return {blob:new Blob(parts,{type:parsed.extension==='ts'?'video/mp2t':'video/mp4'}),extension:parsed.extension};
}
async function bounded(r,max){if(Number(r.headers.get('content-length'))>max)throw Error('file_too_large');const reader=r.body.getReader();let size=0;const parts=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('file_too_large');}parts.push(value);}return new Blob(parts,{type:r.headers.get('content-type')||'application/octet-stream'});}
async function yemot(env,command,values){const r=await fetch('https://www.call2all.co.il/ym/api/'+command,{method:'POST',body:new URLSearchParams({token:env.YEMOT_TOKEN,...values}),signal:AbortSignal.timeout(30000)});const j=await r.json();if(j.responseStatus!=='OK')throw Error('yemot_'+(j.messageCode||'error'));return j;}
async function reshetData(url){const path=new URL(url).pathname;const data=await(await get('https://13tv.co.il/qdata'+path+'?qdata=json')).json();if(!data?.PageMeta||!data.Content)throw Error('invalid_reshet_data');return data;}
export function reshetCandidates(data){
 const result=new Map();const walk=o=>{if(!o||typeof o!=='object')return;
  if(o.link&&o.title&&typeof o.link==='string'&&relevant(o.title+' '+(o.secondaryTitle||''))){try{const u=new URL(o.link,'https://13tv.co.il');const date=Date.parse(o.publishDate||'');if(u.hostname==='13tv.co.il'&&u.pathname.startsWith('/item/news/')&&freshPublication(o.publishDate)){u.search='';u.hash='';result.set(u.href,o.title);}}catch{}}
  for(const v of Object.values(o))if(typeof v==='object'){if(Array.isArray(v))v.forEach(walk);else walk(v);}
 };walk(data.Content);return [...result];
}
async function scanReshet(env){
 const links=new Map();for(const path of ['/tags/survey/','/news/politics/politics/'])for(const [url,title]of reshetCandidates(await reshetData('https://13tv.co.il'+path)))links.set(url,title);
 const writes=[...links].slice(0,30).map(([url,title])=>env.DB.prepare("INSERT OR IGNORE INTO items(url,source,title,status,created_at) VALUES(?,'reshet',?,'queued',?)").bind(url,title.slice(0,500),Date.now()));if(writes.length)await env.DB.batch(writes);
 await env.DB.prepare('INSERT INTO sources(id,last_ok,error) VALUES(?,?,NULL) ON CONFLICT(id) DO UPDATE SET last_ok=excluded.last_ok,error=NULL').bind('reshet',Date.now()).run();return links.size;
}
export function i24Clips(article){
 if(article?.premium||article?.status!=='published'&&article?.status!=='Published'&&article?.status!==undefined)throw Error('article_not_public');
 const clips=[];const walk=o=>{if(!o||typeof o!=='object')return;if(o.type==='immergoVideo'&&!o.isLive&&typeof o.sourceUrl==='string'){const u=new URL(o.sourceUrl);if(u.protocol==='https:'&&u.hostname==='i24israel.vod.immergo.tv')clips.push(u.href);}if(Array.isArray(o.children))o.children.forEach(walk);};
 (article.parsedBody||[]).forEach(walk);if(article.videoCover)walk(article.videoCover);return [...new Set(clips)];
}
async function i24Article(url){const slug=new URL(url).pathname.match(/(artc-[a-f0-9]+)\/?$/)?.[1];if(!slug)throw Error('invalid_article');return (await get('https://api.i24news.tv/v2/he/contents/'+slug)).json();}
async function scanI24(env){
 const candidates=new Map();
 for(const category of [483,487]){
  const items=await(await get('https://api.i24news.tv/v2/he/contents?'+new URLSearchParams({category:String(category),page:'1',limit:'10',countable:'1',inSlider:'0',sort:'-sortDate'}))).json();
  if(!Array.isArray(items))throw Error('invalid_i24_feed');
  for(const item of items){if(!freshPublication(item.publishedAt))continue;try{const u=new URL(item.frontendUrl);if(u.hostname==='www.i24news.tv'&&u.pathname.startsWith('/he/news/'))candidates.set(u.href,item.title||'כתבת בחירות');}catch{}}
 }
 const writes=[...candidates].map(([url,title])=>env.DB.prepare("INSERT OR IGNORE INTO items(url,source,title,status,created_at) VALUES(?,'i24',?,'queued',?)").bind(url,title.slice(0,500),Date.now()));if(writes.length)await env.DB.batch(writes);
 await env.DB.prepare('INSERT INTO sources(id,last_ok,error) VALUES(?,?,NULL) ON CONFLICT(id) DO UPDATE SET last_ok=excluded.last_ok,error=NULL').bind('i24',Date.now()).run();return candidates.size;
}
async function scanSource(env,source){
 if(source.id==='i24')return scanI24(env);
 if(source.id==='reshet')return scanReshet(env);
 const html=await (await get(source.url)).text();const links=new Map();let current=null;let articleLinks=0;
 await new HTMLRewriter().on('a',{element(e){const raw=e.getAttribute('href');current=null;try{const u=new URL(raw,source.url);u.hash='';u.search='';if((u.hostname===source.host||u.hostname.endsWith('.'+source.host))&&source.article.test(u.pathname)){articleLinks++;current={url:u.href,title:e.getAttribute('title')||''};e.onEndTag(()=>{if(current&&relevant(current.title))links.set(current.url,current.title.trim());current=null;});}}catch{}},text(t){if(current)current.title+=t.text;}}).transform(new Response(html)).text();
 if(!articleLinks)throw Error(/We are sorry|Access Denied|Request Rejected/i.test(html)?'source_blocked':'source_requires_adapter');
 const writes=[...links].slice(0,30).map(([url,title])=>env.DB.prepare("INSERT OR IGNORE INTO items(url,source,title,status,created_at) VALUES(?,?,?,'queued',?)").bind(url,source.id,title.slice(0,500),Date.now()));if(writes.length)await env.DB.batch(writes);
 await env.DB.prepare('INSERT INTO sources(id,last_ok,error) VALUES(?,?,NULL) ON CONFLICT(id) DO UPDATE SET last_ok=excluded.last_ok,error=NULL').bind(source.id,Date.now()).run();
 return links.size;
}
export async function processItem(env,item){
 try{
  let html='',title='',date,media;
  if(item.source==='i24'){
   const article=await i24Article(item.url);title=article.title||item.title;date=article.publishedAt;
   const category=article.category;const electionCategory=[483,487,523,607].includes(category?.id)||[483,487,523,607].includes(category?.parent?.id);
   if(!electionCategory&&!relevant(title))throw Error('not_election_article');media=i24Clips(article);
  }else if(item.source==='reshet'){
   const cached=await env.DB.prepare('SELECT title,video_id,published_at FROM source_feed WHERE url=?').bind(item.url).first();
   const data=cached?{Content:{Item:{title:cached.title,secondaryTitle:'בחירות',video:{kalturaId:cached.video_id}}},PageMeta:{title:cached.title},SEO:{schema:{newsArticle:{datePublished:cached.published_at}}}}:await reshetData(item.url);const article=data.Content?.Item;title=article?.title||data.PageMeta.title||item.title;
   if(!relevant(title+' '+(article?.secondaryTitle||'')))throw Error('not_election_article');
   date=data.SEO?.schema?.newsArticle?.datePublished;
   html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{page:data}}}).replace(/</g,'\\u003c')+'</script>';
   media=await reshetMedia(html);
  }else{
   let page;try{page=await get(item.url);}catch(e){if(item.source==='n12'&&e.message==='http_403'){const mobile=new URL(item.url);mobile.hostname='mobile.mako.co.il';page=await get(mobile.href);}else throw e;}html=await page.text();title=articleTitle(html,item.title);
   if(!relevant(title)&&!(item.source==='n12'&&new URL(item.url).pathname.startsWith('/news-israel-elections/')))throw Error('not_election_article');
   date=html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1];
   media=item.source==='reshet'?await reshetMedia(html):item.source==='n12'?await makoMedia(html):item.source==='c14'?await c14Media(html):mediaFrom(html);
  }
  if(!freshPublication(date))throw Error('stale_or_missing_publication_date');
  title='פורסם ב־'+new Date(publicationMillis(date)).toLocaleDateString('he-IL',{timeZone:'Asia/Jerusalem'})+' — '+title;
  if(!media.length)throw Error('needs_source_adapter');
  const clipIndex=Number(new URL(item.url).hash.match(/^#media=(\d+)$/)?.[1]||0);if(clipIndex>=media.length)throw Error('missing_clip');
  const downloaded=await downloadMedia(media[clipIndex]);const audio=downloaded.blob;
  if(!audio.size)throw Error('empty_media');
  // A deterministic name and a global DB lease avoid duplicate uploads on retries.
  const existing=await yemot(env,'GetIVR2Dir',{path:'ivr2:1'});
  const name=recordingName(date,existing.files||[],item.file||String(item.id).padStart(6,'0')+'.wav');const path='ivr2:1/'+name;
  if(!(existing.files||[]).some(f=>f.name===name&&f.size>0)){
   const form=new FormData();form.set('token',env.YEMOT_TOKEN);form.set('path',path);form.set('convertAudio','1');form.set('fileUpload',audio,(item.source+' - '+title.replace(/[\r\n/\\]/g,' ').slice(0,160)+'.'+downloaded.extension));
   const r=await fetch('https://www.call2all.co.il/ym/api/UploadFile',{method:'POST',body:form,signal:AbortSignal.timeout(60000)});const j=await r.json();if(j.responseStatus!=='OK'||!Number(j.duration))throw Error('audio_conversion_unverified');
  }
  const verify=await yemot(env,'GetIVR2Dir',{path:'ivr2:1'});const file=(verify.files||[]).find(f=>f.name===name&&Number(f.duration)>0);if(!file)throw Error('upload_not_verified');
  await env.DB.prepare('INSERT INTO article_dates(url,published_at) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET published_at=excluded.published_at').bind(item.url,publicationMillis(date)).run();
  await env.DB.prepare("UPDATE items SET status='uploaded',error=NULL,uploaded_at=?,file=?,title=? WHERE id=?").bind(Date.now(),name,decode(title).replace(/\s+/g,' ').trim(),item.id).run();
  await syncIntros(env);
  if(item.source==='i24'&&clipIndex===0&&media.length>1){const writes=media.slice(1).map((_,i)=>{const u=new URL(item.url);u.hash='media='+String(i+1);return env.DB.prepare("INSERT OR IGNORE INTO items(url,source,title,status,created_at) VALUES(?,?,?,'queued',?)").bind(u.href,item.source,title+' — קטע '+String(i+2),Date.now());});await env.DB.batch(writes);}
 }catch(e){const retry=/http_5|http_429|timeout|fetch failed|upload_not_verified|yemot_/.test(e.message)&&item.attempts<3;await env.DB.prepare("UPDATE items SET status=?,error=?,attempts=attempts+1 WHERE id=?").bind(e.message==='needs_source_adapter'?'no_media':retry?'queued':'blocked',e.message,item.id).run();}
}
export async function archiveExpired(env){
 const expired=await env.DB.prepare("SELECT i.url,i.file FROM items i JOIN article_dates d ON d.url=i.url WHERE i.status='uploaded' AND d.published_at<? LIMIT 10").bind(Date.now()-7*86400000).all();
 const rows=expired.results.filter(x=>/^\d+\.wav$/.test(x.file||''));if(!rows.length)return 0;
 await yemot(env,'UpdateExtension',{path:'ivr2:1/_election_archive',type:'playfile',title:'ארכיון סקרים וכתבות ישנים'});
 const result=await yemot(env,'FileAction',{action:'move',target:'ivr2:1/_election_archive',...Object.fromEntries(rows.map((x,i)=>['what'+i,'ivr2:1/'+x.file]))});
 const writes=[];
 for(const row of rows){const report=(result.reports||[]).find(x=>x.success&&String(x.what).endsWith('/'+row.file));if(report)writes.push(env.DB.prepare("UPDATE items SET status='archived',file=? WHERE url=? AND status='uploaded'").bind(report.target,row.url));}
 if(writes.length){await env.DB.batch(writes);await syncIntros(env);}return writes.length;
}
export async function run(env,sourceId){
 const now=Date.now();const lease=await env.DB.prepare('UPDATE locks SET until=? WHERE id=1 AND until<?').bind(now+600000,now).run();if(!lease.meta.changes)return {busy:true};
 try{
  await archiveExpired(env);
  const stats=[];
  // Rotate through channels, staying below platform subrequest limits.
  const index=Math.floor(Date.now()/600000)%SOURCES.length;const source=SOURCES.find(s=>s.id===sourceId)||SOURCES[index];
  try{stats.push({source:source.id,found:await scanSource(env,source)});}catch(e){await env.DB.prepare('INSERT INTO sources(id,last_ok,error) VALUES(?,NULL,?) ON CONFLICT(id) DO UPDATE SET error=excluded.error').bind(source.id,e.message).run();stats.push({source:source.id,error:e.message});}
  const items=await env.DB.prepare("SELECT * FROM items WHERE status='queued' ORDER BY id ASC LIMIT 2").all();for(const item of items.results)await processItem(env,item);
  return {stats,processed:items.results.length};
 }finally{await env.DB.prepare('UPDATE locks SET until=0 WHERE id=1').run();}
}
async function collectorRoute(request,env,path){
 if(path==='/collector/source'&&request.method==='GET'){
  let target;try{target=new URL(new URL(request.url).searchParams.get('url'));}catch{return Response.json({error:'invalid_source'},{status:400});}
  const source=SOURCES.find(s=>target.hostname===s.host||target.hostname.endsWith('.'+s.host));
  const allowed=source&&(source.article.test(target.pathname)||['/','/news','/news/','/news-israel-elections','/content/kan-news/','/content/kan-news/politic/','/tags/survey/','/news/politics/politics/'].includes(target.pathname)||(source.id==='reshet'&&/^\/qdata\/(tags\/survey|news|news\/politics\/politics|item\/news\/[^?#]+)\//.test(target.pathname))||(source.id==='n12'&&target.pathname==='/AjaxPage'&&target.searchParams.get('jspName')==='playlist12.jsp'));
  if(target.protocol!=='https:'||target.username||target.password||!allowed)return Response.json({error:'unsupported_source'},{status:400});
  try{const upstream=await get(target.href);const body=await bounded(upstream,4*1024*1024);return new Response(body,{headers:{'Content-Type':upstream.headers.get('Content-Type')||'text/html; charset=utf-8','Cache-Control':'no-store'}});}catch(e){return Response.json({error:e.message},{status:502});}
 }
 if(path==='/collector/state'&&request.method==='GET'){
  const uploaded=await env.DB.prepare("SELECT url FROM items WHERE status IN ('uploaded','archived')").all();
  const seen=await env.DB.prepare("SELECT url FROM collector_checks WHERE checked_at>? AND status='no_media'").bind(Date.now()-3600000).all();
  const todo=await env.DB.prepare("SELECT url FROM items WHERE status IN ('queued','blocked','no_media') ORDER BY CASE status WHEN 'queued' THEN 0 ELSE 1 END,id DESC LIMIT 100").all();
  const feed=await env.DB.prepare('SELECT url,title,video_id,published_at FROM source_feed ORDER BY published_at DESC LIMIT 150').all();
  const reshet_items=Object.fromEntries(feed.results.map(x=>[x.url,{title:x.title,secondaryTitle:'בחירות',publishDate:x.published_at,video:{kalturaId:x.video_id}}]));
  return Response.json({uploaded:uploaded.results.map(x=>x.url),seen:seen.results.map(x=>x.url),todo:todo.results.map(x=>x.url),reshet_items});
 }
 if(path==='/collector/report'&&request.method==='POST'){
  const b=await request.json();if(!Array.isArray(b.items)||b.items.length>100)return Response.json({error:'invalid_report'},{status:400});
  const writes=[];
  for(const x of b.items){if(!sourceFor(x.url)||!['no_media','blocked'].includes(x.status))continue;writes.push(env.DB.prepare('INSERT INTO collector_checks(url,status,checked_at,error) VALUES(?,?,?,?) ON CONFLICT(url) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at,error=excluded.error').bind(x.url,x.status,Date.now(),String(x.error||'').slice(0,100)));}
  if(writes.length)await env.DB.batch(writes);return Response.json({ok:true,reported:writes.length});
 }
 if(path==='/collector/ingest'&&request.method==='POST'){
  let meta;try{meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(request.headers.get('X-Article-Meta')||''),c=>c.charCodeAt(0))));}catch{return Response.json({error:'invalid_metadata'},{status:400});}
  const source=sourceFor(meta.url);if(!source||typeof meta.title!=='string'||meta.title.length>500)return Response.json({error:'invalid_source'},{status:400});
  if(!freshPublication(meta.publishedAt))return Response.json({error:'stale_or_missing_publication_date'},{status:400});
  const now=Date.now();const lease=await env.DB.prepare('UPDATE locks SET until=? WHERE id=1 AND until<?').bind(now+600000,now).run();if(!lease.meta.changes)return Response.json({error:'busy'},{status:409});
  try{
   await env.DB.prepare("INSERT OR IGNORE INTO items(url,source,title,status,created_at) VALUES(?,?,?,'processing',?)").bind(meta.url,source.id,meta.title,now).run();
   const item=await env.DB.prepare('SELECT * FROM items WHERE url=?').bind(meta.url).first();if(item.status==='uploaded')return Response.json({ok:true,existing:true,file:item.file});
   const blob=await bounded(request,limit);if(!blob.size)throw Error('empty_media');
   const existing=await yemot(env,'GetIVR2Dir',{path:'ivr2:1'});const name=recordingName(meta.publishedAt,existing.files||[],item.file||String(item.id).padStart(6,'0')+'.wav');
   let file=(existing.files||[]).find(f=>f.name===name&&Number(f.duration)>0);
   if(!file){
    const form=new FormData();form.set('token',env.YEMOT_TOKEN);form.set('path','ivr2:1/'+name);form.set('convertAudio','1');form.set('fileUpload',blob,source.id+' - '+meta.title.replace(/[\r\n/\\]/g,' ').slice(0,120)+'.mp3');
    const r=await fetch('https://www.call2all.co.il/ym/api/UploadFile',{method:'POST',body:form,signal:AbortSignal.timeout(60000)});const j=await r.json();if(j.responseStatus!=='OK'||!Number(j.duration))throw Error('audio_conversion_unverified');
    const verify=await yemot(env,'GetIVR2Dir',{path:'ivr2:1'});file=(verify.files||[]).find(f=>f.name===name&&Number(f.duration)>0);
   }
   if(!file)throw Error('upload_not_verified');
   if(Number(meta.duration)>0&&Math.abs(Number(file.duration)-Number(meta.duration))>Math.max(2,Number(meta.duration)*0.02))throw Error('duration_mismatch');
   await env.DB.prepare('INSERT INTO article_dates(url,published_at) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET published_at=excluded.published_at').bind(meta.url,Date.parse(meta.publishedAt)).run();
   await env.DB.prepare("UPDATE items SET status='uploaded',error=NULL,title=?,file=?,uploaded_at=? WHERE id=?").bind(meta.title,name,Date.now(),item.id).run();
   await syncIntros(env);
   return Response.json({ok:true,file:name,duration:file.duration});
  }catch(e){await env.DB.prepare("UPDATE items SET status='blocked',error=? WHERE url=? AND status!='uploaded'").bind(e.message,meta.url).run();return Response.json({error:e.message},{status:502});}finally{await env.DB.prepare('UPDATE locks SET until=0 WHERE id=1').run();}
 }
 return new Response('Not found',{status:404});
}
export function sourceFor(url){try{const u=safeURL(url);if(u.hostname==='www.youtube.com'&&u.pathname==='/watch'&&/^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get('v')||'')&&u.searchParams.get('channel_id')==='UCvQmPpU20hw1Trss_CVwaew')return SOURCES.find(s=>s.id==='reshet');return SOURCES.find(s=>(u.hostname===s.host||u.hostname.endsWith('.'+s.host))&&s.article.test(u.pathname));}catch{return null;}}
export default{
 async scheduled(event,env,ctx){ctx.waitUntil(run(env));},
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(env.SOURCE_HOOK_TOKEN&&u.pathname==='/source-hook/'+env.SOURCE_HOOK_TOKEN){
   if(request.method!=='POST')return new Response('Method not allowed',{status:405});
   try{const body=await bounded(request,1048576);return Response.json(await cacheSourceFeed(env,JSON.parse(await body.text())));}catch{return Response.json({error:'invalid_source_payload'},{status:400});}
  }
  const bearer=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';const isAdmin=bearer===env.ADMIN_TOKEN;
  if(u.pathname.startsWith('/collector/')){if(!isAdmin){try{await verifyCollectorToken(bearer,env,u.origin);}catch{return new Response('Unauthorized',{status:401});}}return collectorRoute(request,env,u.pathname);}
  if(!isAdmin)return new Response('Unauthorized',{status:401});
  if(u.pathname==='/sync-intros'&&request.method==='POST')return Response.json(await syncIntros(env));
  if(u.pathname==='/run'&&request.method==='POST')return Response.json(await run(env,u.searchParams.get('source')));
  if(u.pathname==='/enqueue'&&request.method==='POST'){
   const b=await request.json();const source=SOURCES.find(s=>{try{const u=safeURL(b.url);return(u.hostname===s.host||u.hostname.endsWith('.'+s.host))&&s.article.test(u.pathname);}catch{return false;}});if(!source)return Response.json({error:'unsupported_source'},{status:400});
   await env.DB.prepare("INSERT OR IGNORE INTO items(url,source,title,status,created_at) VALUES(?,?,?,'queued',?)").bind(b.url,source.id,'בחירות',Date.now()).run();return Response.json({ok:true});
  }
  if(u.pathname==='/diagnose'){
   const urls=['https://13tv.co.il/tags/survey/','https://13tv.co.il/news/politics/','https://mobile.mako.co.il/news-israel-elections','https://www.mako.co.il/news-politics','https://www.13tv.co.il/tags/survey/','https://www.c14.co.il/','https://www.kan.org.il/content/kan-news/politic/'];
   const results=[];for(const url of urls){try{const r=await get(url);const html=await r.text();results.push({url,status:r.status,title:articleTitle(html,'none'),bytes:html.length});}catch(e){results.push({url,error:e.message});}}return Response.json(results);
  }
  if(u.pathname==='/status'){const counts=await env.DB.prepare('SELECT status,count(*) count FROM items GROUP BY status').all();const sources=await env.DB.prepare('SELECT * FROM sources').all();const items=await env.DB.prepare('SELECT title,source,status,error,file FROM items ORDER BY id DESC LIMIT 30').all();return Response.json({counts:counts.results,sources:sources.results,items:items.results});}
  return new Response('Not found',{status:404});
 }
};
