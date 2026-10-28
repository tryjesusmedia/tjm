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
      const box = document.createElement('span');
      box.className = 'lesson-fold-check';
      const earned = card.querySelector('.lesson-status')?.textContent.includes('Completed');
      const scoreText = card.querySelector('.dashboard-quiz-score')?.textContent?.trim() || 'Quiz: 0%';
      const score = Number(scoreText.match(/(\\d+)\\s*%/)?.[1] || 0);
      // Completion follows the app's earned-completion status, never an editable checkbox.
      if (earned && score >= 90) {
        box.classList.add('is-complete');
        box.textContent = '✓';
        box.setAttribute('aria-label','Completed');
      } else {
        box.setAttribute('aria-label','Not yet completed');
      }
      name.prepend(box);
      const title = document.createElement('span');
      title.className = 'lesson-fold-title';
      title.textContent = heading.textContent;
      name.append(title);
      const chevron = document.createElement('span');
      chevron.className = 'lesson-fold-chevron';
      chevron.setAttribute('aria-hidden','true');
      chevron.textContent = '⌄';
      const scoreLabel = document.createElement('span');
      scoreLabel.className = 'lesson-fold-score';
      scoreLabel.textContent = scoreText;
      const meta = document.createElement('span');
      meta.className = 'lesson-fold-meta';
      meta.append(scoreLabel,chevron);
      summary.append(name,meta);
      card.before(details);
      details.append(summary,card);
    });
  }
  function foldCoaching() {
    const root = document.getElementById('app');
    const section = root?.querySelector('.coaching-invite');
    if (!section || section.closest('.coaching-fold')) return;
    const details = document.createElement('details');
    details.className = 'coaching-fold';
    const summary = document.createElement('summary');
    summary.textContent = 'Your Next Step...';
    section.before(details);
    details.append(summary, section);
  }
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {scheduled=false;compactLessons();foldCoaching();});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  function start() {
    const root = document.getElementById('app');
    if (!root) return;
    compactLessons();
    foldCoaching();
    new MutationObserver(schedule).observe(root,{childList:true,subtree:false});
  }
})();