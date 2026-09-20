const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const TAG = process.env.TAG || 'local';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().split('/').pop()); });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2200);

  const pick = async (cat, idx) => {
    await p.evaluate(([c, i]) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === c);
      s.querySelector('.case-series-header').click();
      s.querySelectorAll('.case-series-variants .case-card')[i].click();
    }, [cat, idx]);
    await p.waitForTimeout(700);
  };
  const step = async () => {
    await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item'); if (c) c.click(); });
    await p.waitForTimeout(350);
    // click through the DOM: Playwright's actionability check stalls on the sticky mobile bar
    await p.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
    await p.waitForTimeout(500);
  };

  const cases = [['SKX 3.0 Case', 'skx'], ['Classic Retro Case', 'cl'], ['AP Case', 'ap']];
  for (const [cat, tag] of cases) {
    await pick(cat, 0);
    for (let i = 0; i < 11; i++) {
      const t = await p.evaluate(() => document.getElementById('stepTitle').textContent);
      if (t.includes('字面')) break;
      await step();
    }
    const info = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('.part-group.active .part-item')];
      return { title: document.getElementById('stepTitle').textContent, n: cards.length,
               first: cards[0] ? cards[0].querySelector('h5').textContent : '-' };
    });
    console.log('[' + cat + '] 停在「' + info.title + '」 选项 ' + info.n + ' 个，首个：' + info.first);
    const cards = await p.$$('.part-group.active .part-item');
    if (cards.length) { await cards[0].click(); await p.waitForTimeout(900); }
    const layers = await p.evaluate(() => [...document.querySelectorAll('#imgStack img')]
      .map(im => im.getAttribute('src').split('/').pop() + ' z' + im.style.zIndex));
    console.log('   图层: ' + layers.join(' | '));
    const thumbs = await p.evaluate(() => Promise.all([...document.querySelectorAll('.part-group.active .part-item img')]
      .slice(0, 6).map(im => Promise.resolve(im.complete ? (im.naturalWidth || 0) : -1))));
    console.log('   前 6 张缩略图 naturalWidth: ' + thumbs.join(','));
    await (await p.$('#imgStack')).screenshot({ path: '/tmp/dial_' + TAG + '_' + tag + '.png' });
  }
  console.log('40x: ' + (bad.length ? bad.slice(0, 5).join(' ') : 'none'));
  console.log('JS errors: ' + (errs.length ? errs.join(' ') : 'none'));
  await b.close();
})();
