// Run from the repository root after installing Playwright.
// Optional: PLAYWRIGHT_CHANNEL=msedge to use an installed browser.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const root = process.cwd();
const server = http.createServer(async (req, res) => {
  try {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) throw Error('path');
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', ({'.css':'text/css','.js':'text/javascript','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
  const base = `http://127.0.0.1:${server.address().port}`;
  const guides = ['get-to-know-jesus', 'bible-prophecy'].flatMap((series, i) => Array.from({length:i ? 9 : 10}, (_, j) => `${series}/guide${j+1}/`));
  const report = {sizes: [], guides: [], errors:[], layout:[]};
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce'});
      await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push(e.message));
      for (const guide of guides) {
        await page.goto(`${base}/${guide}`);
        if (guide !== guides[0]) assert.equal(await page.locator('html').getAttribute('data-guide-text-size'), '40', 'Size persists between guides');
        await page.evaluate(() => { localStorage.clear(); });
        await page.reload();
        assert.equal(await page.locator('.guide-text-controls button').count(), 2);
        await page.locator('[data-text-size="increase"]').click();
        assert.equal(await page.locator('html').getAttribute('data-guide-text-size'), '6');
        await page.locator('[data-text-size="decrease"]').click();
        await page.evaluate(() => document.querySelectorAll('details').forEach(el => el.open = true));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const baseline = await page.evaluate(() => {
          window.textElements = [...document.body.querySelectorAll('*')].filter(el => !['SCRIPT','STYLE'].includes(el.tagName) && [...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()));
          window.fontBaseline = textElements.map(el=>parseFloat(getComputedStyle(el).fontSize));
          return textElements.length;
        });
        const setLevel = level => page.evaluate(async level => {
          while (Number(document.documentElement.dataset.guideTextSize) !== level) document.querySelector(`[data-text-size="${Number(document.documentElement.dataset.guideTextSize) < level ? 'increase' : 'decrease'}"]`).click();
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, level);
        const levels = guide === guides[0] ? Array.from({length:40}, (_,i)=>i+1) : [1, 20, 40];
        for (const level of levels) {
          await setLevel(level);
          if (level === 1) assert.equal(await page.locator('[data-text-size="decrease"]').isDisabled(), true);
          const ratio = (80+(level-1)*5)/100;
          const mismatches = await page.evaluate(ratio => textElements.flatMap((el,i) => {
            const actual = parseFloat(getComputedStyle(el).fontSize), expected=fontBaseline[i]*ratio;
            return Math.abs(actual-expected)>.02 ? [{selector:el.tagName+'.'+el.className,text:el.textContent.slice(0,55),expected,actual}] : [];
          }), ratio);
          assert.deepEqual(mismatches, [], `${guide} width ${width} level ${level}`);
          if (guide === guides[0]) report.sizes.push({width,level,ratio});
        }
        assert.equal(await page.locator('[data-text-size="increase"]').isDisabled(), true);
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-guide-text-size'), '40');
        for (let section=0; section<8; section++) {
          await page.evaluate(section => {document.querySelectorAll('#lessonDots button')[section].click(); document.querySelectorAll('.lesson-panel:not([hidden]) details').forEach(el=>el.open=true);},section);
          const layout = await page.evaluate(() => {
            const over = [...document.querySelectorAll('body *')].filter(el => el.checkVisibility() && el.getBoundingClientRect().width && !el.closest('[aria-hidden="true"]')).flatMap(el=> {
              const r=el.getBoundingClientRect();
              return r.right>innerWidth+2 || r.left< -2 ? [{selector:el.tagName+'.'+el.className, right:Math.round(r.right),left:Math.round(r.left)}] : [];
            });
            return {scrollWidth:document.documentElement.scrollWidth,over:over.slice(0,12)};
          });
          if(layout.over.length || layout.scrollWidth > width) report.layout.push({guide,width,section:section+1,...layout});
        }
        report.guides.push({guide,width,textElements:baseline});
        if (guide===guides[0]) {
          await page.evaluate(()=>document.querySelector('#lessonDots button').click());
          if (process.env.GUIDE_TEST_OUTPUT) {
            await page.screenshot({path:path.join(process.env.GUIDE_TEST_OUTPUT,`guide-max-${width}.png`),fullPage:true,animations:'disabled'});
            await setLevel(20);
            await page.locator('#panelStage').scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(process.env.GUIDE_TEST_OUTPUT,`guide-reading-${width}.png`),animations:'disabled'});
            await setLevel(40);
          }
        }
        console.log(JSON.stringify({guide,width,textElements:baseline,passed:true}));
      }
      for (const [saved, expected] of [['small','3'], ['default','5'], ['large','8'], ['garbage','5'], ['41','5'], ['0','5'], ['2.5','5']]) {
        await page.evaluate(saved => localStorage.setItem('tjm-guide-text-size', saved), saved);
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-guide-text-size'), expected, 'Stored size validation: '+saved);
      }
      await context.close();
    }
    if (process.env.GUIDE_TEST_OUTPUT) await fs.writeFile(path.join(process.env.GUIDE_TEST_OUTPUT, 'guide-size-report.json'),JSON.stringify(report,null,2));
    assert.deepEqual(report.errors, [], 'No browser exceptions');
    assert.deepEqual(report.layout, [], 'All guide sections fit the viewport at maximum text size');
    console.log(JSON.stringify({summary:'Font scaling passed',guides:report.guides.length,levels:report.sizes.length,errors:report.errors,layoutIssues:report.layout.length,examples:report.layout.slice(0,3)}));
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e); server.close(); process.exitCode=1;});
