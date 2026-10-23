// 截图：新款系列在第 1 步的位置，以及选中 PRX 后的预览 + 表圈列表。
//   URL=http://127.0.0.1:8791/index.html node tools/shot_new_families.cjs
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const OUT = process.env.OUT || 'tools/new-families.png';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  // 展开四个新系列，让占位卡露出来
  await p.evaluate(async () => {
    for (const cat of ['PRX Case', 'Nautilus Case', 'SKX Square Case', 'Turtle Case']) {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      if (s && !s.classList.contains('expanded')) s.querySelector('.case-series-header').click();
      await new Promise(r => setTimeout(r, 120));
    }
    const first = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'PRX Case');
    first.scrollIntoView({ block: 'center' });
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT, fullPage: false });

  // 选 PRX 第一款，看预览 + 表圈
  await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'PRX Case');
    s.querySelector('.case-series-variants .case-card').click();
  });
  await p.waitForTimeout(1600);
  await p.screenshot({ path: OUT.replace('.png', '-bezel.png'), fullPage: false });
  await b.close();
  console.log('shots written');
})();
