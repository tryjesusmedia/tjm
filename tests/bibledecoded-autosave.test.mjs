import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Autosave} from '../scripts/bd-autosave.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('typing during a save sends the newest answer after the in-flight write',async()=>{
 const gate=deferred(),calls=[];
 const store=new Autosave({rows:[],storage:storage(),key:'draft',save:async(id,value,revision)=>{calls.push({value,revision});if(calls.length===1)await gate.promise;return {revision:revision+1};}});
 store.change('field','first');const done=store.flush();store.change('field','newest');gate.resolve();assert.equal(await done,true);
 assert.deepEqual(calls,[{value:'first',revision:0},{value:'newest',revision:1}]);assert.equal(store.get('field'),'newest');assert.equal(store.pending.size,0);clearTimeout(store.timer);
});
test('offline drafts survive reloading and save when connectivity returns',async()=>{
 const disk=storage();const failed=new Autosave({rows:[],storage:disk,key:'draft',save:async()=>{throw new Error('Offline');}});
 failed.change('field','Keep this answer');assert.equal(await failed.flush(),false);assert.ok(disk.getItem('draft'));
 const restored=new Autosave({rows:[],storage:disk,key:'draft',save:async()=>({revision:1})});assert.equal(restored.get('field'),'Keep this answer');assert.equal(await restored.flush(),true);assert.equal(disk.getItem('draft'),null);
});
test('a lost success response reconciles with the already-saved answer',async()=>{
 const store=new Autosave({rows:[],storage:storage(),key:'draft',save:async()=>{throw Object.assign(new Error('Conflict'),{status:409,current:{value:'Saved remotely',revision:1}});}});
 store.change('field','Saved remotely');assert.equal(await store.flush(),true);assert.equal(store.conflicts.size,0);assert.equal(store.rows.get('field').revision,1);
});
test('conflicting devices require an explicit choice and preserve both versions',async()=>{
 let call=0;const store=new Autosave({rows:[{field_id:'field',value:'Old',revision:1}],storage:storage(),key:'draft',save:async(id,value,revision)=>{if(call++===0)throw Object.assign(new Error('Conflict'),{status:409,current:{value:'Other device',revision:2}});assert.equal(revision,2);return {revision:3};}});
 store.change('field','My answer');assert.equal(await store.flush(),false);assert.equal(store.get('field'),'My answer');assert.equal(store.conflicts.get('field').value,'Other device');
 store.resolve('field',true);await store.flush();assert.equal(store.pending.size,0);assert.equal(store.rows.get('field').value,'My answer');
});
test('choosing the other device answer discards only the conflicting local draft',async()=>{
 const store=new Autosave({rows:[],storage:storage(),key:'draft',save:async()=>{throw Object.assign(new Error('Conflict'),{status:409,current:{value:'Cloud choice',revision:2}});}});
 store.change('field','Local');await store.flush();store.resolve('field',false);await store.flush();assert.equal(store.get('field'),'Cloud choice');assert.equal(store.pending.size,0);
});
