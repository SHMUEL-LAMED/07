import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVideoMailBridge,validateVideoManifest} from './video-mail-bridge.mjs';

const owner='0534169095@xn--4dbjbascrao3i.com';
function setup(){
 const values=new Map(),calls=[];
 const env={BUSINESS_EMAIL:owner,KV:{get:async k=>values.get(k)||null,put:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k)}};
 let fail=false;
 const route=createVideoMailBridge({verify:async token=>{if(token!=='valid')throw Error('bad_signature');},google:async(e,url,options)=>{
  calls.push({url,options});if(url.endsWith('/profile'))return {emailAddress:owner};
  if(url.includes('messages?q='))return {messages:[]};
  if(url.endsWith('/send')){if(fail){const e=Error('rejected');e.status=403;throw e;}return {id:'gmail-confirmed'};}
  throw Error('unexpected_google_operation');
 }});
 const request=(path,body,headers={})=>new Request('https://mail.example'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer valid',...headers},body});
 const item={id:'https://www.mako.co.il/news/Article-123.htm',title:'כתבת בחירות',publishedAt:new Date().toISOString()};
 return {env,values,calls,route,request,item,setFail:x=>fail=x};
}
test('video manifest refuses private sources, credentials, duplicate IDs and old dates',()=>{
 const s=setup();for(const id of ['http://www.mako.co.il/x','https://mako.co.il.attacker.example/x','https://u:p@www.mako.co.il/x','https://127.0.0.1/x'])assert.throws(()=>validateVideoManifest({parts:1,items:[{...s.item,id}]}));
 assert.throws(()=>validateVideoManifest({parts:1,items:[s.item,s.item]}));
 assert.throws(()=>validateVideoManifest({parts:1,items:[{...s.item,publishedAt:'2020-01-01'}]}));
});
test('unauthenticated requests never touch the mailbox',async()=>{
 const s=setup();const r=await s.route(new Request('https://mail.example/news-video/state'),s.env);assert.equal(r.status,401);assert.equal(s.calls.length,0);
});
test('owner binding prevents forwarding through another account',async()=>{
 const s=setup();s.env.BUSINESS_EMAIL='other@example.com';const r=await s.route(s.request('/news-video/state'),s.env);assert.equal(r.status,502);assert.equal(s.calls.length,0);
});
test('confirmed MP4 parts go only to the owner and retries do not resend',async()=>{
 const s=setup();const b=await (await s.route(s.request('/news-video/start',JSON.stringify({items:[s.item],parts:1})),s.env)).json();
 const video=new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]);const path=`/news-video/part/${b.id}/1`;
 const request=()=>s.request(path,video,{'Content-Type':'video/mp4','Content-Length':String(video.length)});
 const first=await (await s.route(request(),s.env)).json();assert.equal(first.complete,true);
 const again=await (await s.route(request(),s.env)).json();assert.equal(again.existing,true);
 const sends=s.calls.filter(x=>x.url.endsWith('/send'));assert.equal(sends.length,1);
 const raw=Buffer.from(sends[0].options.body.raw,'base64url').toString();assert.match(raw,new RegExp(`To: ${owner.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));assert.match(raw,/Content-Type: video\/mp4/);assert.match(raw,/Message-ID: <news-video-/);
 const state=JSON.parse(s.values.get('news-video:state'));assert.equal(state.sent[0].id,s.item.id);
});
test('failed Gmail delivery keeps the pending digest and does not mark it sent',async()=>{
 const s=setup();const b=await (await s.route(s.request('/news-video/start',JSON.stringify({items:[s.item],parts:1})),s.env)).json();s.setFail(true);
 const v=new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]);const r=await s.route(s.request(`/news-video/part/${b.id}/1`,v,{'Content-Type':'video/mp4','Content-Length':'12'}),s.env);
 assert.equal(r.status,502);assert.ok(s.values.has('news-video:pending'));assert.ok(!s.values.has('news-video:state'));
});
