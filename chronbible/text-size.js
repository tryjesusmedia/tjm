(() => {
const menu=document.getElementById('account-menu'), profile=document.getElementById('profile-button');
const smaller=document.getElementById('text-smaller'), larger=document.getElementById('text-larger'), status=document.getElementById('text-size-status');
let level=10;try {const n=Number(localStorage.getItem('chron-text-size'));if(localStorage.getItem('chron-text-size')!==null && Number.isInteger(n))level=Math.max(0,Math.min(39,n));}catch{}
const scaleBody=window.createBodyTextScaler();let queued=false;
function apply(){
 queued=false;scaleBody(.75+level*.025);
 smaller.disabled=level===0;larger.disabled=level===39;
 const label=(level+1)+' / 40';if(status.textContent!==label)status.textContent=label;
 const nav=document.querySelector('.chron-bottom-tabs');if(nav)document.body.style.paddingBottom=(nav.getBoundingClientRect().height+16)+'px';
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(apply);}}
function change(delta){level=Math.max(0,Math.min(39,level+delta));try{localStorage.setItem('chron-text-size',String(level));}catch{}apply();}
smaller.addEventListener('click',()=>change(-1));larger.addEventListener('click',()=>change(1));
function syncMenu(){
 profile.setAttribute('aria-expanded',String(!menu.hidden));
 profile.setAttribute('aria-label',menu.hidden?'Open menu':'Close menu');
 const bottom=profile.getBoundingClientRect().bottom;
 menu.style.top=Math.max(8,bottom+8)+'px';
}
function close(){menu.hidden=true;syncMenu();}
new MutationObserver(syncMenu).observe(menu,{attributes:true,attributeFilter:['hidden']});
window.addEventListener('resize',syncMenu);
menu.addEventListener('click',e=>{if(e.target.closest('#sign-out, #header-sign-in'))close();});
syncMenu();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();profile.focus();}});
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('resize',schedule);apply();
})();