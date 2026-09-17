import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {load} from 'cheerio';
import {LESSONS} from '../functions/_lib/bd-content.js';

const app = fs.readFileSync(new URL('../scripts/bd-app.js', import.meta.url), 'utf8');
const animation = fs.readFileSync(new URL('../scripts/bd-completion-ui.js', import.meta.url), 'utf8').replaceAll('export ', '');
function fixture() {
  let now = 0, nextId = 0;
  const timers = new Map(), listeners = new Map(), observers = [];
  const nodes = {
    '#completed': {disabled: false, checked: false},
    '#completion-label': {textContent: ''},
    '#lesson-completion': {dataset: {}, isConnected: true},
    '.workbook-end h2': {textContent: ''},
  };
  const context = vm.createContext({
    $: selector => nodes[selector],
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, {fn, at: now + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)},
    window: {removeEventListener() {}},
    IntersectionObserver: class {
      constructor(fn, options) { this.notify = fn; this.options = options; observers.push(this); }
      observe(element) { this.element = element; }
      disconnect() { this.disconnected = true; }
    },
  });
  vm.runInContext(animation, context);
  vm.runInContext(app.slice(app.indexOf('function hasEarnedCompletion('), app.indexOf('function showSaveState(')), context);
  return {
    context, nodes, observers,
    tick(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    },
    visible(yes) { observers.at(-1).notify([{isIntersecting: yes, intersectionRatio: yes ? 1 : 0}]); },
    hidden(yes) { context.document.hidden = yes; listeners.get('visibilitychange')?.(); },
  };
}
test('earned checkbox stays disabled and waits for a full second on screen', () => {
  const f = fixture(), input = f.nodes['#completed'], label = f.nodes['#completion-label'];
  f.context.updateLessonCompletion(false);
  assert.equal(input.checked, false); assert.equal(input.disabled, true);
  assert.match(label.textContent, /90%/); assert.equal(f.observers.length, 0);
  f.context.updateLessonCompletion(true);
  assert.equal(input.checked, false); assert.equal(input.disabled, true);
  f.tick(5000); assert.equal(input.checked, false); // Passing offscreen does not start the reveal.
  f.visible(true); f.tick(999); assert.equal(input.checked, false);
  f.tick(1); assert.equal(input.checked, true); assert.equal(input.disabled, true);
  assert.equal(label.textContent, 'Lesson completed');
  assert.equal(f.nodes['#lesson-completion'].dataset.completionReveal, 'done');
  assert.equal(f.observers[0].disconnected, true);
  f.context.updateLessonCompletion(true); assert.equal(f.observers.length, 1); // A retake doesn't uncheck it.
});
test('scrolling away or hiding the tab resets the one-second reveal timer', () => {
  const f = fixture(), element = {dataset: {}, isConnected: true}; let revealed = 0;
  f.context.revealCompletion(element, () => revealed++);
  f.visible(true); f.tick(700); f.visible(false); f.tick(1000); assert.equal(revealed, 0);
  f.visible(true); f.tick(900); f.hidden(true); f.tick(5000); assert.equal(revealed, 0);
  f.hidden(false); f.tick(999); assert.equal(revealed, 0);
  f.tick(1); assert.equal(revealed, 1); assert.equal(element.dataset.completionReveal, 'done');
});
test('rerender cancels pending completion reveals', () => {
  const f = fixture(), element = {dataset: {}, isConnected: true}; let revealed = 0;
  f.context.revealCompletion(element, () => revealed++); f.visible(true);
  f.context.clearCompletionReveals(); f.tick(2000);
  assert.equal(revealed, 0); assert.equal(f.observers[0].disconnected, true);
});
test('dashboard labels and counts follow quiz-earned passes, not manual flags', () => {
  const appNode = {innerHTML: ''};
  const context = vm.createContext({
    $: () => appNode, config: {lessons: LESSONS}, ROOT: '/bibledecoded/',
    me: {user: {name: 'Member'}, labUnlocked: false, progress: [
      {lesson_id: 'foundations', completed: 1, quiz_score: 80, updated_at: '2026-01-01'},
      {lesson_id: 'look-for-christ', completed: 0, quiz_score: 90, updated_at: '2026-01-01'},
      {lesson_id: 'word-search', completed: 1, quiz_score: 100, updated_at: '2026-01-01'},
    ]},
    esc: String, lessonLink: id => id, albumLink: () => '', coachingInvite: () => '',
    clearCompletionReveals() {}, revealCompletion() {}, wireSignout() {}, document: {querySelectorAll: () => []},
  });
  vm.runInContext(app.slice(app.indexOf('function hasEarnedCompletion('), app.indexOf('let cancelLessonCompletion')), context);
  vm.runInContext(app.slice(app.indexOf('function dashboard('), app.indexOf('function studyList(')), context);
  context.dashboard();
  const html = load(appNode.innerHTML), cards = html('.lesson-card');
  assert.equal(cards.eq(0).find('.lesson-status').text(), 'In progress');
  assert.equal(cards.eq(1).find('.lesson-status').text(), '✓ Completed');
  assert.equal(cards.eq(1).find('.lesson-status').attr('data-completion-reveal'), 'pending');
  assert.equal(cards.eq(1).find('.dashboard-quiz-score').text(), 'Quiz: 90%');
  assert.equal(html('.progress-panel progress').attr('value'), '1'); // Bonus doesn't count toward the six.
});
test('bonus certificate qualification excludes old manual completion', () => {
  const f = fixture();
  vm.runInContext(app.slice(app.indexOf('function bonusCompleted('), app.indexOf('async function completion(')), f.context);
  for (const score of [null, 0, 80, 90, 100]) {
    assert.equal(f.context.bonusCompleted({progress: [{lesson_id: 'word-search', completed: 1, quiz_score: score}]}), score >= 90);
  }
  assert.equal(f.context.bonusCompleted({progress: [{lesson_id: 'word-search', quiz_score: 50, quiz_passed: 1}]}), true);
});
