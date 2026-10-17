import test from 'node:test';
import assert from 'node:assert/strict';
import {reshetFeedItems} from './source-feed.mjs';
test('official minified JSON diff creates only valid original metadata records',()=>{
 const current={Content:{posts:[{link:'/item/news/politics/politics/poll-123456/',title:'סקר מנדטים',publishDate:new Date().toISOString(),video:{kalturaId:'1_original'}},{link:'https://attacker.example/item/news/x-12345/',title:'סקר מנדטים',video:{kalturaId:'1_other'}}]}};
 const payload={type:'monitor.page',data:[{diff:{text:'--- old\n+++ new\n-{"Content":{"posts":[]}}\n+'+JSON.stringify(current)}}]};
 assert.deepEqual(reshetFeedItems(payload).map(x=>[x.url,x.id]),[['https://13tv.co.il/item/news/politics/politics/poll-123456/','1_original']]);
 assert.equal(reshetFeedItems({markdown:'```json\n'+JSON.stringify(current)+'\n```'}).length,1);
});
test('feed ingestion excludes private hosts, credentials, old entries, bad IDs and unrelated items',()=>{
 const base={link:'/item/news/politics/politics/poll-12345/',title:'סקר מנדטים',video:{kalturaId:'1_original'}};
 for(const x of [{...base,link:'https://127.0.0.1/item/news/poll-12345/'},{...base,link:'https://a:b@13tv.co.il/item/news/poll-12345/'},{...base,publishDate:'2020-01-01'},{...base,video:{kalturaId:'https://attacker.example'}},{...base,title:'ספורט'}])assert.deepEqual(reshetFeedItems(x),[]);
});
import {publicationMillis} from './source-feed.mjs';
test('timezone-free publisher dates are interpreted in Israel rather than as newly uploaded dates',()=>{assert.equal(publicationMillis('2026-10-16 23:13:57'),Date.parse('2026-10-16T23:13:57+03:00'));assert.equal(Number.isNaN(publicationMillis(null)),true);});
