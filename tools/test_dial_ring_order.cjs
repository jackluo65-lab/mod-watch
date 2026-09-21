const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const TAG = process.env.TAG || 'local';

// 断言：内影圈图层必须在表盘之上（z-index 更大）
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().split('/').pop()); });

  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2000);
  const cats = await p.evaluate(() => [...document.querySelectorAll('.case-series')].map(s => s.dataset.category));
  console.log('系列数:', cats.length);

  let fail = 0, checked = 0;
  for (const cat of cats) {
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });   // 每个系列全新状态
    await p.waitForTimeout(1600);
    const picked = await p.evaluate((c) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === c);
      if (!s) return 'no-series';
      const h = s.querySelector('.case-series-rep') || s.querySelector('.case-series-header');
      h.click();
      const cards = s.querySelectorAll('.case-series-variants .case-card');
      if (!cards.length) return 'no-card';
      cards[0].click();
      return 'ok:' + s.querySelectorAll('.case-series-variants .case-card').length;
    }, cat);
    await p.waitForTimeout(700);

    const stepTo = async (kw) => {
      for (let i = 0; i < 12; i++) {
        const t = await p.evaluate(() => document.getElementById('stepTitle').textContent);
        if (t.includes(kw)) return true;
        await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])'); if (c) c.click(); });
        await p.waitForTimeout(200);
        await p.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
        await p.waitForTimeout(380);
      }
      return false;
    };

    if (!(await stepTo('字面'))) {
      console.log(`[${cat}] ⚠️ 未到达字面步骤 (pick=${picked}, 步骤=${await p.evaluate(() => document.getElementById('stepTitle').textContent)})`);
      fail++; continue;
    }
    await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])'); if (c) c.click(); });
    await p.waitForTimeout(600);
    await stepTo('表针');
    await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])'); if (c) c.click(); });
    await p.waitForTimeout(700);

    const st = await p.evaluate(() => {
      const out = { dial: null, dialImg: null, ring: null, ringImg: null, order: [] };
      [...document.querySelectorAll('#imgStack img')].forEach(im => {
        const src = im.getAttribute('src');
        const z = parseInt(im.style.zIndex || '0', 10);
        out.order.push(src.split('/').pop() + ':z' + z);
        if (src.includes('/dial/')) { out.dial = z; out.dialImg = src.split('/dial/')[1]; }
        if (src.includes('chapterRing')) { out.ring = z; out.ringImg = src.split('/').pop(); }
      });
      return out;
    });
    if (st.ring === null) {
      console.log(`[${cat}] 无内影圈步骤（表盘 ${st.dialImg}）`);
      continue;
    }
    if (st.dial === null) { console.log(`[${cat}] ⚠️ 未选到字面 | 层序 ${st.order.join(' | ')}`); fail++; continue; }
    const ok = st.ring > st.dial;
    checked++;
    if (!ok) fail++;
    console.log(`[${cat}] 表盘z${st.dial} vs 内影圈z${st.ring} → ${ok ? '✅ 内影圈在表盘之上' : '❌ 内影圈被表盘压住'}`);
    console.log(`    表盘 ${st.dialImg} | 内影圈 ${st.ringImg}`);
    console.log(`    层序 ${st.order.join(' | ')}`);
  }
  console.log(`\n检查 ${checked} 个系列，失败 ${fail} 个`);
  console.log('40x:', bad.length ? [...new Set(bad)].slice(0, 4).join(' ') : 'none');
  console.log('JS errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
