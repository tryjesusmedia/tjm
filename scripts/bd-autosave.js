export class Autosave {
 constructor({rows,storage,key,save,onState,onConflict}){
  this.rows=new Map(rows.map(r=>[r.field_id,{value:r.value,revision:r.revision}]));this.pending=new Map();this.conflicts=new Map();this.storage=storage;this.key=key;this.save=save;this.onState=onState;this.onConflict=onConflict;this.running=null;this.timer=null;this.error='';
  try{for(const [id,draft] of JSON.parse(storage.getItem(key)||'[]')){const row=this.rows.get(id)||{revision:0};if(JSON.stringify(row.value)!==JSON.stringify(draft.value))this.pending.set(id,draft);}}catch{}
  this.persist();
 }
 get(id,fallback=''){return this.pending.get(id)?.value??this.rows.get(id)?.value??fallback;}
 persist(){try{if(this.pending.size)this.storage.setItem(this.key,JSON.stringify([...this.pending]));else this.storage.removeItem(this.key);}catch{this.error='This browser cannot keep an offline draft. Stay on this page until your answers save.';}this.onState?.(this);}
 change(id,value){const previous=this.pending.get(id);this.pending.set(id,{value,revision:previous?.revision??this.rows.get(id)?.revision??0,sequence:(previous?.sequence||0)+1});this.error='';this.persist();clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush();},650);}
 async flush(){
  clearTimeout(this.timer);if(this.running)return this.running;
  this.running=this.drain();await this.running;this.running=null;this.persist();return this.pending.size===0;
 }
 async drain(){
  this.error='';this.onState?.(this);
  for(const [id] of this.pending){
   if(this.conflicts.has(id))continue;
   while(this.pending.has(id)){
    const sent={...this.pending.get(id)};
    try{
     const response=await this.save(id,sent.value,sent.revision);
     this.rows.set(id,{value:sent.value,revision:response.revision});
     const latest=this.pending.get(id);
     if(latest.sequence===sent.sequence)this.pending.delete(id);else latest.revision=response.revision;
     this.persist();
    }catch(error){
     if(error.status===409&&error.current){
      if(JSON.stringify(error.current.value)===JSON.stringify(sent.value)){
       this.rows.set(id,error.current);const latest=this.pending.get(id);if(latest.sequence===sent.sequence)this.pending.delete(id);else latest.revision=error.current.revision;this.persist();continue;
      }
      this.conflicts.set(id,error.current);this.onConflict?.(id,error.current);break;
     }
     this.error=error.message||'Not saved to your account yet. Reconnect and try again.';this.persist();return false;
    }
   }
  }
  return this.pending.size===0;
 }
 resolve(id,useMine){const current=this.conflicts.get(id);if(!current)return;this.rows.set(id,current);if(useMine){this.pending.get(id).revision=current.revision;}else this.pending.delete(id);this.conflicts.delete(id);this.persist();void this.flush();}
}
