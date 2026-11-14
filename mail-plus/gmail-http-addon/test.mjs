import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const {default:worker}=await import('./worker.mjs');
const base='https://mail-plus-gmail.smwlyqswkwt232.workers.dev';
let sql=[];
const env={ADDON_CLIENT_ID:'test-client',ADDON_SERVICE_ACCOUNT:'addon@example.iam.gserviceaccount.com',DB:{prepare(q){return {bind(...v){sql.push({q,v});return {all:async()=>({results:[{id:'task1',title:'<script>test</script>'}]}),run:async()=>({success:true})}}}}}};
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test';
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
async function token(email,aud){const now=Math.floor(Date.now()/1000);const data=b64({alg:'RS256',kid:'test'})+'.'+b64({iss:'https://accounts.google.com',aud,email,email_verified:true,sub:'123',exp:now+600,iat:now});return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,Buffer.from(data))).toString('base64url')}
let requests=[];
globalThis.fetch=async(url)=>{requests.push(String(url));assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]})};
const userToken=await token('smwlyqswkwt232@gmail.com','test-client');
async function event(path,extra={}){return {authorizationEventObject:{systemIdToken:await token(env.ADDON_SERVICE_ACCOUNT,base+path),userIdToken:userToken},...extra}}
async function call(path,e,config=env){return worker.fetch(new Request(base+path,{method:'POST',body:JSON.stringify(e)}),config)}
assert.equal((await call('/home',{},{})).status,503);
assert.equal((await call('/home',{})).status,401);
let r=await call('/home',await event('/home'));assert.equal(r.status,200);let text=await r.text();assert(text.includes('&lt;script&gt;'));assert(!text.includes('<script>'));
r=await call('/add',await event('/add',{commonEventObject:{formInputs:{title:{stringInputs:{value:['Follow up']}}}}}));assert.equal(r.status,200);assert(sql.some(x=>x.q.startsWith('INSERT')&&x.v[2]==='Follow up'));
await call('/done',await event('/done',{commonEventObject:{parameters:{id:'task1'}}}));assert(sql.some(x=>x.q.startsWith('UPDATE')&&x.v[1]==='smwlyqswkwt232@gmail.com'));
r=await call('/message',await event('/message'));assert((await r.json()).requesting_google_scopes);
r=await call('/home',await event('/home',{authorizationEventObject:{systemIdToken:await token(env.ADDON_SERVICE_ACCOUNT,base+'/done'),userIdToken:userToken}}));assert.equal(r.status,401);
assert(requests.every(x=>x==='https://www.googleapis.com/oauth2/v3/certs'));
console.log('PASS: fail-closed setup, forged/mismatched tokens, signed owner access, escaped cards, scoped tasks, granular consent.');
