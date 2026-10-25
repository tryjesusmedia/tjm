(() => {
  // Two typographic points = 8/3 CSS pixels. Snapshot before writing to avoid inherited compounding.
  const originals=new Map();
  let queued=false;
  function resizeText(){
    queued=false;
    for(const [el,old] of originals){
      if(!el.isConnected){originals.delete(el);continue;}
      el.style.setProperty('font-size',old.value,old.priority);
    }
    const values=[];
    document.body.querySelectorAll('*').forEach(el=>{
      if(el.closest('.members-page-title, .reading-journey-link, svg') || ['SCRIPT','STYLE'].includes(el.tagName))return;
      if(!originals.has(el))originals.set(el,{value:el.style.getPropertyValue('font-size'),priority:el.style.getPropertyPriority('font-size')});
      values.push([el,parseFloat(getComputedStyle(el).fontSize)]);
    });
    for(const [el,size] of values)if(Number.isFinite(size))el.style.setProperty('font-size',(size+8/3)+'px','important');
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(resizeText);}}
  window.addEventListener('resize',schedule);
  new MutationObserver(records=>{
    if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1)))schedule();
  }).observe(document.body,{childList:true,subtree:true});
  const footer=document.querySelector('.footer-bottom');
  if(footer)new IntersectionObserver(entries=>{
    document.body.classList.toggle('credit-visible',entries[0].isIntersecting);
  }).observe(footer);
  resizeText();
})();
