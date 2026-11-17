/* Persistent three-tab navigation for ChronBible, Bible Decoded, and Member Resources. */
(() => {
  'use strict';
  const pathname = location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '').toLowerCase();
  const path = pathname === '/signupcomplete' ? '/welcome' : pathname;
  const spanish = path === '/es/chronbible' || path === '/es/welcome' || path === '/es/bibledecoded' || path.startsWith('/es/bibledecoded/');
  const englishBibleDecoded = path === '/bibledecoded' || path.startsWith('/bibledecoded/');
  const spanishBibleDecoded = path === '/es/bibledecoded' || path.startsWith('/es/bibledecoded/');
  const allowed =
    path === '/chronbible' ||
    path === '/welcome' ||
    path === '/es/chronbible' ||
    path === '/es/welcome' ||
    englishBibleDecoded ||
    spanishBibleDecoded;
  if (!allowed) return;

  const markup = spanish
    ? "<nav class=\"chron-bottom-tabs\" aria-label=\"Navegación principal de la aplicación\">\n    <a href=\"/es/chronbible/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 5v15M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z\"/></svg><span>ChronBible</span></a>\n    <a href=\"/es/bibledecoded/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"m10 8 6 4-6 4Z\"/></svg><span>Bible Decoded</span></a>\n    <a href=\"/es/welcome/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/></svg><span>Más recursos</span></a>\n  </nav>"
    : "<nav class=\"chron-bottom-tabs\" aria-label=\"Main app navigation\">\n    <a href=\"/chronbible/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 5v15M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z\"/></svg><span>ChronBible</span></a>\n    <a href=\"/bibledecoded/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"m10 8 6 4-6 4Z\"/></svg><span>Bible Decoded</span></a>\n    <a href=\"/welcome/\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"2\"/></svg><span>Other Resources</span></a>\n  </nav>";

  const template = document.createElement('template');
  template.innerHTML = markup;
  const freshBar = template.content.firstElementChild;
  let bar = document.querySelector('.chron-bottom-tabs');
  if (bar) bar.replaceWith(freshBar);
  else document.body.append(freshBar);
  bar = freshBar;

  bar.id = 'tjm-bottom-tabs';
  document.body.classList.add('tjm-tabbed-page');

  const activePath = spanishBibleDecoded
    ? '/es/bibledecoded'
    : englishBibleDecoded
      ? '/bibledecoded'
      : path;

  bar.querySelectorAll('a').forEach(link => {
    const linkPath = new URL(link.href).pathname.replace(/\/+$/, '').toLowerCase();
    if (linkPath === activePath) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  function measure() {
    document.documentElement.style.setProperty('--tjm-bottom-bar-height', bar.getBoundingClientRect().height + 'px');
  }
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(bar);
  window.addEventListener('resize', measure, {passive:true});
  measure();
})();
