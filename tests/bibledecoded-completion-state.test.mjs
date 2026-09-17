import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../scripts/bd-app.js',import.meta.url),'utf8');
test('Save & Continue never changes earned completion or reads the delayed checkbox',async()=>{
 for(const unlocked of [false,true]){
  const button={};let destination;const calls=[];
  const context=vm.createContext({
   $:selector=>{assert.notEqual(selector,'#completed');return button;},
   autosave:{flush:async()=>true},scope:'bible-memorization',lesson:{number:6},ROOT:'/bibledecoded/',me:{},
   api:async(path,method,body)=>{calls.push({path,method,body});return {labUnlocked:unlocked};},
   saveVideoPosition:async()=>{},location:{assign(value){destination=value;}},tell(message){throw Error(message);},
  });
  vm.runInContext(source.slice(source.indexOf('  $("#finish-lesson").onclick ='),source.indexOf('  if (data.video) await mountVideo')),context);
  await button.onclick();
  assert.deepEqual(calls,[{path:'me',method:undefined,body:undefined}]);
  assert.equal(destination,'/bibledecoded/'+(unlocked?'complete/':'dashboard/'));
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
