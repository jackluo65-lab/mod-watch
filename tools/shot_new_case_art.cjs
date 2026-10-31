// 截图：新款表壳换上真图后的第 1 步，以及选中后的预览（含表圈占位）。
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  await p.evaluate(async () => {
    for (const cat of ['PRX Case', 'Nautilus Case', 'SKX Square Case', 'SKX Samurai Case']) {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      if (s && !s.classList.contains('expanded')) s.querySelector('.case-series-header').click();
      await new Promise(r => setTimeout(r, 150));
    }
    [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'PRX Case')
      .scrollIntoView({ block: 'start' });
  });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'tools/new-cases-grid.png' });

  // 选 PRX 银款
  await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'PRX Case');
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'tools/new-cases-preview.png' });

  const info = await p.evaluate(() => ({
    code: selectedCase && selectedCase.code,
    views: selectedCase && selectedCase.views,
    stack: [...document.querySelectorAll('#imgStack img')].map(i => (i.getAttribute('src') || '').split('/').slice(-2).join('/') + ' w' + i.naturalWidth),
  }));
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
