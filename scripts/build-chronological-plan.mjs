// The Google Doc snapshot is the sole editorial authority. See chronbible/DEPLOYMENT.md.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expand, allVerses } from './chronbible-passages.mjs';
const dir = new URL('../chronbible/data/', import.meta.url);
const source = JSON.parse(await readFile(new URL('google-doc-source.json',dir)));
const legacy = JSON.parse(await readFile(new URL('legacy-v4.json',dir)));
assert.equal(source.documentId,'11JsQNJrr6Q4_seXuJbVr2zzXyA5esrp3ud5ixP9AbOw');
const p=source.paragraphs.map(x=>({...x,text:x.text.trim()}));
const text=p.map(x=>x.text);
const sectionStarts=text.flatMap((t,i)=>/^Section \d{2}$/.test(t)?[i]:[]);
const readingStarts=text.flatMap((t,i)=>/^Reading \d{3}$/.test(t)?[i]:[]);
assert.equal(sectionStarts.length,11); assert.equal(readingStarts.length,313);
const blocks=(start,end)=>p.slice(start,end).filter(x=>x.text);
const sections=sectionStarts.map((start,i)=>{
 const end=sectionStarts[i+1]??text.indexOf('People and places');
 const first=readingStarts.find(x=>x>start), reflect=text.findIndex((t,j)=>j>start&&j<end&&/^Reflect on Section/.test(t));
 return {id:`section-${String(i+1).padStart(2,'0')}`,number:i+1,title:text[start+1],readingCount:readingStarts.filter(x=>x>start&&x<end).length,introduction:blocks(start+2,first),reflection:blocks(reflect+2,end)};
});
let progressIndex=0;
const readings=readingStarts.map((start,i)=>{
 const end=text.findIndex((t,j)=>j>start&&(/^Reading \d{3}$/.test(t)||/^Reflect on Section/.test(t)));
 const body=text.slice(start+3,end), sectionIndex=sectionStarts.filter(x=>x<start).length-1;
 const bibleTasks=body.filter(t=>t.startsWith('☐')&&!t.startsWith('☐ Reading complete')).flatMap(t=>t.split('☐').slice(1).map(label=>{
   label=label.trim(); return {label,url:`https://www.biblegateway.com/passage/?search=${encodeURIComponent(label)}&version=KJV`,progressIndex:progressIndex++};
 }));
 const reference=text[start+2];
 assert.deepEqual(bibleTasks.flatMap(t=>expand(t.label)),expand(reference),`Checkbox sequence ${i+1}`);
 const guidance=body.filter(t=>t&&!t.startsWith('☐')&&t!=='Notes and reflection');
 for(const prefix of ['In this reading ','As you read: ','Talk or reflect ','Try this ']) assert.equal(guidance.filter(t=>t.startsWith(prefix)).length,1,`${i+1}: ${prefix}`);
 return {id:`chron-doc-${String(i+1).padStart(3,'0')}`,index:i,number:i+1,section:sections[sectionIndex].title,title:text[start+1],reference,sourceReference:reference,bibleTasks,guidance};
});
const version=JSON.parse(await readFile(new URL('plan-version.json',dir)));
const signature=createHash('sha256').update(JSON.stringify(readings.map(r=>r.bibleTasks.map(t=>t.label)))).digest('hex');
assert.equal(signature,version.passageOrderSha256,'Passage order changed: create a new progress version and migration before publishing.');
const assigned=readings.flatMap(r=>expand(r.reference));
assert.equal(assigned.length,allVerses.length);assert.deepEqual(new Set(assigned),new Set(allVerses));
for(const r of readings) assert.ok(text.includes(`Reading ${String(r.number).padStart(3,'0')} — ${r.reference}`));
// Preserve the exact meaning of old checkmarks, including partial-chapter assignments.
const legacyTasks=legacy.readings.flatMap(r=>r.bibleTasks);
const verseToLegacy=new Map();
const fixes={'2 Kings 1-8-13; 2 Chronicles 24':'2 Kings 1-13; 2 Chronicles 24','Matthew 5-8:1-13':'Matthew 5-7; Matthew 8:1-13','Matthew 11-12:22-50':'Matthew 11; Matthew 12:22-50','John 7-9:1-41':'John 7-8; John 9:1-41','Acts 18:19-19':'Acts 18:19-28; Acts 19'};
for(const r of legacy.readings) {
 const assigned = new Set(expand(Object.entries(fixes).reduce((ref,[a,b])=>ref.replace(a,b),r.reference)));
 for(const t of r.bibleTasks) for(const v of expand(t.label).filter(v=>assigned.has(v))) {const ids=verseToLegacy.get(v)??[];ids.push(t.progressIndex);verseToLegacy.set(v,ids);}}
const v4Requirements=readings.flatMap(r=>r.bibleTasks.map(t=>[...new Set(expand(t.label).map(v=>JSON.stringify(verseToLegacy.get(v)??[])))].map(s=>JSON.parse(s))));
const v4ReadingMap=legacy.readings.map(r=>{
 const first=expand(r.bibleTasks[0].label)[0];return readings.findIndex(n=>expand(n.reference).includes(first));
});
const guide=[];
for(const [start,end] of [[11,sectionStarts[0]],[text.indexOf('People and places'),text.indexOf('Reading index')],[text.indexOf('Bible book index'),text.length]]) {
 let group;
 for(const b of blocks(start,end)) {
   if(b.style==='HEADING_1'){group={title:b.text,blocks:[]};if(b.text!=='Contents')guide.push(group);}
   else if(group)group.blocks.push(b);
 }
}
const migrationLegacy=Object.fromEntries(['previousChapterMigration','previousReadingMigration','taskChapterMigration','taskReadingMigration','originalChapterMigration','originalReadingMigration'].map(k=>[k,legacy[k]]));
const kingdoms=guide.find(g=>g.title==='The divided kingdom at a glance');
const cells=kingdoms.blocks.slice(1,19).map(b=>b.text);
assert.equal(cells[0],'Feature'); assert.equal(cells.length,18);
kingdoms.table=Array.from({length:6},(_,i)=>cells.slice(i*3,i*3+3));
kingdoms.blocks.splice(1,18);
const plan={planId:version.planId,title:text[1],description:text[4],source:{documentId:source.documentId,url:`https://docs.google.com/document/d/${source.documentId}/edit`,revisionId:source.revisionId},readingCount:readings.length,chapterCount:progressIndex,uniqueChapterCount:1189,verseCount:assigned.length,sectionCount:sections.length,sections,readings,guide,reviewQueue:[],migration:{v4Requirements,v4ReadingMap,legacy:migrationLegacy}};
await writeFile(new URL('readings.json',dir),JSON.stringify(plan,null,2)+'\n');
console.log(`Google Doc plan: ${readings.length} readings, ${progressIndex} passages, ${assigned.length} unique verses.`);
