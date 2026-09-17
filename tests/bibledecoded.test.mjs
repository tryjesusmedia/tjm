import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {onRequest} from '../functions/api/bibledecoded/[[path]].js';
import {fieldsFor,validPurchase,omnisendPurchasePayload} from '../functions/_lib/bd-api.js';
import {LESSONS} from '../functions/_lib/bd-content.js';

let db,env,realFetch;
const people={alice:{id:'alice',email:'alice@example.test',email_confirmed_at:'2026-01-01'},bob:{id:'bob',email:'bob@example.test',email_confirmed_at:'2026-01-01'},unconfirmed:{id:'unconfirmed',email:'alice@example.test'}};
function prepared(sql,values=[]){return {bind:(...args)=>prepared(sql,args),first:async()=>db.prepare(sql).get(...values)||null,all:async()=>({results:db.prepare(sql).all(...values)}),run:async()=>({meta:db.prepare(sql).run(...values)})};}
beforeEach(()=>{
 db=new DatabaseSync(':memory:');for(const file of ['0001_bibledecoded.sql','0002_private_course_content.sql'])db.exec(fs.readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 // Synthetic content only; the production workbooks are never checked into Git.
 for(const item of [...LESSONS,{id:'study-lab'}])db.prepare('INSERT INTO bd_content(id,blocks,printable) VALUES (?,?,?)').run(item.id,JSON.stringify([{type:'field',id:item.id==='study-lab'?'passage':'test-answer',text:'Fixture answer'}]),Buffer.from('%PDF-1.4\nfixture').toString('base64'));
 env={BD_DB:{prepare:sql=>prepared(sql),batch:async statements=>{db.exec('BEGIN');try{const results=await Promise.all(statements.map(s=>s.run()));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 realFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://erejehmrtzjpqurbftsm.supabase.co/auth/v1/user');const person=people[options.headers.Authorization.replace('Bearer ','')];return Response.json(person||{}, {status:person?200:401});};
});
afterEach(()=>{globalThis.fetch=realFetch;db.close();});
function grant(person='alice'){db.prepare("INSERT INTO bd_purchases(session_id,email,status) VALUES (?,?,'active')").run('manual-'+person,people[person].email);}
async function request(path,{person='alice',method='GET',body,origin='https://tryjesusmedia.com'}={}){
 const headers={};if(person)headers.Authorization='Bearer '+person;if(method!=='GET'){headers.Origin=origin;headers['Content-Type']='application/json';}
 return onRequest({env,request:new Request('https://tryjesusmedia.com/api/bibledecoded/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})});
}
async function data(path,options){const response=await request(path,options);assert.equal(response.status,200,await response.clone().text());return response.json();}
const first=LESSONS[0],field={id:'test-answer',type:'field'};

test('public configuration exposes only lesson summaries and checkout remains disabled',async()=>{
 const config=await data('config',{person:null});assert.equal(config.checkoutEnabled,false);assert.equal(config.lessons.length,7);assert.ok(config.lessons.every(l=>!l.blocks));
 assert.equal((await request('checkout',{person:null,method:'POST',body:{attempt:crypto.randomUUID()}})).status,503);
});
test('sign-in, confirmed email and membership are all required for private content',async()=>{
 grant();for(const path of ['lesson/'+first.id,'printable/'+first.id,'study/00000000-0000-0000-0000-000000000000']){
  assert.equal((await request(path,{person:null})).status,401);
  assert.equal((await request(path,{person:'invalid'})).status,401);
  assert.equal((await request(path,{person:'unconfirmed'})).status,401);
  assert.equal((await request(path,{person:'bob'})).status,403);
 }
 assert.equal((await data('me',{person:'bob'})).member,false);assert.equal((await data('me')).member,true);
});
test('claimed access cannot move to another account with the same email',async()=>{
 grant();await data('me');const original=people.bob.email;people.bob.email=people.alice.email;
 try{assert.equal((await data('me',{person:'bob'})).member,false);}finally{people.bob.email=original;}
});
test('video album is returned only to entitled members',async()=>{
 db.prepare('INSERT INTO bd_content(id,blocks) VALUES (?,?)').run('video-album',JSON.stringify({url:'https://photos.app.goo.gl/ExampleAlbum123'}));
 assert.equal((await data('me',{person:'bob'})).videoAlbum,null);
 assert.equal(JSON.stringify(await data('config',{person:null})).includes('ExampleAlbum123'),false);
 grant();assert.equal((await data('me')).videoAlbum,'https://photos.app.goo.gl/ExampleAlbum123');
 db.prepare("UPDATE bd_content SET blocks=? WHERE id='video-album'").run(JSON.stringify({url:'javascript:alert(1)'}));
 assert.equal((await data('me')).videoAlbum,null);
});
test('workbook answers persist and stale writes return the saved revision instead of overwriting it',async()=>{
 grant();const save=(value,revision)=>request('answer/'+first.id,{method:'PUT',body:{fieldId:field.id,value,revision}});
 assert.deepEqual(await (await save('First answer',0)).json(),{revision:1});
 assert.equal((await save('Stale answer',0)).status,409);
 assert.deepEqual(await (await save('Revised answer',1)).json(),{revision:2});
 const conflict=await save('Overwrite attempt',1);assert.equal(conflict.status,409);assert.deepEqual((await conflict.json()).current,{value:'Revised answer',revision:2});
 assert.deepEqual((await data('lesson/'+first.id)).answers,[{field_id:field.id,value:'Revised answer',revision:2}]);
 grant('bob');assert.deepEqual((await data('lesson/'+first.id,{person:'bob'})).answers,[]);
});
test('malformed, oversized and unknown workbook fields are rejected without writing',async()=>{
 grant();for(const body of [null,[],{fieldId:'fake',value:'x',revision:0},{fieldId:field.id,value:true,revision:0},{fieldId:field.id,value:'x',revision:-1}])assert.equal((await request('answer/'+first.id,{method:'PUT',body})).status,400);
 assert.equal((await request('answer/'+first.id,{method:'PUT',body:{fieldId:field.id,value:'x'.repeat(30000),revision:0}})).status,413);
 assert.equal(db.prepare('SELECT count(*) AS n FROM bd_answers').get().n,0);
 assert.equal((await request('answer/'+first.id,{method:'PUT',origin:'https://other.example',body:{fieldId:field.id,value:'x',revision:0}})).status,403);
});
test('six lessons unlock studies, bonus is optional and studies remain private',async()=>{
 grant();grant('bob');const id=crypto.randomUUID();
 assert.equal((await request('studies',{method:'POST',body:{id,title:'Genesis 22'}})).status,403);
 for(const lesson of LESSONS.filter(l=>!l.bonus))await data('progress/'+lesson.id,{method:'PUT',body:{completed:true}});
 assert.equal((await data('me')).labUnlocked,true);
 assert.equal((await request('studies',{method:'POST',body:{id,title:'Genesis 22'}})).status,201);
 assert.equal((await data('study/'+id)).study.title,'Genesis 22');
 await data('answer/'+id,{method:'PUT',body:{fieldId:'passage',value:'Genesis 22:1-14',revision:0}});
 assert.equal((await data('study/'+id)).answers[0].value,'Genesis 22:1-14');
 assert.equal((await request('study/'+id,{person:'bob'})).status,404);
 assert.equal((await request('answer/'+id,{person:'bob',method:'PUT',body:{fieldId:'passage',value:'other',revision:0}})).status,404);
 for(const lesson of LESSONS.filter(l=>!l.bonus)){
  await data('progress/'+lesson.id,{method:'PUT',body:{completed:false}});
  const locked=await data('me');assert.equal(locked.labUnlocked,false);assert.deepEqual(locked.studies,[]);
  assert.equal((await request('study/'+id)).status,403);
  assert.equal((await request('studies',{method:'POST',body:{id:crypto.randomUUID(),title:'Blocked'}})).status,403);
  assert.equal((await request('answer/'+id,{method:'PUT',body:{fieldId:'passage',value:'blocked change',revision:1}})).status,403);
  await data('progress/'+lesson.id,{method:'PUT',body:{completed:true}});
  assert.equal((await data('me')).labUnlocked,true);
  assert.equal((await data('me')).studies[0].title,'Genesis 22');
  assert.equal((await data('study/'+id)).answers[0].value,'Genesis 22:1-14');
 }
});
test('progress updates preserve completion when saving video or workbook position',async()=>{
 grant();await data('progress/'+first.id,{method:'PUT',body:{completed:true}});
 await data('progress/'+first.id,{method:'PUT',body:{seconds:42}});
 await data('progress/'+first.id,{method:'PUT',body:{lastField:field.id}});
 const progress=(await data('me')).progress[0];assert.equal(progress.completed,1);assert.equal(progress.seconds,42);assert.equal(progress.last_field,field.id);
});
test('quiz scores save per lesson and expose only the latest percentage',async()=>{
 grant();
 let me=await data('me');assert.equal(me.progress.length,0);
 await data('progress/'+first.id,{method:'PUT',body:{quizScore:70}});
 me=await data('me');assert.equal(me.progress[0].quiz_score,70);
 await data('progress/'+first.id,{method:'PUT',body:{quizScore:90}});
 me=await data('me');assert.equal(me.progress[0].quiz_score,90);
 assert.deepEqual((await data('lesson/'+first.id)).answers,[]);
 for(const quizScore of [-10,101,75.5,'80'])assert.equal((await request('progress/'+first.id,{method:'PUT',body:{quizScore}})).status,400);
});
test('printables are real PDFs behind membership and revocation removes access',async()=>{
 grant();for(const lesson of LESSONS){const response=await request('printable/'+lesson.id);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.text()).slice(0,5),'%PDF-');}
 db.prepare("UPDATE bd_purchases SET status='revoked'").run();assert.equal((await request('lesson/'+first.id)).status,403);assert.equal((await request('printable/'+first.id)).status,403);
});
test('a claimed payment must match price, total, currency, mode and environment',()=>{
 env.BD_STRIPE_PRICE_ID='price_test';const paid={mode:'payment',payment_status:'paid',currency:'usd',amount_total:3700,metadata:{program:'bibledecoded'},livemode:false,line_items:{data:[{price:{id:'price_test'},quantity:1}]},customer_details:{email:'alice@example.test'}};
 assert.equal(validPurchase(paid,env),true);
 for(const change of [{payment_status:'unpaid'},{currency:'cad'},{amount_total:1},{livemode:true},{mode:'subscription'},{metadata:{program:'other'}},{line_items:{data:[{price:{id:'other'},quantity:1}]}}])assert.equal(validPurchase({...paid,...change},env),false);
});
test('Omnisend purchase events include SMS only after explicit checkout consent',async()=>{
 const base={id:'cs_live_example',created:1789574400,amount_total:3700,currency:'usd',customer_details:{email:' Buyer@Example.com ',name:'Mary Jones',phone:'+13155550123'},custom_fields:[]};
 const emailOnly=await omnisendPurchasePayload(base);
 assert.equal(emailOnly.contact.email,'buyer@example.com');assert.equal(emailOnly.contact.firstName,'Mary');assert.equal(emailOnly.contact.lastName,'Jones');assert.equal(emailOnly.contact.phone,undefined);assert.equal(emailOnly.properties.sms_consent,false);
 const optedIn=await omnisendPurchasePayload({...base,custom_fields:[{key:'sms_consent',type:'dropdown',dropdown:{value:'yes'}}]});
 assert.equal(optedIn.contact.phone,'+13155550123');assert.equal(optedIn.contact.consents[0].channel,'sms');assert.equal(optedIn.properties.sms_consent,true);assert.equal(optedIn.eventID,emailOnly.eventID);
});
test('unsigned webhook requests never grant membership',async()=>{
 env.BD_STRIPE_KEY='sk_test_fixture';env.BD_STRIPE_WEBHOOK_SECRET='fixture-secret';
 assert.equal((await request('webhook',{person:null,method:'POST',body:{type:'checkout.session.completed',data:{object:{payment_status:'paid'}}}})).status,400);
 assert.equal(db.prepare('SELECT count(*) AS n FROM bd_purchases').get().n,0);
});
