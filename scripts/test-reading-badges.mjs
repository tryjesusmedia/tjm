import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const base = new URL('../bibleandconflictoftheages/', import.meta.url);
const elements = new Map();
let focused = null;
let reducedMotion = false;
let nextTimer = 0;
const timers = new Map();
class Element {
  constructor(id) { this.id=id; this.listeners={}; this.attributes={}; this.dataset={}; this.isConnected=true; this.open=false; this.style={}; this.classes=new Set(); this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),toggle:(x,on)=>on?this.classes.add(x):this.classes.delete(x)}; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  fire(name, detail={}) { const event={target:this,preventDefault(){this.defaultPrevented=true;},...detail}; for(const fn of this.listeners[name]||[])fn(event); return event; }
  setAttribute(name,value) {this.attributes[name]=value;}
  focus(){focused=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  contains(){return false;}
  querySelectorAll(){return [];}
}
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const document={getElementById:get,body:get('body'),documentElement:get('html'),querySelectorAll:()=>[],querySelector:()=>get('replacement-trigger'),addEventListener(){}};
const window={TJM_CONFLICT_CONFIG:{},matchMedia:()=>({matches:reducedMotion}),addEventListener(){},location:{hash:''},scrollTo(){}};
const context=vm.createContext({window,document,console,URL,Map,Set,Date,setTimeout:(fn)=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),clearInterval(){},requestAnimationFrame:fn=>fn()});
for(const filename of ['reading-badges.js','badge-viewer.js'])vm.runInContext(await readFile(new URL(filename,base),'utf8'),context);
const art=window.TJMReadingBadges;
const viewer=window.TJMReadingBadgeViewer;
const dialog=get('reading-badge-viewer');
const trigger=get('original-trigger');
assert.equal(art.catalog.length,264);
assert.equal(new Set(art.catalog.map(b=>[b.motif,b.palette,b.style,b.detail].join(':'))).size,264);
for(const b of art.catalog) assert.match(art.badgeSvg(b),/viewBox="0 0 256 256"/);
viewer.open('missing',trigger);assert.equal(dialog.open,false);
viewer.open(art.catalog[4].id,trigger);
assert.equal(dialog.open,true);assert.equal(focused,get('shrink-reading-badge'));
assert.equal(get('badge-viewer-title').textContent,"Noah's ark");
assert.equal(document.body.classes.has('badge-viewer-open'),true);
get('shrink-reading-badge').fire('click');assert.equal(dialog.classes.has('is-closing'),true);
for(const [id,fn] of [...timers]){timers.delete(id);fn();}
assert.equal(dialog.open,false);assert.equal(focused,trigger);assert.equal(viewer.selectedId(),null);
viewer.open(art.catalog[55].id,trigger);const escape=dialog.fire('cancel');assert.equal(escape.defaultPrevented,true);
// Account reset must interrupt even an in-flight shrink animation.
viewer.close(true);assert.equal(dialog.open,false);assert.equal(timers.size,0);
reducedMotion=true;viewer.open(art.catalog[108].id,trigger);get('shrink-reading-badge').fire('click');assert.equal(dialog.open,false);assert.equal(timers.size,0);
trigger.isConnected=false;viewer.open(art.catalog[0].id,trigger);get('close-reading-badge').fire('click');assert.equal(focused,get('replacement-trigger'));
const source=await readFile(new URL('app.js',base),'utf8');
const instrumented=source.replace('  init();',`  window.badgeTest = {
 configure(value){plan=value;prepareChapterProgressIndex();settings=guestSettings();session={user:{id:'test-a',user_metadata:{}}};},
 setCompleted(values){chapterCompleted=new Set(values);},
 setIndex(value){currentIndex=value;},
 readings:()=>plan.readings, renderEarnedBadges, renderProgress, renderReadings, applySession,
 };`);
vm.runInContext(instrumented,context);
const app=window.badgeTest;
app.configure(JSON.parse(await readFile(new URL('data/readings.json',base),'utf8')));
assert.doesNotMatch(app.renderEarnedBadges(),/data-reading-badge=/);
for(const [i,reading] of app.readings().entries()){
 const tasks=[...reading.bibleTasks,...reading.commentaryTasks];
 app.setIndex(i);app.setCompleted(tasks.slice(0,-1).map(t=>t.progressIndex));
 assert.doesNotMatch(app.renderEarnedBadges(),/data-reading-badge=/,'Partial reading has no badge');
 app.setCompleted(tasks.map(t=>t.progressIndex));
 const gallery=app.renderEarnedBadges();assert.equal((gallery.match(/data-reading-badge=/g)||[]).length,1);
 assert.ok(gallery.includes(`data-reading-badge="${reading.id}"`));
 assert.ok(app.renderReadings().includes(`data-reading-badge="${reading.id}"`),'Completed badge sits beside the reading title');
 const progress=app.renderProgress();assert.ok(progress.indexOf('id="progress-heading"')<progress.indexOf('earned-badges'));assert.ok(progress.indexOf('earned-badges')<progress.indexOf('stat-grid'));
}
const all=app.readings().flatMap(r=>[...r.bibleTasks,...r.commentaryTasks].map(t=>t.progressIndex));app.setCompleted(all);
assert.equal((app.renderEarnedBadges().match(/data-reading-badge=/g)||[]).length,264,'Restored account gets all already-completed badges');
viewer.open(art.catalog[0].id,trigger);await app.applySession(null);
assert.equal(dialog.open,false);assert.doesNotMatch(app.renderEarnedBadges(),/data-reading-badge=/,'Sign-out clears earned display');
console.log('264 badge designs, partial/full/restored progress, reading-title and Progress placement, tap-to-shrink, Escape, reduced motion, focus return, and sign-out passed.');
