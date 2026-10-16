const ISSUER='https://token.actions.githubusercontent.com';
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
let cached=null;
export async function verifyCollectorToken(token,env,audience){
 if(!env.COLLECTOR_REPO||!env.COLLECTOR_REPO_ID)throw Error('collector_not_configured');
 if(token.length>20000)throw Error('invalid_token');
 const parts=token.split('.');if(parts.length!==3)throw Error('invalid_token');
 const header=JSON.parse(new TextDecoder().decode(bytes(parts[0])));const claims=JSON.parse(new TextDecoder().decode(bytes(parts[1])));
 const now=Date.now()/1000;
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==ISSUER||claims.aud!==audience||!Number.isFinite(claims.exp)||claims.exp<=now||claims.nbf>now+60||claims.iat>now+60)throw Error('invalid_token');
 if(String(claims.repository_id)!==String(env.COLLECTOR_REPO_ID)||claims.repository?.toLowerCase()!==env.COLLECTOR_REPO.toLowerCase()||claims.ref!=='refs/heads/main'||claims.workflow_ref?.toLowerCase()!==`${env.COLLECTOR_REPO}/.github/workflows/election-news.yml@refs/heads/main`.toLowerCase())throw Error('wrong_workflow');
 if(!cached||cached.expires<Date.now()||!cached.keys.some(k=>k.kid===header.kid)){
  const r=await fetch(ISSUER+'/.well-known/jwks',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('jwks_unavailable');const j=await r.json();cached={keys:j.keys||[],expires:Date.now()+600000};
 }
 const jwk=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('unknown_signer');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('bad_signature');
 return claims;
}
