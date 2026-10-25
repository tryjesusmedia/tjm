
(()=> {
const button=document.getElementById('bd-menu-toggle'), menu=document.getElementById('bd-menu');
function toggle(open){button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close menu':'Open menu');menu.hidden=!open;}
button.addEventListener('click',()=>toggle(menu.hidden));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){toggle(false);button.focus();}});
function sizeStatus(){const size=parseFloat(document.documentElement.style.fontSize)||20;document.getElementById('bd-size-status').textContent=(Math.round((size-16)/.5)+1)+' / 40';}
new MutationObserver(sizeStatus).observe(document.documentElement,{attributes:true,attributeFilter:['style']});sizeStatus();
document.getElementById('currentYear').textContent=new Date().getFullYear();
})();
