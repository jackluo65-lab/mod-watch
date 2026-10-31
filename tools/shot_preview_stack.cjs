// 选壳 + 选第一个表圈后的预览状态，逐系列截图。
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const CASES = [['SKX Samurai Case', 'SMR-WS-11'], ['PRX Case', 'C-PRX-1']];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2000);

  for (const [cat, code] of CASES) {
    await p.evaluate(() => { if (typeof goToStep === 'function') goToStep(0); });
    await p.waitForTimeout(300);
    await p.evaluate((cat) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      if (!s.classList.contains('expanded')) s.querySelector('.case-series-header').click();
    }, cat);
    await p.waitForTimeout(400);
    await p.evaluate((code) => selectCase(DATA.caseSeries.find(x => x.code === code).id), code);
    await p.waitForTimeout(1200);
    await p.evaluate(() => {
      const first = document.querySelector('#list-bezel .part-item[data-id]');
      if (first) first.click();
    });
    await p.waitForTimeout(1400);
    const stack = await p.evaluate(() => [...document.querySelectorAll('#imgStack img')]
      .map(i => (i.getAttribute('src') || '').split('/').slice(-2).join('/') + ' w' + i.naturalWidth));
    console.log(code, JSON.stringify(stack));
    await p.screenshot({ path: `tools/preview-${code}.png`, clip: { x: 0, y: 0, width: 420, height: 760 } });
  }
  await b.close();
})();
