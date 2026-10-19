export function isPoliticalPoll(title){
 const t=String(title||'');
 return /סקר|מנדטים|מפת הגושים/.test(t)&&/מנדטים|מפלג|בחירות|כנסת|גושים|נתניהו|בנט|לפיד|איזנקוט/.test(t)&&!/בעקבות הסקר|בצל הסקר|תגובות לסקר|תגובה לסקר|ניתוח הסקר|מגיב לסקר/.test(t);
}
export async function mirrorPolls(env,rows,api,intro){
 const directory=await api(env,'GetIVR2Dir',{path:'ivr2:2'});
 if(directory.extIni?.type!=='playfile'||directory.extIni?.title!=='סקרים בלבד')return {enabled:false};
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS poll_copies(url TEXT PRIMARY KEY,file TEXT NOT NULL)').run();
 const existing=new Map((directory.files||[]).map(f=>[f.name,f]));
 const wanted=new Set(rows.filter(r=>isPoliticalPoll(r.title)).map(r=>r.url));
 const managed=(await env.DB.prepare('SELECT url,file FROM poll_copies').all()).results;
 let archived=0;
 for(const old of managed){
  if(wanted.has(old.url)||archived>=2)continue;
  if(existing.has(old.file)){
   await api(env,'UpdateExtension',{path:'ivr2:2/_poll_archive',type:'playfile',title:'ארכיון סקרים'});
   await api(env,'FileAction',{action:'move',what:'ivr2:2/'+old.file,target:'ivr2:2/_poll_archive'});
   const check=await api(env,'GetIVR2Dir',{path:'ivr2:2'});if((check.files||[]).some(f=>f.name===old.file))throw Error('poll_archive_not_verified');
   existing.delete(old.file);archived++;
  }
  await env.DB.prepare('DELETE FROM poll_copies WHERE url=?').bind(old.url).run();
 }

 let copied=0;const lines=[];
 for(const row of rows){
  if(!isPoliticalPoll(row.title)||!/^\d+\.wav$/.test(row.file||''))continue;
  const saved=await env.DB.prepare('SELECT file FROM poll_copies WHERE url=?').bind(row.url).first();
  if(saved?.file===row.file&&Number(existing.get(row.file)?.duration)>0){lines.push(row.file.replace(/\.wav$/,'')+'='+intro(row));continue;}
  if(existing.has(row.file)&&saved?.file!==row.file)throw Error('poll_destination_conflict');
  if(copied>=2)continue;
  const response=await fetch('https://www.call2all.co.il/ym/api/DownloadFile',{method:'POST',body:new URLSearchParams({token:env.YEMOT_TOKEN,path:'ivr2:1/'+row.file}),signal:AbortSignal.timeout(30000)});
  if(!response.ok||/json/.test(response.headers.get('Content-Type')||''))throw Error('poll_download_failed');
  const blob=await response.blob();if(!blob.size||blob.size>32*1024*1024)throw Error('poll_size_invalid');
  const form=new FormData();form.set('token',env.YEMOT_TOKEN);form.set('path','ivr2:2/'+row.file);form.set('fileUpload',blob,row.file);
  await env.DB.prepare('INSERT INTO poll_copies(url,file) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET file=excluded.file').bind(row.url,row.file).run();
  const upload=await fetch('https://www.call2all.co.il/ym/api/UploadFile',{method:'POST',body:form,signal:AbortSignal.timeout(60000)});const result=await upload.json();if(result.responseStatus!=='OK')throw Error('poll_upload_failed');
  const verify=await api(env,'GetIVR2Dir',{path:'ivr2:2'});const file=(verify.files||[]).find(f=>f.name===row.file&&Number(f.duration)>0);if(!file)throw Error('poll_copy_not_verified');
  await env.DB.prepare('INSERT INTO poll_copies(url,file) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET file=excluded.file').bind(row.url,row.file).run();
  existing.set(row.file,file);lines.push(row.file.replace(/\.wav$/,'')+'='+intro(row));copied++;
 }
 // Do not replace an existing title index while older copies are waiting in the batch.
 const current=await api(env,'GetTextFile',{what:'ivr2:2/TitleVoice.ini'});
 if(typeof current.contents!=='string')throw Error('poll_title_index_unreadable');
 const titles=new Map(String(current.contents||'').split('\n').filter(Boolean).map(line=>[line.split('=')[0],line]));for(const line of lines)titles.set(line.split('=')[0],line);
 await api(env,'UploadTextFile',{what:'ivr2:2/TitleVoice.ini',contents:[...titles.values()].join('\n')+'\n'});
 return {enabled:true,copied};
}
