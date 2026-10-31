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
 sendMail:false,
 verify:(token,env,audience)=>newsVideoAuth(token,{COLLECTOR_REPO:'SHMUEL-LAMED/07',COLLECTOR_REPO_ID:'1390638770'},audience),
 google:(env,url,options)=>gapi(env,url,options),
 storeVideo:async(env,{name,bytes,day})=>{
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(day))throw Error('invalid_video_day');
  const root=await driveFolder(env,'כתבות וידאו — עדכונים');
  const query="name='"+day+"' and '"+root+"' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false";
  const found=await gapi(env,'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(query)+'&fields=files(id)');
  let folder=found.files?.[0]?.id;
  if(!folder)folder=(await gapi(env,'https://www.googleapis.com/drive/v3/files',{body:{name:day,mimeType:'application/vnd.google-apps.folder',parents:[root]}})).id;
  if(!folder)throw Error('daily_folder_not_confirmed');
  return driveUpload(env,{name,mime:'video/mp4',bytes,folder});
 },
 loadVideo:async(env,id)=>{
  const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{Authorization:'Bearer '+await accessToken(env)}});
  if(!response.ok)throw Error('drive_download_'+response.status);
  return new Uint8Array(await response.arrayBuffer());
 },
});
export default {...originalMailWorker,async fetch(request,env,ctx){
 if(new URL(request.url).pathname.startsWith('/news-video/'))return newsVideoMail(request,env);
 return originalMailWorker.fetch(request,env,ctx);
}};
'''.replace('AUTH',auth).replace('BRIDGE',bridge)
output=Path(sys.argv[1]) if len(sys.argv)>1 else root/'live/mail/worker.generated.mjs'
output.write_text(base.replace('export default {','const originalMailWorker = {')+'\n'+wrapper)
print(output)
