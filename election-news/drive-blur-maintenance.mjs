// Authenticated, one-time replacement limited to the five owner-selected videos.
export const driveBlurFiles = ['1rDhBSHYbgYhX43oApu7XW9Q2Zb2fGqYn','15kq6-aPWIJE4rYoLQ5GgDBEPDUtZACQT','1Y15dd7yvUerMTQprpvSMmUl64lBksg3O','1Owz-STPGGUEAqbmtUR522TlpympTx2PT','1sV_kL2chdt5UUM6qILTWHOYvAQGFrKNq','1jOaK1Qf9iwTx2xf0qb0QUsEJpZNNu0RL','1Uca0MYjykTL5ozeSy9HqkSaTKgp8M1bD','18odiR4or56Kg6H3bS4FjwLOvj4nMFjq5','1CqkkKAtiMaVNSKxwJff0FBh-pHB-sqFJ'];
export function createDriveBlurMaintenance({verify,read,replace}) {
 return async(request,env)=>{
  const url=new URL(request.url),id=url.pathname.split('/').pop();
  const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  try {await verify(request.headers.get('Authorization')?.replace(/^Bearer /,''),env,url.origin);} catch {return reply({error:'unauthorized'},401);}
  if(!driveBlurFiles.includes(id))return reply({error:'file_not_allowed'},403);
  try {
   if(request.method==='GET'){
    const {bytes,etag}=await read(env,id);
    return new Response(bytes,{headers:{'Content-Type':'video/mp4','Cache-Control':'no-store','X-Drive-ETag':etag}});
   }
   if(request.method==='POST'){
    if(request.headers.get('X-News-Filter')!=='women-body-v1')return reply({error:'filtered_video_required'},409);
    const etag=request.headers.get('X-Drive-ETag');if(!etag||etag.length>200)return reply({error:'original_version_required'},400);
    const length=Number(request.headers.get('Content-Length'));if(!length||length>50*1024*1024)return reply({error:'video_size'},413);
    const bytes=new Uint8Array(await request.arrayBuffer());
    if(bytes.length!==length||bytes.length<12||new TextDecoder().decode(bytes.subarray(4,8))!=='ftyp')return reply({error:'invalid_mp4'},400);
    const result=await replace(env,id,bytes,etag);
    if(result.id!==id)throw Error('replacement_not_confirmed');
    return reply({ok:true,id,version:result.version,size:result.size});
   }
   return reply({error:'method_not_allowed'},405);
  } catch(error){return reply({error:String(error.message).slice(0,180)},502);}
 };
}
