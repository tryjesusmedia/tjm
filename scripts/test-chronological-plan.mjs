import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {expand, allVerses} from './chronbible-passages.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const plan=JSON.parse(read('chronbible/data/readings.json'));
const source=JSON.parse(read('chronbible/data/google-doc-source.json'));
const legacy=JSON.parse(read('chronbible/data/legacy-v4.json'));
assert.equal(plan.planId,'chronological-bible-doc-v5');
assert.equal(plan.source.revisionId,source.revisionId);
assert.equal(plan.readings.length,313);assert.equal(plan.sections.length,11);assert.equal(plan.chapterCount,1440);
const paragraphs=source.paragraphs.map(p=>p.text);
for(const r of plan.readings){
 const i=paragraphs.indexOf(`Reading ${String(r.number).padStart(3,'0')}`);
 assert.equal(r.title,paragraphs[i+1]);assert.equal(r.reference,paragraphs[i+2]);
 assert.ok(r.title!==r.reference);assert.equal(r.index,r.number-1);
 assert.deepEqual(r.bibleTasks.flatMap(t=>expand(t.label)),expand(r.reference));
 for(const t of r.bibleTasks)assert.equal(new URL(t.url).searchParams.get('search'),t.label);
 for(const t of r.guidance)assert.ok(paragraphs.includes(t));
 assert.ok(r.guidance.some(t=>t.startsWith('In this reading ')));
}
const assigned=plan.readings.flatMap(r=>expand(r.reference));
assert.equal(assigned.length,31102);assert.deepEqual(new Set(assigned),new Set(allVerses));
assert.deepEqual(plan.readings.flatMap(r=>r.bibleTasks.map(t=>t.progressIndex)),Array.from({length:1440},(_,i)=>i));
assert.deepEqual(plan.sections.map(s=>s.readingCount),[9,8,32,14,58,19,54,4,18,38,59]);
const context={};vm.runInNewContext(read('chronbible/plan-progress.js'),context);
const migrate=(row,v='v4')=>JSON.parse(JSON.stringify(context.TJMPlanProgress.migrate(plan,row,v)));
assert.deepEqual(migrate({completed_indices:[]}).completed,[]);
// John 1:1–14 must never complete the later John 1:15–51 assignment.
const oldJohn=legacy.readings[216].bibleTasks.find(t=>t.label==='John 1').progressIndex;
const migrated=migrate({completed_indices:[oldJohn]});
const newJohn=plan.readings.flatMap(r=>r.bibleTasks).filter(t=>t.label.startsWith('John 1:'));
assert.ok(migrated.completed.includes(newJohn.find(t=>t.label==='John 1:1-14').progressIndex));
assert.ok(!migrated.completed.includes(newJohn.find(t=>t.label==='John 1:15-51').progressIndex));
// Old Acts 20:1–3 belongs partly before Corinthians and partly after Romans now.
const oldActs=legacy.readings[277].bibleTasks[0].progressIndex;
const acts=migrate({completed_indices:[oldActs],last_index:277});
assert.ok(!acts.completed.includes(plan.readings[283].bibleTasks[0].progressIndex));
assert.equal(acts.lastIndex,272);
for(const v of ['v1','v2','v3']) {
 const result=migrate({completed_indices:[0],last_index:0},v);
 assert.ok(result.completed.every(i=>i>=0&&i<1440));assert.ok(result.lastIndex>=0&&result.lastIndex<313);
}
const before=JSON.stringify(legacy);migrate({completed_indices:Array.from({length:1205},(_,i)=>i)});assert.equal(JSON.stringify(legacy),before);
const app=read('chronbible/app.js');
assert.match(app,/isCurrentSession\(userId, version\)/);
assert.match(app,/data-reading-complete/);assert.match(app,/renderReadingGuide/);assert.match(app,/get_chronbible_doc_leaderboard/);
assert.match(read('chronbible/config.js'),/chronological-bible-doc-v5/);
console.log('Document parity, 31,102 unique verses, 1,440 exact passage links, and conservative v1–v4 progress migration passed.');
