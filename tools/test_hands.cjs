const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const TAG = process.env.TAG || 'local';

// 逐系列走完整流程到「表针」步骤，选第一款表针，读图层与 transform，并截图
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().split('/').pop()); });

  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2000);
  const cats = await p.evaluate(() => [...document.querySelectorAll('.case-series')].map(s => s.dataset.category));

  for (const cat of cats) {
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(1500);
    await p.evaluate((c) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === c);
      (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
      s.querySelectorAll('.case-series-variants .case-card')[0].click();
    }, cat);
    await p.waitForTimeout(700);

    const stepTo = async (kw) => {
      for (let i = 0; i < 14; i++) {
        const t = await p.evaluate(() => document.getElementById('stepTitle').textContent);
        if (t.includes(kw)) return true;
        await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])'); if (c) c.click(); });
        await p.waitForTimeout(200);
        await p.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
        await p.waitForTimeout(400);
      }
      return false;
    };
    if (!(await stepTo('表针'))) { console.log(`[${cat}] ⚠️ 未到表针步骤`); continue; }
    const n = await p.evaluate(() => document.querySelectorAll('.part-group.active .part-item[data-id]:not([data-id="__upload__"])').length);
    const first = await p.evaluate(() => {
      const c = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])');
      const txt = c ? (c.querySelector('h5') || c).textContent.trim() : '-';
      if (c) c.click();
      return txt;
    });
    await p.waitForTimeout(800);
    const st = await p.evaluate(() => [...document.querySelectorAll('#imgStack img')].map(im =>
      im.getAttribute('src').split('/').slice(-2).join('/') + ' z' + im.style.zIndex + (im.style.transform ? ' ' + im.style.transform : '')));
    console.log(`[${cat}] 表针 ${n} 个 · ${first}`);
    console.log('    ' + st.join(' | '));
    const el = await p.$('#imgStack');
    const slug = cat.split(' ')[0].toLowerCase() + (cat.includes('Retro') ? 'cl' : cat.includes('AP') ? 'ap' : cat.includes('MORE') ? 'more' : '');
    await el.screenshot({ path: `/tmp/hands_${TAG}_${slug}.png` });
  }
  console.log('40x:', bad.length ? [...new Set(bad)].slice(0, 3).join(' ') : 'none');
  console.log('JS errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
