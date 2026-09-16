import Stripe from 'stripe';
import { LESSONS } from './bd-content.js';

const AUTH_URL = 'https://erejehmrtzjpqurbftsm.supabase.co';
const AUTH_KEY = 'sb_publishable_bOxmjg6RWmwfw7i7o_YhTg_zOjUt0p6';
const SITE = 'https://tryjesusmedia.com';
const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const summary = ({id,number,title,bonus,description})=>({id,number,title,bonus,description});
export class HttpError extends Error { constructor(status,message,extra={}){super(message);this.status=status;this.extra=extra;} }
const fail=(status,message,extra)=>{throw new HttpError(status,message,extra);};
export const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Authorization'}});
const normalized=email=>String(email||'').trim().toLowerCase();
const ready=env=>env.BD_CHECKOUT_ENABLED==='true'&&!!env.BD_STRIPE_KEY&&!!env.BD_STRIPE_PRICE_ID&&!!env.BD_STRIPE_WEBHOOK_SECRET&&!!env.BD_DB;
const stripe=env=>new Stripe(env.BD_STRIPE_KEY,{apiVersion:'2026-07-29.dahlia',httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:2});
export async function readBody(request,limit=24000){
 if(Number(request.headers.get('content-length')||0)>limit)fail(413,'This answer is too long. Please shorten it and try again.');
 const reader=request.body?.getReader();if(!reader)return {};
 let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'This answer is too long. Please shorten it and try again.');}chunks.push(value);}
 const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
 let body;try{body=JSON.parse(new TextDecoder().decode(data));}catch{fail(400,'Please try again. The request was not readable.');}
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Please try again. The request was not readable.');
 return body;
}
async function authenticate(request,env){
 const token=request.headers.get('authorization')||'';
 if(!/^Bearer [\w.\-]+$/.test(token)||token.length>8192)fail(401,'Please sign in to continue.');
 const response=await fetch(`${AUTH_URL}/auth/v1/user`,{headers:{apikey:AUTH_KEY,Authorization:token},signal:AbortSignal.timeout(12000)});
 if(!response.ok)fail(response.status>=500?503:401,response.status>=500?'Sign-in is temporarily unavailable. Please try again.':'Your sign-in has expired. Please sign in again.');
 const user=await response.json();
 if(!user.id||!user.email||!user.email_confirmed_at)fail(401,'Please confirm your email address before continuing.');
 if(!env.BD_DB)fail(503,'Member access is being prepared. Please try again later.');
 return user;
}
async function membership(db,user){
 // Claim once by a provider-verified email; subsequent email changes cannot transfer access.
 await db.prepare('UPDATE bd_purchases SET user_id=? WHERE user_id IS NULL AND email=? AND status=\'active\'').bind(user.id,normalized(user.email)).run();
 return !!await db.prepare("SELECT session_id FROM bd_purchases WHERE user_id=? AND status='active' LIMIT 1").bind(user.id).first();
}
async function requireLab(db,user){
 if(await db.prepare('SELECT user_id FROM bd_lab_access WHERE user_id=?').bind(user.id).first())return;
 const count=await db.prepare("SELECT count(*) AS n FROM bd_progress WHERE user_id=? AND completed=1 AND lesson_id IN ('foundations','look-for-christ','pattern-recognition','questioning-method','exegesis','bible-memorization')").bind(user.id).first();
 if(count.n!==6)fail(403,'Complete the six lessons to unlock your Study Lab.');
 await db.prepare('INSERT OR IGNORE INTO bd_lab_access(user_id) VALUES (?)').bind(user.id).run();
}
async function scopeInfo(db,user,scope){
 const lesson=LESSONS.find(l=>l.id===scope);if(lesson)return {blocks:await contentBlocks(db,lesson.id),lesson};
 if(!/^[0-9a-f-]{36}$/.test(scope))fail(404,'Study not found.');
 const study=await db.prepare('SELECT * FROM bd_studies WHERE id=? AND user_id=?').bind(scope,user.id).first();
 if(!study)fail(404,'Study not found.');
 await requireLab(db,user);return {blocks:await contentBlocks(db,'study-lab'),study};
}
async function contentBlocks(db,id){
 const row=await db.prepare('SELECT blocks FROM bd_content WHERE id=?').bind(id).first();
 if(!row)fail(503,'This workbook is being prepared. Please try again shortly.');
 return JSON.parse(row.blocks);
}
export function fieldsFor(blocks){return blocks.flatMap(b=>b.type==='grid'?b.rows.flatMap(r=>r.cells):['field','check'].includes(b.type)?[b]:[]);}
const answerRows=async(db,user,scope)=>(await db.prepare('SELECT field_id,value,revision FROM bd_answers WHERE user_id=? AND scope=?').bind(user.id,scope).all()).results.map(r=>({...r,value:JSON.parse(r.value)}));
async function rateLimit(db,key,limit){
 const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/60);
 const row=await db.prepare('INSERT INTO bd_rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(`${key}:${bucket}`,now+120).first();
 await db.prepare('DELETE FROM bd_rate_limits WHERE expires_at<?').bind(now).run();
 if(row.count>limit)fail(429,'Please wait a minute, then try again.');
}
export function validPurchase(s,env){
 return s.mode==='payment'&&s.payment_status==='paid'&&s.currency==='usd'&&s.amount_total===3700&&s.metadata?.program==='bibledecoded'&&s.livemode===(env.BD_STRIPE_LIVE_MODE==='true')&&s.line_items?.data?.length===1&&s.line_items.data[0].price?.id===env.BD_STRIPE_PRICE_ID&&s.line_items.data[0].quantity===1&&!!s.customer_details?.email;
}
async function fulfill(env,id,expectedEmail){
 const s=await stripe(env).checkout.sessions.retrieve(id,{expand:['line_items']});
 if(!validPurchase(s,env))fail(409,'Your payment has not been confirmed yet. Please check again shortly.');
 const email=normalized(s.customer_details.email);
 if(expectedEmail&&email!==normalized(expectedEmail))fail(403,'Please sign in using the email address you used at checkout.');
 const pi=typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id;
 if(!pi)fail(409,'Your payment is still being confirmed.');
 await env.BD_DB.prepare("INSERT OR IGNORE INTO bd_purchases(session_id,email,payment_intent,status) VALUES (?,?,?,CASE WHEN EXISTS(SELECT 1 FROM bd_revocations WHERE payment_intent=?) THEN 'revoked' ELSE 'active' END)").bind(s.id,email,pi,pi).run();
 return s;
}
async function webhook(request,env){
 if(!env.BD_STRIPE_KEY||!env.BD_STRIPE_WEBHOOK_SECRET||!env.BD_DB)fail(503,'Payments are not connected yet.');
 const bytes=Number(request.headers.get('content-length')||0);if(bytes>250000)fail(413,'Payload too large.');
 // Bound the raw body without parsing, preserving Stripe's signed bytes.
 const reader=request.body.getReader();const pieces=[];let total=0;
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>250000){await reader.cancel();fail(413,'Payload too large.');}pieces.push(value);}
 const raw=new Uint8Array(total);let at=0;for(const p of pieces){raw.set(p,at);at+=p.length;}
 let event;
 try{event=await stripe(env).webhooks.constructEventAsync(new TextDecoder().decode(raw),request.headers.get('stripe-signature')||'',env.BD_STRIPE_WEBHOOK_SECRET,300,Stripe.createSubtleCryptoProvider());}catch{fail(400,'Invalid webhook signature.');}
 if(event.livemode!==(env.BD_STRIPE_LIVE_MODE==='true'))fail(400,'Incorrect payment environment.');
 if(await env.BD_DB.prepare('SELECT id FROM bd_payment_events WHERE id=?').bind(event.id).first())return json({received:true});
 const object=event.data.object;
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&object.metadata?.program==='bibledecoded'&&object.payment_status==='paid')await fulfill(env,object.id);
 if((event.type==='charge.refunded'&&object.refunded)||event.type==='charge.dispute.created'){
  const pi=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id;
  if(pi)await env.BD_DB.batch([env.BD_DB.prepare('INSERT OR IGNORE INTO bd_revocations(payment_intent) VALUES (?)').bind(pi),env.BD_DB.prepare("UPDATE bd_purchases SET status='revoked' WHERE payment_intent=?").bind(pi)]);
 }
 await env.BD_DB.prepare('INSERT OR IGNORE INTO bd_payment_events(id) VALUES (?)').bind(event.id).run();return json({received:true});
}
async function videoFor(env,lesson){
 const map=JSON.parse(env.BD_VIDEOS||'{}');const v=map[lesson.id];if(!v)return null;
 if(v.provider==='youtube'&&/^[\w-]{11}$/.test(v.id))return {provider:'youtube',id:v.id};
 if(v.provider==='stream'&&/^[a-f0-9]{32}$/.test(v.id)&&env.BD_STREAM_SIGNING_JWK&&env.BD_STREAM_KEY_ID&&/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(env.BD_STREAM_HOST||'')){
  const encode=value=>btoa(typeof value==='string'?value:String.fromCharCode(...new Uint8Array(value))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const header=encode(JSON.stringify({alg:'RS256',kid:env.BD_STREAM_KEY_ID}));
  const exp=Math.floor(Date.now()/1000)+7200;
  const payload=encode(JSON.stringify({sub:v.id,kid:env.BD_STREAM_KEY_ID,exp}));
  const key=await crypto.subtle.importKey('jwk',JSON.parse(env.BD_STREAM_SIGNING_JWK),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(`${header}.${payload}`));
  return {provider:'stream',url:`https://${env.BD_STREAM_HOST}/${header}.${payload}.${encode(sig)}/iframe`,expiresAt:exp};
 }
 return null;
}
export async function handle(request,env){
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\/bibledecoded\/?/,'').replace(/\/$/,'');
 if(route==='webhook'&&request.method==='POST')return webhook(request,env);
 if(!['GET','POST','PUT'].includes(request.method))fail(405,'Method not allowed.');
 if(request.method!=='GET'){
  const origin=request.headers.get('origin');
  if(origin!==url.origin)fail(403,'Please open this page on the Try Jesus Media website.');
  if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'JSON is required.');
 }
 if(route==='config'&&request.method==='GET')return json({checkoutEnabled:ready(env),authUrl:AUTH_URL,authKey:AUTH_KEY,lessons:LESSONS.map(summary)});
 if(route==='checkout'&&request.method==='POST'){
  if(!ready(env))fail(503,'Enrollment will open soon. Please check back later.');
  await rateLimit(env.BD_DB,`checkout:${request.headers.get('cf-connecting-ip')||'unknown'}`,6);
  const body=await readBody(request);if(!/^[0-9a-f-]{36}$/.test(body.attempt||''))fail(400,'Please refresh the page and try again.');
  const session=await stripe(env).checkout.sessions.create({mode:'payment',line_items:[{price:env.BD_STRIPE_PRICE_ID,quantity:1}],success_url:`${SITE}/bibledecoded/welcome?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${SITE}/bibledecoded/?checkout=cancelled`,metadata:{program:'bibledecoded'},payment_intent_data:{metadata:{program:'bibledecoded'}},integration_identifier:'bibledecoded-cxqntzpa'},{idempotencyKey:`bibledecoded:${body.attempt}`});
  return json({url:session.url});
 }
 const user=await authenticate(request,env),db=env.BD_DB;
 if(route==='claim'&&request.method==='POST'){
  if(!env.BD_STRIPE_KEY)fail(503,'Payments are not connected yet.');
  const body=await readBody(request);if(!/^cs_(test_|live_)?[A-Za-z0-9]{10,250}$/.test(body.sessionId||''))fail(400,'Invalid purchase reference.');
  await rateLimit(db,`claim:${user.id}`,10);await fulfill(env,body.sessionId,user.email);
 }
 const member=await membership(db,user);
 if((route==='me'||route==='claim')&&(request.method==='GET'||route==='claim')){
  const progress=member?(await db.prepare('SELECT lesson_id,completed,seconds,last_field,updated_at FROM bd_progress WHERE user_id=?').bind(user.id).all()).results:[];
  let labUnlocked=false;
  if(member){try{await requireLab(db,user);labUnlocked=true;}catch(e){if(e.status!==403)throw e;}}
  const studies=labUnlocked?(await db.prepare('SELECT id,title,updated_at FROM bd_studies WHERE user_id=? ORDER BY updated_at DESC').bind(user.id).all()).results:[];
  const album=member?await db.prepare("SELECT blocks FROM bd_content WHERE id='video-album'").first():null;
  const albumUrl=album?JSON.parse(album.blocks).url:null;
  const videoAlbum=typeof albumUrl==='string'&&/^https:\/\/photos\.app\.goo\.gl\/[A-Za-z0-9]+$/.test(albumUrl)?albumUrl:null;
  return json({user:{id:user.id,email:user.email,name:String(user.user_metadata?.full_name||user.user_metadata?.name||'').slice(0,80)},member,labUnlocked,progress,studies,videoAlbum});
 }
 if(!member)fail(403,'Your account does not have Bible Decoded access yet.');
 if(route.startsWith('printable/')&&request.method==='GET'){
  const id=route.slice('printable/'.length),row=await db.prepare('SELECT printable FROM bd_content WHERE id=?').bind(id).first(),pdf=row?.printable;if(!pdf)fail(404,'Workbook not found.');
  const bytes=Uint8Array.from(atob(pdf),c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="Bible-Decoded-${id}-Workbook.pdf"`,'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
 }
 if(route==='studies'&&request.method==='POST'){
  await requireLab(db,user);await rateLimit(db,`studies:${user.id}`,10);
  const body=await readBody(request),title=String(body.title||'').trim();if(!title||title.length>120)fail(400,'Give your study a name of 1–120 characters.');
  if(!/^[0-9a-f-]{36}$/.test(body.id||''))fail(400,'Please refresh and try again.');
  await db.prepare('INSERT OR IGNORE INTO bd_studies(id,user_id,title) VALUES (?,?,?)').bind(body.id,user.id,title).run();
  const owned=await db.prepare('SELECT id,title FROM bd_studies WHERE id=? AND user_id=?').bind(body.id,user.id).first();if(!owned)fail(409,'Please try creating the study again.');return json(owned,201);
 }
 const match=route.match(/^(lesson|study|answer|progress)\/([a-z0-9-]+)$/);if(!match)fail(404,'Not found.');
 const [,kind,scope]=match,{lesson,study,blocks}=await scopeInfo(db,user,scope);
 if((kind==='lesson'&&lesson||kind==='study'&&study)&&request.method==='GET'){
  return json({lesson:lesson?{...summary(lesson),blocks}:null,study:study?{id:study.id,title:study.title,blocks}:null,answers:await answerRows(db,user,scope),video:lesson?await videoFor(env,lesson):null});
 }
 if(kind==='answer'&&request.method==='PUT'){
  const body=await readBody(request),field=fieldsFor(blocks).find(f=>f.id===body.fieldId);
  if(!field||!Number.isSafeInteger(body.revision)||body.revision<0)fail(400,'Invalid workbook field.');
  if(field.type==='check'?typeof body.value!=='boolean':typeof body.value!=='string'||body.value.length>12000)fail(400,'Please enter a valid answer of up to 12,000 characters.');
  const row=await db.prepare(`INSERT INTO bd_answers(user_id,scope,field_id,value,revision) SELECT ?,?,?,?,1 WHERE ?=0 OR EXISTS(SELECT 1 FROM bd_answers WHERE user_id=? AND scope=? AND field_id=?) ON CONFLICT(user_id,scope,field_id) DO UPDATE SET value=excluded.value,revision=bd_answers.revision+1,updated_at=${stamp} WHERE bd_answers.revision=? RETURNING revision`).bind(user.id,scope,body.fieldId,JSON.stringify(body.value),body.revision,user.id,scope,body.fieldId,body.revision).first();
  if(!row){const current=await db.prepare('SELECT value,revision FROM bd_answers WHERE user_id=? AND scope=? AND field_id=?').bind(user.id,scope,body.fieldId).first();fail(409,'This answer was changed on another device.',{current:current?{value:JSON.parse(current.value),revision:current.revision}:{value:field.type==='check'?false:'',revision:0}});}
  if(study)await db.prepare(`UPDATE bd_studies SET updated_at=${stamp} WHERE id=? AND user_id=?`).bind(scope,user.id).run();
  return json({revision:row.revision});
 }
 if(kind==='progress'&&lesson&&request.method==='PUT'){
  const body=await readBody(request);
  if(body.completed!==undefined&&typeof body.completed!=='boolean')fail(400,'Invalid completion value.');
  if(body.seconds!==undefined&&(!Number.isFinite(body.seconds)||body.seconds<0||body.seconds>86400))fail(400,'Invalid video position.');
  if(body.lastField!==undefined&&!fieldsFor(blocks).some(f=>f.id===body.lastField))fail(400,'Invalid workbook position.');
  await db.prepare(`INSERT INTO bd_progress(user_id,lesson_id,completed,seconds,last_field) VALUES (?,?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=COALESCE(?,completed),seconds=COALESCE(?,seconds),last_field=COALESCE(?,last_field),updated_at=${stamp}`).bind(user.id,scope,body.completed?1:0,body.seconds||0,body.lastField||'',body.completed===undefined?null:body.completed?1:0,body.seconds??null,body.lastField??null).run();
  try{await requireLab(db,user);}catch(e){if(e.status!==403)throw e;}return json({saved:true});
 }
 fail(405,'Method not allowed.');
}
