import test from 'node:test';
import assert from 'node:assert/strict';
import {spokenIntro,isPoliticalPoll,cleanSpokenTitle} from './worker.mjs';
test('Gregorian title dates are not spoken before the Hebrew-dated article',()=>{
 const s=spokenIntro({source:'n12',title:'פורסם ב־25.10.2026 — ראיון מיוחד 25/10/2026',published_at:Date.parse('2026-10-25T10:00:00Z')});
 assert.doesNotMatch(s,/2026|25\.10|25\/10|פורסם ב/);assert.match(s,/חשוון|חשון/);
});
test('exit polls are eligible only after the polling stations close',()=>{
 const real=Date.now;try{
 Date.now=()=>Date.parse('2026-10-27T21:59:59+02:00');assert.equal(isPoliticalPoll('מדגם הבחירות של חדשות 12'),false);
 Date.now=()=>Date.parse('2026-10-27T22:00:00+02:00');assert.equal(isPoliticalPoll('מדגם הבחירות של חדשות 12'),true);
 }finally{Date.now=real;}
});
