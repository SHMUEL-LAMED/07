import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCollectorToken} from './collector-auth.mjs';
const env={COLLECTOR_REPO:'SHMUEL-LAMED/07',COLLECTOR_REPO_ID:'1390638770'};
const audience='https://collector.example';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
test('GitHub OIDC accepts only a signed token for the exact repository, main branch and workflow',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='collector-test';
 const previous=globalThis.fetch;globalThis.fetch=async url=>{assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');return Response.json({keys:[jwk]})};
 const claims={iss:'https://token.actions.githubusercontent.com',aud:audience,exp:Date.now()/1000+300,iat:Date.now()/1000-1,repository:'SHMUEL-LAMED/07',repository_id:'1390638770',ref:'refs/heads/main',workflow_ref:'SHMUEL-LAMED/07/.github/workflows/election-news.yml@refs/heads/main'};
 const token=async(changes={},alg='RS256')=>{const h=encode({alg,kid:jwk.kid}),p=encode({...claims,...changes}),sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+Buffer.from(sig).toString('base64url')};
 try{
  assert.equal((await verifyCollectorToken(await token(),env,audience)).repository_id,'1390638770');
  for(const changes of [{aud:'wrong'},{repository:'attacker/repo'},{repository_id:'1'},{ref:'refs/pull/4/merge'},{workflow_ref:'SHMUEL-LAMED/07/.github/workflows/deploy.yml@refs/heads/main'},{exp:1}])await assert.rejects(()=>token(changes).then(t=>verifyCollectorToken(t,env,audience)));
  await assert.rejects(()=>token({},'HS256').then(t=>verifyCollectorToken(t,env,audience)));
  const valid=await token();await assert.rejects(()=>verifyCollectorToken(valid.slice(0,-15)+'AAAAAAAAAAAAAAA',env,audience),/signature/);
 }finally{globalThis.fetch=previous;}
});
