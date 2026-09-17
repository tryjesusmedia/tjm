import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../scripts/bd-app.js',import.meta.url),'utf8');
test('Save & Continue preserves the chosen completion checkbox state',async()=>{
 for(const checked of [false,true]){
  const button={};let saved,notified=false;
  const context=vm.createContext({
   $:selector=>selector==='#completed'?{checked}:button,
   autosave:{flush:async()=>true},scope:'foundations',lesson:{number:1},next:{id:'look-for-christ'},ROOT:'/bibledecoded/',
   api:async(path,method,body)=>{saved=body.completed;},notifyProgressChanged(){notified=true;},
   saveVideoPosition:async()=>{},location:{assign(){}},lessonLink:()=>'/next',tell(message){throw Error(message);},
  });
  vm.runInContext(source.slice(source.indexOf('  $("#finish-lesson").onclick ='),source.indexOf('  if (data.video) await mountVideo')),context);
  await button.onclick();
  assert.equal(saved,checked);assert.equal(notified,true);
 }
});
test('a restored or separate tab rechecks current Study Lab access',async()=>{
 const listeners={};let reloaded=0;
 const context=vm.createContext({
  me:{member:true,labUnlocked:true},page:'complete',
  api:async()=>({member:true,labUnlocked:false}),
  location:{reload(){reloaded++;}},
  window:{addEventListener:(name,fn)=>listeners[name]=fn},
  document:{hidden:false,addEventListener:(name,fn)=>listeners[name]=fn},
 });
 vm.runInContext(source.slice(source.indexOf('function notifyProgressChanged('),source.indexOf('async function boot()')),context);
 await context.refreshLabAccess();assert.equal(reloaded,1);
 listeners.pageshow({persisted:true});await new Promise(setImmediate);assert.equal(reloaded,2);
 listeners.storage({key:'bd-progress-changed'});await new Promise(setImmediate);assert.equal(reloaded,3);
 listeners.visibilitychange();await new Promise(setImmediate);assert.equal(reloaded,4);
});
