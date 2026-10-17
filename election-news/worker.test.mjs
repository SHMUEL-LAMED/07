import test from 'node:test';
import assert from 'node:assert/strict';
import {relevant,mediaFrom,run} from './worker.mjs';
test('select Israeli election items and exclude foreign elections',()=>{assert.equal(relevant('סקר מנדטים: הבחירות לכנסת'),true);assert.equal(relevant('סקר מזג אוויר'),false);assert.equal(relevant('בחירות בצרפת'),false);assert.equal(relevant('דיווח על תאונה'),false)});
test('extract only editorial media and avoid ads and arbitrary embeds',()=>{
 const html='<script>ad="https://ads.example/ad.mp4"</script><iframe src="https://podcast.example/embed"></iframe><script type="application/ld+json">{"@graph":[{"@type":"VideoObject","contentUrl":"https://cdn.example/poll.mp4"}]}</script><video><source src="https://cdn.example/report.mp4?a=1&amp;b=2"></video>';
 assert.deepEqual(mediaFrom(html),['https://cdn.example/poll.mp4','https://cdn.example/report.mp4?a=1&b=2']);
});
test('no HLS playlist or DRM player is treated as a downloadable audio file',()=>{assert.deepEqual(mediaFrom('<video src="https://cdn.example/video.m3u8"></video>'),[])});
test('held lease prevents any scan/upload',async()=>{const env={DB:{prepare(){return{bind(){return{run:async()=>({meta:{changes:0}})}}}}}};assert.deepEqual(await run(env),{busy:true});});
import {reshetEntry,selectPlayback,articleTitle} from './worker.mjs';
test('extract only article video, ignoring global live players',()=>{
 const data={props:{pageProps:{page:{Content:{Item:{video:{kalturaId:'1_article'}}},config:{video:{kalturaId:'1_live'}}}}}};
 assert.equal(reshetEntry(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`),'1_article');
});
test('respect playback restrictions and DRM',()=>{
 assert.throws(()=>selectPlayback({actions:[{objectType:'block'}]}),/restricted/);
 assert.throws(()=>selectPlayback({messages:[{message:'outside region'}]}),/restricted/);
 assert.throws(()=>selectPlayback({sources:[{format:'url',drm:[{scheme:'widevine'}]}]}),/no_public_download/);
});
test('choose smallest permitted ready MP4 and preserve playback URL',()=>{
 const c={sources:[{format:'url',url:'https://cdn.example/flavorIds/small,big/name/a.mp4',flavorIds:'small,big',drm:[]}],flavorAssets:[{id:'big',status:2,fileExt:'mp4',sizeInBytes:'30000000'},{id:'small',status:2,fileExt:'mp4',sizeInBytes:'2000000'},{id:'unavailable',status:2,fileExt:'mp4',sizeInBytes:'100'}]};
 assert.equal(selectPlayback(c),'https://cdn.example/flavorIds/small/name/a.mp4');
});
test('ignore generic page heading when article heading follows',()=>{assert.equal(articleTitle('<h1>N12</h1><h1>סקר מנדטים לבחירות</h1>','unknown'),'סקר מנדטים לבחירות')});
import {hlsPlaylist} from './worker.mjs';
test('choose lowest bandwidth HLS variant',()=>{assert.deepEqual(hlsPlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhigh.m3u8','https://cdn.example/master.m3u8'),{variant:'https://cdn.example/low.m3u8'})});
test('keep segment order and require finite unencrypted HLS',()=>{
 assert.deepEqual(hlsPlaylist('#EXTM3U\n#EXTINF:5,\na.ts\n#EXTINF:5,\nb.ts\n#EXT-X-ENDLIST','https://cdn.example/a/index.m3u8'),{segments:['https://cdn.example/a/a.ts','https://cdn.example/a/b.ts'],extension:'ts'});
 assert.throws(()=>hlsPlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\na.ts\n#EXT-X-ENDLIST','https://cdn.example/index.m3u8'),/encrypted/);
 assert.throws(()=>hlsPlaylist('#EXTM3U\na.ts','https://cdn.example/index.m3u8'),/live/);
});
import {c14Embed,c14Download} from './worker.mjs';
test('C14 editorial embed is found in nested JSON-LD',()=>{const j={'@graph':[{'@type':'NewsArticle',video:{'@type':'VideoObject',embedUrl:'https://snippet.univtec.com/player.html?data-guid=test'}}]};assert.equal(c14Embed(`<script type="application/ld+json">${JSON.stringify(j)}</script>`),'https://snippet.univtec.com/player.html?data-guid=test')});
test('C14 selects public approved low resolution media, excludes images and paid content',()=>{const c={vod:{paidType:null,approved:true,publish_status:'Processed',content:[{type:'image',format:'mp4',resolution:'100x100',downloadUrl:'https://channel14.vod.immergo.tv/image.mp4'},{type:'video',format:'mp4',resolution:'1280x720',downloadUrl:'https://channel14.vod.immergo.tv/large.mp4'},{type:'video',format:'mp4',resolution:'640x360',downloadUrl:'https://channel14.vod.immergo.tv/small.mp4'}]}};assert.equal(c14Download(c),'https://channel14.vod.immergo.tv/small.mp4');assert.throws(()=>c14Download({vod:{...c.vod,paidType:'subscription'}}),/restricted/)});
import {i24Clips} from './worker.mjs';
test('i24 uses original editorial video only, excludes live and foreign hosts',()=>{const a={status:'published',premium:false,parsedBody:[{type:'paragraph',children:[{type:'immergoVideo',sourceUrl:'https://i24israel.vod.immergo.tv/clip/master.m3u8',isLive:false}]},{type:'immergoVideo',sourceUrl:'https://ads.example/ad.mp4',isLive:false},{type:'immergoVideo',sourceUrl:'https://i24israel.vod.immergo.tv/live.m3u8',isLive:true}]};assert.deepEqual(i24Clips(a),['https://i24israel.vod.immergo.tv/clip/master.m3u8']);assert.throws(()=>i24Clips({...a,premium:true}),/not_public/)});
import {processItem} from './worker.mjs';
test('retry of an existing i24 upload creates remaining clip jobs without uploading twice',async()=>{
 const previous=globalThis.fetch;let uploads=0;const writes=[],batches=[];
 const env={YEMOT_TOKEN:'test',DB:{
  prepare(sql){return{bind(...args){return{sql,args,async run(){writes.push({sql,args});return{};}};}};},
  async batch(statements){batches.push(...statements);return[];}
 }};
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://api.i24news.tv/'))return Response.json({title:'סקר מנדטים',category:{id:487},publishedAt:new Date().toISOString(),status:'published',premium:false,parsedBody:[{type:'immergoVideo',sourceUrl:'https://i24israel.vod.immergo.tv/first.mp4',isLive:false},{type:'immergoVideo',sourceUrl:'https://i24israel.vod.immergo.tv/second.mp4',isLive:false}]});
  if(String(url).startsWith('https://i24israel.vod.immergo.tv/'))return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'video/mp4'}});
  if(String(url).endsWith('/UploadFile')){uploads++;throw Error('duplicate_upload')}
  if(String(url).endsWith('/GetIVR2Dir'))return Response.json({responseStatus:'OK',files:[{name:'000004.wav',size:100,duration:10}]});
  throw Error('unexpected_url');
 };
 try{await processItem(env,{id:4,url:'https://www.i24news.tv/he/news/israel-elections-2026/polls/artc-abcd',source:'i24',title:'test',attempts:0});}finally{globalThis.fetch=previous;}
 assert.equal(uploads,0);assert.equal(batches.length,1);assert.match(batches[0].args[0],/#media=1$/);assert.equal(writes.some(x=>x.sql.includes("status='uploaded'")),true);
});
import {reshetCandidates} from './worker.mjs';
test('Reshet discovers current election reports using subtitle and drops archive entries',()=>{const p={Content:{PageGrid:[{posts:[{link:'/item/news/politics/politics/one-12345/',title:'נתניהו נחלש',secondaryTitle:'סקר מנדטים',publishDate:new Date().toISOString()},{link:'/item/news/politics/politics/old-12345/',title:'סקר מנדטים ישן',publishDate:'2020-01-01'},{link:'https://foreign.example/item/news/1',title:'סקר מנדטים',publishDate:new Date().toISOString()}]}]}};assert.deepEqual(reshetCandidates(p),[['https://13tv.co.il/item/news/politics/politics/one-12345/','נתניהו נחלש']])});
import handler from './worker.mjs';
test('authenticated source relay rejects arbitrary hosts, credentials and non-source paths',async()=>{
 for(const target of ['https://127.0.0.1/','https://www.mako.co.il.attacker.example/','https://www.mako.co.il/admin','https://user:pass@www.c14.co.il/','http://www.c14.co.il/']){
  const request=new Request('https://ivr.example/collector/source?url='+encodeURIComponent(target),{headers:{Authorization:'Bearer test-admin'}});
  const response=await handler.fetch(request,{ADMIN_TOKEN:'test-admin'},{});assert.equal(response.status,400,target);
 }
});
test('source relay returns only bounded public source response and never forwards authorization',async()=>{
 const original=globalThis.fetch;let headers;
 globalThis.fetch=async(url,options)=>{headers=options.headers;assert.equal(url,'https://13tv.co.il/qdata/tags/survey/?qdata=json');return new Response('{"Content":{}}',{headers:{'Content-Type':'application/json'}})};
 try{const request=new Request('https://ivr.example/collector/source?url='+encodeURIComponent('https://13tv.co.il/qdata/tags/survey/?qdata=json'),{headers:{Authorization:'Bearer test-admin'}});const response=await handler.fetch(request,{ADMIN_TOKEN:'test-admin'},{});assert.equal(response.status,200);assert.equal((await response.json()).Content.constructor,Object);assert.equal(headers.Authorization,undefined);}finally{globalThis.fetch=original;}
});
import {sourceFor} from './worker.mjs';
test('YouTube fallback source accepts only the pinned broadcaster channel and valid video ID',()=>{
 assert.equal(sourceFor('https://www.youtube.com/watch?v=RHmIAyFAlPo&channel_id=UCvQmPpU20hw1Trss_CVwaew').id,'reshet');
 for(const url of ['https://www.youtube.com/watch?v=RHmIAyFAlPo&channel_id=other','https://www.youtube.com/watch?v=bad&channel_id=UCvQmPpU20hw1Trss_CVwaew','https://www.youtube.com.attacker.example/watch?v=RHmIAyFAlPo&channel_id=UCvQmPpU20hw1Trss_CVwaew'])assert.equal(sourceFor(url),undefined);
});
