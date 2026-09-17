import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {load} from 'cheerio';
import {LESSON_QUIZZES} from '../scripts/bd-quizzes.js';
import {quizChoiceOrder} from '../scripts/bd-quiz-order.js';
import {gradeQuiz} from '../functions/_lib/bd-quiz-progress.js';

function randomSequence(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
test('all seven quizzes mix answer positions without changing the answer key or scoring', () => {
  const original = JSON.stringify(LESSON_QUIZZES);
  assert.equal(Object.keys(LESSON_QUIZZES).length, 7);
  for (const [id, items] of Object.entries(LESSON_QUIZZES)) {
    const random = randomSequence(24), attempts = new Set(), positionsByQuestion = items.map(() => new Set());
    for (let attempt = 0; attempt < 40; attempt++) {
      const order = quizChoiceOrder(items, random), counts = [0, 0, 0, 0];
      attempts.add(JSON.stringify(order));
      order.forEach((choices, index) => {
        assert.deepEqual([...choices].sort(), [0, 1, 2, 3]);
        const position = choices.indexOf(items[index].answer);
        counts[position]++;
        positionsByQuestion[index].add(position);
      });
      assert.ok(counts.every(count => count >= 2 && count <= 3), id);
      const correctSelections = order.map((choices, index) => choices.find(choice => choice === items[index].answer));
      assert.equal(gradeQuiz(id, correctSelections), 100);
      correctSelections[0] = order[0].find(choice => choice !== items[0].answer);
      assert.equal(gradeQuiz(id, correctSelections), 90);
      correctSelections[1] = order[1].find(choice => choice !== items[1].answer);
      assert.equal(gradeQuiz(id, correctSelections), 80);
      assert.ok(gradeQuiz(id, order.map(choices => choices[0])) <= 30);
    }
    assert.equal(attempts.size, 40);
    assert.ok(positionsByQuestion.every(positions => positions.size === 4), id);
  }
  assert.equal(JSON.stringify(LESSON_QUIZZES), original);
});

test('rendered radio values and labels retain the correct answer identities in every quiz', () => {
  const source = fs.readFileSync(new URL('../scripts/bd-app.js', import.meta.url), 'utf8');
  const context = vm.createContext({quizChoiceOrder, esc: text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;')});
  vm.runInContext(source.slice(source.indexOf('function lessonQuizHTML('), source.indexOf('function wireLessonQuiz(')), context);
  for (const items of Object.values(LESSON_QUIZZES)) {
    const html = load(context.lessonQuizHTML(items, 90)), counts = [0, 0, 0, 0];
    assert.equal(html('fieldset').length, 10);
    html('fieldset').each((questionIndex, fieldset) => {
      html(fieldset).find('[data-choice]').each((position, label) => {
        const value = Number(html(label).find('input').attr('value'));
        assert.equal(html(label).attr('data-choice'), String(value));
        assert.equal(html(label).find('.choice-copy').text(), items[questionIndex].choices[value]);
        if (value === items[questionIndex].answer) counts[position]++;
      });
    });
    assert.ok(counts.every(count => count >= 2 && count <= 3));
    assert.equal(html('#quiz-score').text(), '90%');
  }
});
