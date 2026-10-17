export function publicationMillis(raw){
 if(typeof raw!=='string'||!raw.trim())return NaN;
 let value=raw.trim();
 if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value)){
  value=value.replace(' ','T');const probe=new Date(value+'Z');if(!Number.isFinite(probe.getTime()))return NaN;
  const zone=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',timeZoneName:'longOffset'}).formatToParts(probe).find(p=>p.type==='timeZoneName').value.replace('GMT','');value+=zone||'Z';
 }
 return Date.parse(value);
}
// Only original metadata from the pinned official Reshet survey feed.
export function reshetFeedItems(payload){
 const result=new Map();let visited=0;
 function walk(value,depth=0){
  if(depth>18||++visited>50000)return;
  if(typeof value==='string'){
   if(value.length>1048576)return;
   for(const line of value.split('\n')){const candidate=line.startsWith('+')&&!line.startsWith('+++')?line.slice(1):line;if(candidate.trim().startsWith('{')){try{walk(JSON.parse(candidate),depth+1);}catch{}}}
   return;
  }
  if(!value||typeof value!=='object')return;
  if(value.link&&typeof value.title==='string'&&value.video?.kalturaId){
   try{
    const url=new URL(value.link,'https://13tv.co.il');const id=value.video.kalturaId;
    const title=value.title.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const published=publicationMillis(value.publishDate);const age=Date.now()-published;
    if(url.protocol==='https:'&&!url.username&&!url.password&&['13tv.co.il','www.13tv.co.il'].includes(url.hostname)&&/^\/item\/news\/.+\d{5,}\//.test(url.pathname)&&/^[A-Za-z0-9_]+$/.test(id)&&(Number.isFinite(published)&&age>=-600000&&age<=7*86400000)&&/סקר|מנדטים|בחירות|אחוז החסימה|פריימריז/.test(title+' '+(value.secondaryTitle||''))){
     url.hostname='13tv.co.il';url.search='';url.hash='';result.set(url.href,{url:url.href,title:title.slice(0,500),id,published:String(value.publishDate||'').slice(0,50)});
    }
   }catch{}
  }
  for(const v of Object.values(value))walk(v,depth+1);
 }
 walk(payload);return [...result.values()].slice(0,150);
}
export async function cacheSourceFeed(env,payload){
 const items=reshetFeedItems(payload);const now=Date.now();const writes=[];
 for(const item of items){
  writes.push(env.DB.prepare('INSERT INTO source_feed(url,title,video_id,published_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,video_id=excluded.video_id,published_at=excluded.published_at,updated_at=excluded.updated_at').bind(item.url,item.title,item.id,item.published,now));
  writes.push(env.DB.prepare("INSERT OR IGNORE INTO items(url,source,title,status,created_at) VALUES(?,'reshet',?,'queued',?)").bind(item.url,item.title,now));
 }
 if(writes.length)await env.DB.batch(writes);
 await env.DB.prepare("INSERT INTO sources(id,last_ok,error) VALUES('reshet-hook',?,NULL) ON CONFLICT(id) DO UPDATE SET last_ok=excluded.last_ok,error=NULL").bind(now).run();
 return {ok:true,accepted:items.length};
}
