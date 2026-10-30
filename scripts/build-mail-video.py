#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(__file__).resolve().parent.parent
base=(root/'live/mail/base.mjs').read_text()
assert base.count('export default {')==1
auth=(root/'election-news/collector-auth.mjs').read_text().replace('export async function verifyCollectorToken','async function verifyCollectorToken')
bridge=(root/'election-news/video-mail-bridge.mjs').read_text().replace('export function ','function ')
wrapper='''
const newsVideoAuth=(()=>{AUTH;return verifyCollectorToken;})();
const newsVideoBridgeFactory=(()=>{BRIDGE;return createVideoMailBridge;})();
const newsVideoMail=newsVideoBridgeFactory({
 verify:(token,env,audience)=>newsVideoAuth(token,{COLLECTOR_REPO:'SHMUEL-LAMED/07',COLLECTOR_REPO_ID:'1390638770'},audience),
 google:(env,url,options)=>gapi(env,url,options),
});
export default {...originalMailWorker,async fetch(request,env,ctx){
 if(new URL(request.url).pathname.startsWith('/news-video/'))return newsVideoMail(request,env);
 return originalMailWorker.fetch(request,env,ctx);
}};
'''.replace('AUTH',auth).replace('BRIDGE',bridge)
output=Path(sys.argv[1]) if len(sys.argv)>1 else root/'live/mail/worker.generated.mjs'
output.write_text(base.replace('export default {','const originalMailWorker = {')+'\n'+wrapper)
print(output)
