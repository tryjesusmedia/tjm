/* Compact lesson cards on the Bible Decoded dashboard only.
   Retains original card DOM, links, progress state and click handlers. */
(() => {
  'use strict';
  function compactLessons() {
    const root = document.getElementById('app');
    if (!root) return;
    root.querySelectorAll('article.lesson-card').forEach(card => {
      if (card.parentElement?.matches('details.lesson-fold')) return;
      const heading = card.querySelector('h3');
      const number = card.querySelector('.card-status .number');
      if (!heading) return;
      const details = document.createElement('details');
      details.className = 'lesson-fold';
      const summary = document.createElement('summary');
      summary.className = 'lesson-fold-toggle';
      const name = document.createElement('span');
      name.className = 'lesson-fold-name';
      if (number) {
        const num = document.createElement('span');
        num.className = 'lesson-fold-number';
        num.textContent = number.textContent;
        name.append(num);
      }
      const title = document.createElement('span');
      title.className = 'lesson-fold-title';
      title.textContent = heading.textContent;
      name.append(title);
      const chevron = document.createElement('span');
      chevron.className = 'lesson-fold-chevron';
      chevron.setAttribute('aria-hidden','true');
      chevron.textContent = '⌄';
      summary.append(name,chevron);
      card.before(details);
      details.append(summary,card);
    });
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {scheduled=false;compactLessons();});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  function start() {
    const root = document.getElementById('app');
    if (!root) return;
    compactLessons();
    new MutationObserver(schedule).observe(root,{childList:true,subtree:false});
  }
})();