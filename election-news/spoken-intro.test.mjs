import test from 'node:test';
import assert from 'node:assert/strict';
import {spokenIntro} from './worker.mjs';
test('intro uses broadcaster and original Jerusalem date, removes stored date prefix',()=>{
 const text=spokenIntro({source:'reshet',title:'פורסם ב־16.10.2026 — סקר המנדטים החדש',published_at:Date.parse('2026-10-15T22:30:00Z')});
 assert.match(text,/חדשות שלוש עשרה/);assert.match(text,/5 בחשוון 5787/);assert.match(text,/סקר המנדטים החדש/);assert.doesNotMatch(text,/פורסם ב־/);
});
test('reports are introduced as reports and invalid metadata is rejected',()=>{
 assert.match(spokenIntro({source:'kan',title:'כתבת בחירות מיוחדת',published_at:'2026-10-16T10:00:00Z'}),/האזינו לכתבה של כאן חדשות/);
 assert.throws(()=>spokenIntro({source:'reshet',title:'סקר'}));
});
