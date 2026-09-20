const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';

// 每个系列：选表壳 → 表圈 → 内影圈，读内影圈图层的 transform，并量它相对表圈内孔的可见带宽
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  const rows = await page.evaluate(async () => {
    const out = [];
    const cats = [...document.querySelectorAll('.case-series')].map(s => s.dataset.category);
    for (const cat of cats) {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      if (!s.classList.contains('expanded')) s.querySelector('.case-series-header').click();
      await new Promise(r => setTimeout(r, 80));
      s.querySelectorAll('.case-series-variants .case-card')[0].click();
      await new Promise(r => setTimeout(r, 500));
      // 第 1 步是表圈 → 选一个；第 2 步是内影圈 → 选一个
      const step = async () => {
        const c = document.querySelectorAll('.part-group.active .part-item');
        if (c.length) c[0].click();
        await new Promise(r => setTimeout(r, 250));
        document.getElementById('btnNext').click();
        await new Promise(r => setTimeout(r, 400));
      };
      const t0 = document.getElementById('stepTitle').textContent;
      if (t0.includes('表圈')) await step();
      const t1 = document.getElementById('stepTitle').textContent;
      if (t1.includes('内影圈')) await step();
      const imgs = [...document.querySelectorAll('#imgStack img')];
      await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      const cr = imgs.find(im => im.getAttribute('src').includes('chapterRing') || /cr-[a-z]/.test(im.getAttribute('src')));
      const bz = imgs.find(im => im.getAttribute('src').includes('bezel') || /^\/?.*B-/.test(im.getAttribute('src').split('/').pop()));
      const bzId = bz ? bz.getAttribute('src').split('/').pop() : '(无表圈)';
      out.push({
        cat,
        crLayer: cr ? cr.getAttribute('src').split('/').pop() : '(无内影圈)',
        transform: cr ? (cr.style.transform || '(无)') : '-',
        bezel: bzId,
        hint: getComputedStyle(document.getElementById('loadHint')).display
      });
    }
    return out;
  });

  console.log('系列'.padEnd(22) + '内影圈图层'.padEnd(16) + 'transform'.padEnd(20) + '表圈');
  for (const r of rows) {
    console.log(r.cat.padEnd(22) + r.crLayer.padEnd(16) + r.transform.padEnd(20) + r.bezel + (r.hint !== 'none' ? '  ⚠hint=' + r.hint : ''));
  }
  console.log('\nJS errors:', errs.length ? errs : 'none');
  await browser.close();
})();
