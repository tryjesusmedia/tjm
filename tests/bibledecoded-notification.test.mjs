import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {notifyCourseCompletion} from '../functions/_lib/bd-completion-notify.js';
import {LESSONS} from '../functions/_lib/bd-content.js';
test('completion alerts queue once, retry failures, and contain the requested contact details',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync(new URL('../migrations/0001_bibledecoded.sql',import.meta.url),'utf8'));
 const prepared=(sql,args=[])=>({bind:(...a)=>prepared(sql,a),first:async()=>db.prepare(sql).get(...args),run:async()=>db.prepare(sql).run(...args),all:async()=>({results:db.prepare(sql).all(...args)})});
 const env={BD_DB:{prepare:prepared}};
 const user={id:'student',email:'student@example.test',user_metadata:{full_name:'Test Student'}};
 let lookups=0,sent=0,accept=false;
 const phone=async()=>{lookups++;return '+12125550123';};
 const original=globalThis.fetch;
 try{
  await notifyCourseCompletion(env,user,phone);assert.equal(lookups,0);
  for(const lesson of LESSONS.filter(l=>!l.bonus))db.prepare('INSERT INTO bd_progress(user_id,lesson_id,completed) VALUES (?,?,1)').run(user.id,lesson.id);
  await notifyCourseCompletion(env,user,phone);
  assert.equal(lookups,0); // Old manual checkmarks do not qualify.
  for(const lesson of LESSONS.filter(l=>!l.bonus))db.prepare("INSERT INTO bd_answers(user_id,scope,field_id,value) VALUES (?,?,'__quiz_score','90')").run(user.id,lesson.id);
  await notifyCourseCompletion(env,user,phone);
  const row=db.prepare('SELECT * FROM bd_completion_notifications').get();
  assert.equal(row.event_sent_at,null);
  const payload=JSON.parse(row.payload);
  assert.equal(payload.contact.email,'kalmanroller@gmail.com');
  assert.equal(payload.properties.student_email,user.email);
  assert.equal(payload.properties.student_phone,'+12125550123');
  env.OMNISEND_API_KEY='test-key';env.BD_COMPLETION_NOTIFY_ENABLED='true';
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://api.omnisend.com/api/events');
   assert.equal(JSON.parse(options.body).eventID,payload.eventID);sent++;
   return new Response(null,{status:accept?202:503});
  };
  await notifyCourseCompletion(env,user,phone);
  assert.equal(db.prepare('SELECT event_sent_at FROM bd_completion_notifications').get().event_sent_at,null);
  db.prepare('UPDATE bd_completion_notifications SET lease_until=0').run();accept=true;
  await notifyCourseCompletion(env,user,phone);
  assert.ok(db.prepare('SELECT event_sent_at FROM bd_completion_notifications').get().event_sent_at);
  await notifyCourseCompletion(env,user,phone);
  assert.equal(sent,2);assert.equal(lookups,1);
 }finally{globalThis.fetch=original;db.close();}
});
