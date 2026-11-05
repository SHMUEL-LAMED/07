import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDriveBlurMaintenance,driveBlurFiles} from './drive-blur-maintenance.mjs';
const id=driveBlurFiles[0],video=new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]);
function setup(){
 const calls=[];
 const route=createDriveBlurMaintenance({verify:async token=>{if(token!=='valid')throw Error();},read:async(e,id)=>({bytes:video,etag:'"version-1"'}),replace:async(e,id,bytes,etag)=>{calls.push({id,bytes,etag});return {id,version:'2',size:bytes.length};}});
 const request=(file=id,headers={},body)=>new Request('https://mail.example/news-video/drive-blur/'+file,{method:body?'POST':'GET',headers:{Authorization:'Bearer valid',...headers},body});
 return {route,request,calls};
}
test('maintenance rejects invalid auth and all other Drive IDs',async()=>{
 const s=setup();assert.equal((await s.route(s.request(id,{Authorization:'Bearer bad'}),{})).status,401);assert.equal((await s.route(s.request('unselected'),{})).status,403);assert.equal(s.calls.length,0);
});
test('source download includes the original version for conditional replacement',async()=>{
 const s=setup(),r=await s.route(s.request(),{});assert.equal(r.status,200);assert.equal(r.headers.get('X-Drive-ETag'),'"version-1"');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),video);
});
test('replacement requires filtering marker, original version, correct length and MP4',async()=>{
 const s=setup();
 for(const headers of [{},{'X-News-Filter':'women-body-v1'},{'X-News-Filter':'women-body-v1','X-Drive-ETag':'v1','Content-Length':'11'}])assert.notEqual((await s.route(s.request(id,headers,video),{})).status,200);
 assert.equal(s.calls.length,0);
});
test('successful replacement preserves the exact ID and original conditional version',async()=>{
 const s=setup(),r=await s.route(s.request(id,{'X-News-Filter':'women-body-v1','X-Drive-ETag':'"version-1"','Content-Length':'12'},video),{});
 assert.equal(r.status,200);assert.equal((await r.json()).id,id);assert.equal(s.calls[0].etag,'"version-1"');assert.equal(s.calls[0].id,id);
});
