import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {load} from 'cheerio';
import {onRequest} from '../functions/bibledecoded/_middleware.js';

const source=fs.readFileSync(new URL('../scripts/bd-app.js',import.meta.url),'utf8');
function fixture({study=null,unlocked=true}={}){
 const nodes=new Map();
 const app={innerHTML:''};
 let selectedData,redirect,created,scrolled=false;
 const root='/bibledecoded/';
 const studyData={study:{id:'saved-study',title:'My passage',blocks:[]},answers:[{field_id:'passage',value:'Luke 15',revision:2}]};
 const editor={innerHTML:'',querySelectorAll:()=>[]};
 const panel={dataset:{studyId:study||'new-study'},open:false,querySelector:()=>editor,addEventListener(){}};
 const list={lastElementChild:panel,insertAdjacentHTML(){}};
 const $=selector=>{
  if(selector==='#app')return app;
  if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',value:'My new study',querySelector:()=>list,querySelectorAll:()=>study?[panel]:[],scrollIntoView(){scrolled=true;}});
  return nodes.get(selector);
 };
 const context=vm.createContext({
  $,ROOT:root,params:new URLSearchParams(study?{study}:{}),
  me:{labUnlocked:unlocked,user:{name:'Member',email:'member@example.test'},studies:[]},
  location:{hash:'#study-lab',assign(value){redirect=value;},replace(value){redirect=value;}},
  crypto:{randomUUID:()=> 'new-study'},esc:value=>String(value),scope:null,currentBlocks:null,
  studyLink:id=>root+'complete/?study='+encodeURIComponent(id)+'#study-lab',
  lessonLink:id=>root+'lesson/?lesson='+id,
  studyList:()=>'<ul class="study-list"><li>Saved studies</li></ul>',
  coachingInvite:()=>'<section class="coaching-invite">Book a call</section>',
  renderWorkbook:()=>'<div class="workbook-layout"></div>',
  clearCompletionReveals(){},revealCompletion(){},
  hasEarnedCompletion:p=>Boolean(p?.quiz_passed||p?.quiz_score>=90),
  wireSignout(){},connectWorkbook(data){selectedData=data;},
  api:async(path,method,body)=>{if(path==='studies'){created=body;return {id:'new-study'};}assert.equal(path,'study/'+(study||'new-study'));return studyData;},
  tell(message){throw Error(message);},
 });
 vm.runInContext(source.slice(source.indexOf('function studyPanel('),source.indexOf('function notifyProgressChanged(')),context);
 return {context,app,$,panel,editor,get selectedData(){return selectedData;},get redirect(){return redirect;},get created(){return created;},get scrolled(){return scrolled;}};
}
test('completion includes a single Study Lab below the call with an in-page button',async()=>{
 const f=fixture();await f.context.completion();
 const html=load(f.app.innerHTML);
 assert.equal(html('#study-lab').length,1);
 assert.equal(html('#study-lab').prev().hasClass('coaching-invite'),true);
 assert.equal(html('a').filter((_,a)=>html(a).text()==='Open my Study Lab →').attr('href'),'#study-lab');
 assert.equal(html('.bd-congratulations').length,0);
 assert.match(f.$('#study-lab-content').innerHTML,/My Bible Studies/);
 assert.equal(f.scrolled,true);
 const button={disabled:false};
 await f.$('#new-study').onsubmit({preventDefault(){},currentTarget:{querySelector:()=>button}});
 assert.equal(f.created.title,'My new study');
 assert.equal(f.redirect,undefined);
 assert.equal(f.panel.open,true);
 assert.equal(f.panel.dataset.loaded,'true');
});
test('saved study answers connect to autosave within the completion page',async()=>{
 const f=fixture({study:'saved-study'});await f.context.completion();
 assert.equal(f.selectedData.answers[0].value,'Luke 15');
 assert.equal(f.panel.open,true);
 assert.match(f.editor.innerHTML,/Save my study/);
 assert.match(f.app.innerHTML,/Certificate of Completion/);
});
test('completion still requires the course to be unlocked',async()=>{
 const f=fixture({unlocked:false});await f.context.completion();
 assert.equal(f.redirect,'/bibledecoded/dashboard/');
 assert.equal(f.app.innerHTML,'');
 assert.equal(f.selectedData,undefined);
});
test('retired page URLs redirect to Study Lab and preserve saved-study identifiers',async()=>{
 for(const path of ['study-lab','study-lab/','study-lab/index.html','final-tools','final-tools/']){
  const response=await onRequest({request:new Request('https://tryjesusmedia.com/bibledecoded/'+path+'?study=existing-id'),next(){throw Error('Unexpected fallback');}});
  assert.equal(response.status,301);
  assert.equal(response.headers.get('location'),'https://tryjesusmedia.com/bibledecoded/complete/?study=existing-id#study-lab');
 }
 const response=await onRequest({request:new Request('https://tryjesusmedia.com/bibledecoded/complete/'),next:()=>new Response('keep page')});
 assert.equal(await response.text(),'keep page');
});
test('build contains neither retired pages nor the Congratulations injector',()=>{
 for(const path of ['final-tools/index.html','study-lab/index.html']){
  assert.equal(fs.existsSync(new URL('../bibledecoded/'+path,import.meta.url)),false);
 }
 const lesson=fs.readFileSync(new URL('../bibledecoded/lesson/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(lesson,/final-tools|bd-congratulations/);
});
