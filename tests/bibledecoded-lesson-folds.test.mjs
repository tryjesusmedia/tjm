import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {load} from 'cheerio';

const source = fs.readFileSync(new URL('../bibledecoded/assets/lesson-folds.js', import.meta.url), 'utf8');

// Run the shipped script against real parsed markup, with a small DOM adapter.
function dashboard(score, earned = score >= 90, readyState = 'complete') {
  const $ = load(`<div id="app"><article class="lesson-card">
    <div class="card-status"><span class="number">01</span></div>
    <h3>Foundations</h3><span class="lesson-status">${earned ? '✓ Completed' : 'In progress'}</span>
    ${score === null ? '' : `<span class="dashboard-quiz-score">Quiz: ${score}%</span>`}
    <a href="/bibledecoded/lesson/?lesson=foundations">Open Workbook</a>
  </article></div>`);
  const wrap = node => node && ({
    node,
    get textContent() { return $(node).text(); },
    set textContent(value) { $(node).text(value); },
    set className(value) { $(node).attr('class', value); },
    get parentElement() { return wrap($(node).parent()[0]); },
    classList: {add: name => $(node).addClass(name)},
    setAttribute: (name, value) => $(node).attr(name, value),
    matches: selector => $(node).is(selector),
    querySelector: selector => wrap($(node).find(selector)[0]),
    querySelectorAll: selector => $(node).find(selector).toArray().map(wrap),
    append: (...children) => children.forEach(child => $(node).append(child.node)),
    prepend: child => $(node).prepend(child.node),
    before: child => $(node).before(child.node),
  });
  let start, notify;
  vm.runInNewContext(source, {
    document: {
      readyState,
      getElementById: id => wrap($('#' + id)[0]),
      createElement: tag => wrap($(`<${tag}></${tag}>`)[0]),
      addEventListener: (_event, callback) => { start = callback; },
    },
    queueMicrotask: callback => callback(),
    MutationObserver: class {
      constructor(callback) { notify = callback; }
      observe() {}
    },
  });
  start?.();
  notify(); // Repeated notifications must not duplicate or remove the check.
  return $;
}

test('lesson row checkmarks reflect saved quiz scores on load and reload', () => {
  for (const readyState of ['loading', 'complete']) {
    for (const score of [null, 0, 89, 90, 100]) {
      for (let reload = 0; reload < 2; reload++) {
        const $ = dashboard(score, score >= 90, readyState);
        const check = $('.lesson-fold-toggle .lesson-fold-check');
        assert.equal(check.length, 1);
        assert.equal(check.hasClass('is-complete'), score >= 90, `score ${score}`);
        assert.equal(check.text(), score >= 90 ? '✓' : '');
        assert.equal(check.attr('aria-label'), score >= 90 ? 'Completed' : 'Not yet completed');
        assert.equal($('.lesson-fold-score').text(), `Quiz: ${score ?? 0}%`);
        assert.equal($('details.lesson-fold').length, 1);
        assert.equal($('.lesson-card a').attr('href'), '/bibledecoded/lesson/?lesson=foundations');
      }
    }
  }
});

test('a score label alone cannot award completion', () => {
  const $ = dashboard(100, false);
  assert.equal($('.lesson-fold-check').hasClass('is-complete'), false);
});
