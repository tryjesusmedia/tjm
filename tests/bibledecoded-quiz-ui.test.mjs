import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../scripts/bd-app.js', import.meta.url), 'utf8');
const wire = source.slice(source.indexOf('function wireLessonQuiz('), source.indexOf('function hasEarnedCompletion('));
function node() {
  const classes = new Set();
  return {
    hidden: true, disabled: false, textContent: '', listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn; },
    classList: {
      add(...names) { names.forEach(n => classes.add(n)); },
      remove(...names) { names.forEach(n => classes.delete(n)); },
      toggle(name, yes) { yes ? classes.add(name) : classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
}
function fixture(failSave = false) {
  const items = Array.from({length: 10}, () => ({answer: 0}));
  const feedback = Array.from({length: 40}, node);
  const labels = feedback.map(f => Object.assign(node(), {querySelector: () => f}));
  const fields = Array.from({length: 10}, (_, i) => Object.assign(node(), {
    querySelector: selector => labels[i * 4 + Number(selector.match(/"(\d+)"/)[1])],
  }));
  const inputs = Array.from({length: 40}, node);
  const submit = node(), result = node(), retake = node(), score = node(), toggle = node();
  score.textContent = '0%';
  const form = Object.assign(node(), {
    elements: Object.fromEntries(items.map((_, i) => ['quiz-' + i, {value: i % 2 ? '1' : '0'}])),
    reset() { Object.values(this.elements).forEach(e => e.value = ''); },
    querySelector(selector) {
      if (selector === '.quiz-submit') return submit;
      if (selector === 'input') return {focus() {}};
      return fields[Number(selector.match(/"(\d+)"/)[1])];
    },
    querySelectorAll(selector) {
      return {'fieldset': fields, '[data-choice]': labels, '.choice-feedback': feedback, 'input': inputs}[selector];
    },
  });
  const quiz = Object.assign(node(), {querySelector: () => toggle});
  const nodes = {'.lesson-quiz': quiz, '#lesson-quiz-form': form, '#retake-quiz': retake, '#quiz-score': score, '#quiz-result': result};
  let saved;
  const context = { $: s => nodes[s], scope: 'foundations', me:{progress:[]}, updateLessonCompletion(){}, notifyProgressChanged(){}, api: async (_path, _method, body) => {
    await Promise.resolve();
    if (failSave) throw Error('Offline');
    saved = body.quizAnswers.filter(answer=>answer===0).length*10;
    return {quizScore:saved,completed:saved>=90};
  }};
  vm.createContext(context);
  vm.runInContext(wire, context);
  context.wireLessonQuiz(items);
  return {form, retake, score, submit, labels, feedback, result, get saved() { return saved; }};
}
test('quiz feedback survives event.currentTarget clearing after asynchronous save', async () => {
  const f = fixture();
  const event = {currentTarget: f.form, preventDefault() {}};
  const pending = f.form.listeners.submit(event);
  event.currentTarget = null; // Browsers clear this after dispatch, before the save completes.
  await pending;
  assert.equal(f.saved, 50);
  assert.equal(f.score.textContent, '50%');
  assert.equal(f.feedback[0].textContent, '✓ Correct!');
  assert.equal(f.feedback[5].textContent, 'Incorrect');
  assert.ok(f.labels[4].classList.contains('correct-choice'));
  assert.equal(f.feedback[4].textContent, '✓ Correct answer');
  assert.equal(f.retake.hidden, false);
  assert.equal(f.submit.disabled, false);
  f.retake.listeners.click();
  assert.equal(f.score.textContent, '50%');
  assert.ok(Object.values(f.form.elements).every(e => e.value === ''));
  assert.ok(f.feedback.every(e => e.hidden));
  assert.ok(f.labels.every(e => !e.classList.contains('correct-choice')));
});
test('quiz save failure preserves last score and enables retry', async () => {
  const f = fixture(true);
  await f.form.listeners.submit({currentTarget: f.form, preventDefault() {}});
  assert.equal(f.score.textContent, '0%');
  assert.match(f.result.textContent, /not saved/);
  assert.equal(f.submit.disabled, false);
});
