import test from 'node:test';
import assert from 'node:assert/strict';
import {isPoliticalPoll,mirrorPolls} from './poll-folder.mjs';
test('political polls exclude commentary, interviews and nonpolitical surveys',()=>{
 for(const title of ['סקר מנדטים חדש','מפת הגושים בבחירות','סקר: נתניהו מול בנט'])assert.equal(isPoliticalPoll(title),true);
 for(const title of ['בעקבות הסקר: נתניהו מגיב','ראיון עם נתניהו','סקר מזג האוויר','ניתוח הסקר לכנסת'])assert.equal(isPoliticalPoll(title),false);
});
test('group folders are never used as poll destination',async()=>{
 let calls=0;const result=await mirrorPolls({DB:{prepare(){throw Error('unexpected database access');}}},[],async()=>{calls++;return {extIni:{type:'menu',title:'הודעות הקבוצה'}};},()=> '');
 assert.deepEqual(result,{enabled:false});assert.equal(calls,1);
});
test('verified poll copies are reused and get Hebrew introductions',async()=>{
 let uploaded='';const row={url:'https://13tv.co.il/item/news/123456/',title:'סקר מנדטים',file:'123.wav'};
 const env={DB:{prepare(sql){return {run:async()=>({}),all:async()=>({results:[{url:row.url,file:row.file}]}),bind(){return {first:async()=>({file:row.file})};}};}}};
 const api=async(_,command,args)=>{
  if(command==='GetIVR2Dir')return {extIni:{type:'playfile',title:'סקרים בלבד'},files:[{name:row.file,duration:10}]};
  if(command==='GetTextFile')return {contents:''};
  if(command==='UploadTextFile'){uploaded=args.contents;return {};}
  throw Error('unexpected write '+command);
 };
 assert.equal((await mirrorPolls(env,[row],api,()=> 'סקר מתאריך עברי')).copied,0);assert.match(uploaded,/123=סקר מתאריך עברי/);
});
