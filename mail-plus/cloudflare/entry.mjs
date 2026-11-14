import application from '../dist/server/index.js';
import assets from './assets.generated.json';
import {verifyGoogle,GOOGLE_CLIENT_ID,OWNER_EMAIL,isAllowedEmail} from './google-auth.mjs';
export default {
  async fetch(request, env, ctx) {
    const url=new URL(request.url);
    if(url.pathname.startsWith('/bridge/')){
      const route=url.pathname.slice('/bridge'.length);
      const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
      if(route==='/config'&&request.method==='GET')return json({clientId:GOOGLE_CLIENT_ID});
      if(!['/work','/ai','/me'].includes(route))return json({error:'נתיב לא מורשה'},404);
      if((route==='/ai'&&request.method!=='POST')||!['GET','POST'].includes(request.method))return json({error:'שיטה לא מורשית'},405);
      const user=await verifyGoogle(request);if(!user)return json({error:'נדרשת כניסה מאומתת לחשבון Google שלך'},401);
      if(route==='/me')return json({email:user.email,name:user.name});
      const h=new Headers(request.headers);for(const k of [...h.keys()])if(k.toLowerCase().startsWith('oai-authenticated-'))h.delete(k);
      h.set('oai-authenticated-user-id','cf-owner:'+user.email);h.set('oai-authenticated-user-email',user.email);h.set('origin',url.origin);
      const target=new URL('/api'+route,url.origin);return application.fetch(new Request(target,{method:request.method,headers:h,body:request.method==='POST'?request.body:undefined}),env,ctx);
    }
    if(!ctx.access) return new Response('נדרשת כניסה פרטית דרך Cloudflare Access',{status:403,headers:{'Content-Type':'text/plain;charset=utf-8','Cache-Control':'no-store'}});
    const identity=await ctx.access.getIdentity();
    if(!(await isAllowedEmail(identity?.email))) return new Response('אין הרשאת גישה',{status:403});
    if(url.pathname==='/signout-with-chatgpt') return Response.redirect(url.origin+'/cdn-cgi/access/logout',302);
    if(url.pathname==='/signin-with-chatgpt') return Response.redirect(url.origin+'/',302);
    const asset=assets[url.pathname];
    if(asset){if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'Cache-Control':'private,max-age=3600','X-Content-Type-Options':'nosniff'}});}
    const headers=new Headers(request.headers);
    for(const key of [...headers.keys()])if(key.toLowerCase().startsWith('oai-authenticated-'))headers.delete(key);
    headers.set('oai-authenticated-user-id','cf-owner:'+identity.email.toLowerCase());
    headers.set('oai-authenticated-user-email',identity.email);
    if(identity.name){headers.set('oai-authenticated-user-full-name',encodeURIComponent(identity.name));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');}
    return application.fetch(new Request(request,{headers}),env,ctx);
  }
};
