const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';

// 断言：表把图层相对表壳的位置
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  // 每个系列：选第一个表壳 + 第一个表冠，读 imgStack 的相对次序
  const res = await page.evaluate(async () => {
    const out = {};
    const types = ['bezel', 'chapterRing', 'insert', 'crystal', 'dial', 'hands', 'crown'];
    for (const cat of ['Classic Retro Case', 'Classic Case', 'SKX 3.0 Case', 'SKX Samurai Case']) {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      if (!s) { out[cat] = 'no series'; continue; }
      s.querySelector('.case-series-header').click();
      s.querySelectorAll('.case-series-variants .case-card')[0].click();
      await new Promise(r => setTimeout(r, 500));
      // 依次点掉前面的步骤直到表冠
      for (let i = 0; i < 9; i++) {
        const t = document.getElementById('stepTitle').textContent;
        if (t.includes('表冠')) break;
        const cards = document.querySelectorAll('.part-group.active .part-item');
        if (cards.length) cards[0].click();
        await new Promise(r => setTimeout(r, 250));
        document.getElementById('btnNext').click();
        await new Promise(r => setTimeout(r, 350));
      }
      // 选第一个表冠
      const cw = document.querySelectorAll('.part-group.active .part-item');
      if (cw.length) cw[0].click();
      await new Promise(r => setTimeout(r, 600));
      const imgs = [...document.querySelectorAll('#imgStack img')];
      await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      const z = {};
      imgs.forEach(im => { z[im.getAttribute('src').split('/').pop()] = im.style.zIndex; });
      const caseZ = Object.entries(z).find(([k]) => k.startsWith('C-CL') || k.startsWith('C-JTF') || k.startsWith('SK3-') || k.startsWith('SMR-'));
      const crownZ = Object.entries(z).find(([k]) => k.startsWith('WC'));
      out[cat] = {
        stack: imgs.map(im => `${im.getAttribute('src').split('/').pop()}(z${im.style.zIndex})`),
        crown: crownZ && crownZ[0], crownZ: crownZ && +crownZ[1],
        case: caseZ && caseZ[0], caseZ: caseZ && +caseZ[1],
        crownAboveCase: !!(crownZ && caseZ && +crownZ[1] > +caseZ[1]),
        hint: getComputedStyle(document.getElementById('loadHint')).display
      };
    }
    return out;
  });

  for (const [k, v] of Object.entries(res)) {
    if (typeof v === 'string') { console.log(`${k}: ${v}`); continue; }
    console.log(`\n${k}`);
    console.log(`   ${v.crown} z${v.crownZ}  vs  ${v.case} z${v.caseZ}   → 表把在表壳${v.crownAboveCase ? '之【上】' : '之【下】'}  | hint=${v.hint}`);
    console.log('   ' + v.stack.join(' > '));
  }
  console.log('\nJS errors:', errs.length ? errs : 'none');
  await browser.close();
})();
