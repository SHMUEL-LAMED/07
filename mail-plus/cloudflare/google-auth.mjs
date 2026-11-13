export const GOOGLE_CLIENT_ID='65416227927-2ddta5uc73ibtkjhqhuafdg0fnej6c1t.apps.googleusercontent.com';
export const OWNER_EMAIL='smwlyqswkwt232@gmail.com';
let cachedKeys=null,keysUntil=0;
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function verifyGoogle(request){
 const token=(request.headers.get('authorization')||'').match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];if(!token||token.length>10000)return null;
 try{const parts=token.split('.');if(parts.length!==3)return null;const h=JSON.parse(new TextDecoder().decode(decode(parts[0]))),c=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Date.now()/1000;
 if(h.alg!=='RS256'||!h.kid||!["https://accounts.google.com","accounts.google.com"].includes(c.iss)||c.aud!==GOOGLE_CLIENT_ID||!Number.isFinite(c.exp)||c.exp<=now||!Number.isFinite(c.iat)||c.iat>now+60||typeof c.sub!=='string'||!c.sub||c.email_verified!==true||String(c.email).toLowerCase()!==OWNER_EMAIL)return null;
 if(!cachedKeys||keysUntil<Date.now()||!cachedKeys.some(k=>k.kid===h.kid)){const r=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(8000)});if(!r.ok)return null;cachedKeys=(await r.json()).keys;keysUntil=Date.now()+300000;}
 const jwk=cachedKeys?.find(k=>k.kid===h.kid&&k.kty==='RSA');if(!jwk)return null;const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;return {email:OWNER_EMAIL,sub:c.sub,name:c.name||OWNER_EMAIL};
 }catch{return null;}
}
