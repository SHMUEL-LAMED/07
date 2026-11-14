import test from 'node:test';
import assert from 'node:assert/strict';
import {isAppropriate,isPoliticalPoll} from './worker.mjs';

test('modesty filter blocks listed terms, also with Hebrew prefix letters',()=>{
 for(const t of ['חשד לאונס בדרום','פרשת הטרדה במשרד','תקיפה מינית בעיר','ומעשה מגונה','ובגידה בחבר'])assert.equal(isAppropriate(t),false,t);
});
test('modesty filter does not block words that only contain a term',()=>{
 for(const t of ['סקר: גוש הימין מתחזק','מפלגות הימין והמרכז','שכר המינימום עולה','ביקור ברומניה','מינוי שר חדש','סקר מנדטים: הליכוד 30'])assert.equal(isAppropriate(t),true,t);
});
test('poll detection still works for right-wing bloc titles',()=>{
 assert.equal(isPoliticalPoll('סקר מנדטים: גוש הימין מקבל 62'),true);
});
