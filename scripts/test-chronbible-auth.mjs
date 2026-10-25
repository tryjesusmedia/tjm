import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { Window } = await import(process.env.AUTH_TEST_DOM_MODULE || 'happy-dom');
const window = new Window({ url:'https://tryjesusmedia.com/chronbible/' });
const html = await readFile(new URL('../chronbible/index.html',import.meta.url),'utf8');
window.document.body.innerHTML = html.slice(html.indexOf('<body'),html.indexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g,'');
window.eval(await readFile(new URL('../chronbible/auth-ui.js',import.meta.url),'utf8'));
const el=id=>window.document.getElementById(id);
let session=null, apiError=null, calls=[];
const db={auth:new Proxy({}, {get:(_,name)=>async (...args)=>{calls.push({name,args});return {data:{session:null},error:apiError};}})};
const ui=window.TJMChronBibleAuth.create(db,'https://tryjesusmedia.com/chronbible/',()=>session);
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
const submit=async()=>{el('email-auth-form').dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();};
ui.open();
assert.equal(el('auth-gate').hidden,false);
el('auth-email').value='reader@example.com';el('auth-password').value='test-password';await submit();
assert.equal(calls.at(-1).name,'signInWithPassword');assert.equal(el('auth-password').value,'');assert.equal(el('auth-gate').hidden,true);
ui.open();el('email-auth-toggle').click();el('auth-email').value='reader@example.com';el('auth-password').value='abcde';const beforeShort=calls.length;await submit();assert.equal(calls.length,beforeShort,'Five-character signup must be blocked');
el('auth-password').value='abcdef';await submit();
assert.equal(calls.at(-1).args[0].password,'abcdef');assert.equal(calls.at(-1).name,'signUp');assert.match(el('auth-message').textContent,/confirm/);assert.equal(el('auth-gate').hidden,false);
ui.open();el('email-auth-reset').click();el('auth-email').value='reader@example.com';await submit();
assert.equal(calls.at(-1).name,'resetPasswordForEmail');assert.match(calls.at(-1).args[1].redirectTo,/next=recovery/);assert.match(el('auth-message').textContent,/If this email has an account/);
ui.open();el('apple-sign-in').click();await settle();assert.equal(calls.at(-1).name,'signInWithOAuth');assert.equal(calls.at(-1).args[0].provider,'apple');
session={user:{id:'existing-user',email:'existing@example.com'}};
ui.open();assert.equal(el('email-auth-form').hidden,true);el('apple-sign-in').click();await settle();assert.equal(calls.at(-1).name,'linkIdentity');
ui.authChanged('PASSWORD_RECOVERY',session);assert.equal(el('email-auth-form').hidden,false);assert.equal(el('email-address-field').hidden,true);
el('auth-password').value='abcdef';el('auth-confirm').value='does-not-match';await submit();assert.match(el('auth-error').textContent,/do not match/);
el('auth-confirm').value='abcdef';await submit();assert.equal(calls.at(-1).name,'updateUser');assert.match(el('auth-message').textContent,/Password saved/);assert.equal(el('auth-password').value,'');
for (const [failure, expected] of [
  [{code:'same_password'}, /already your password/],
  [{code:'weak_password',message:'Password should be at least 12 characters.'}, /requires at least 12 characters/],
  [{code:'weak_password',reasons:['pwned']}, /known data breach/],
  [{code:'reauthentication_needed'}, /sign out, sign in again/],
]) {
  apiError=failure;ui.authChanged('PASSWORD_RECOVERY',session);el('auth-password').value='abcdef';el('auth-confirm').value='abcdef';await submit();assert.match(el('auth-error').textContent,expected);assert.equal(ui.busy(),false);
}
ui.authChanged('SIGNED_OUT',null);session=null;ui.open();apiError=new Error('private provider error');el('auth-email').value='reader@example.com';el('auth-password').value='wrong';await submit();assert.match(el('auth-error').textContent,/Sign-in failed/);assert.doesNotMatch(el('auth-error').textContent,/private provider/);assert.equal(ui.busy(),false);
await window.happyDOM.abort();
console.log('ChronBible forms passed: email sign-in, confirmation, reset, Apple OAuth, account linking, password validation, credential clearing and safe errors.');
