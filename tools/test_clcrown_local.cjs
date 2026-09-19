const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const txt = s => (s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  // 走完 Classic Retro：每一步选第一个，直到走不动为止
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Retro Case');
    s.querySelector('.case-series-header').click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await page.waitForTimeout(600);

  for (let i = 0; i < 12; i++) {
    const s = await page.evaluate(() => ({
      title: document.getElementById('stepTitle').textContent,
      guide: document.getElementById('stepGuide').textContent,
      cards: [...document.querySelectorAll('.part-group.active .part-item')].map(e => e.dataset.id),
      stack: [...document.querySelectorAll('#imgStack img')].map(im =>
        `${im.getAttribute('src').split('/').pop()}(z${im.style.zIndex}${im.style.transform ? ' ' + im.style.transform : ''})`),
      hint: getComputedStyle(document.getElementById('loadHint')).display
    }));
    console.log(`\n--- ${txt(s.title)} | ${s.cards.length} 个: ${s.cards.join(', ')} | hint=${s.hint}`);
    console.log('    stack:', s.stack.join(' > '));
    if (txt(s.title).includes('表冠')) await page.screenshot({ path: '/tmp/cl_crown_step.png' });
    if (s.cards.length) { await page.click('.part-group.active .part-item'); await page.waitForTimeout(500); }
    const before = s.title;
    await page.click('#btnNext');
    await page.waitForTimeout(500);
    if ((await page.evaluate(() => document.getElementById('stepTitle').textContent)) === before) { console.log('\n(走完)'); break; }
  }
  await page.screenshot({ path: '/tmp/cl_crown_finish.png' });

  // 排他性：别的系列不应该看到 CL 表把
  const exclusivity = await page.evaluate(async () => {
    const out = {};
    for (const [cat, idx] of [['Classic Case', 0], ['SKX 3.0 Case', 0], ['SKX Samurai Case', 0]]) {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      s.querySelector('.case-series-header').click();
      s.querySelectorAll('.case-series-variants .case-card')[idx].click();
      await new Promise(r => setTimeout(r, 600));
      // 走到表冠那一步：直接读 renderParts 的计数
      const c = document.getElementById('list-crown');
      out[cat] = { count: c.querySelectorAll('.part-item').length, hasCL: !!c.querySelector('.part-item[data-id^="wc3-cl-"]') };
    }
    return out;
  });
  console.log('\n=== 排他性（别的系列的表冠步骤）===');
  for (const [k, v] of Object.entries(exclusivity)) console.log(`  ${k}: ${v.count} 个, 含 CL 表把 = ${v.hasCL}`);
  await browser.close();
})();
