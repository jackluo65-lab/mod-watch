const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const CAT = process.env.CAT || 'AP Case';
const OUT = process.env.OUT || '/tmp/ap_live';
const txt = s => (s || '').replace(/\s+/g, ' ').trim();

async function walk(page, cat, variantIdx) {
  await page.evaluate(async (c) => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === c);
    if (!s.classList.contains('expanded')) s.querySelector('.case-series-header').click();
    await new Promise(r => setTimeout(r, 100));
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  }, cat);
  await page.waitForTimeout(600);
  const log = [];
  for (let i = 0; i < 12; i++) {
    const s = await page.evaluate(() => ({
      title: document.getElementById('stepTitle').textContent,
      guide: document.getElementById('stepGuide').textContent,
      cards: [...document.querySelectorAll('.part-group.active .part-item')].map(e => e.dataset.id),
      stack: [...document.querySelectorAll('#imgStack img')].map(im =>
        `${im.getAttribute('src').split('/').pop()}(z${im.style.zIndex}${im.style.transform ? ' ' + im.style.transform : ''})`),
      hint: getComputedStyle(document.getElementById('loadHint')).display
    }));
    log.push(s);
    if (s.cards.length) { await page.click('.part-group.active .part-item'); await page.waitForTimeout(500); }
    const before = s.title;
    await page.click('#btnNext');
    await page.waitForTimeout(450);
    if ((await page.evaluate(() => document.getElementById('stepTitle').textContent)) === before) break;
  }
  return log;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  const cats = await page.evaluate(() => [...document.querySelectorAll('.case-series')].map(s => s.dataset.category));
  console.log('系列顺序:', cats.join(' | '));

  const log = await walk(page, CAT);
  console.log(`\n===== ${CAT} 流程 =====`);
  for (const s of log) {
    console.log(`--- ${txt(s.title)} | ${s.cards.length} 个: ${s.cards.join(', ')} | hint=${s.hint}`);
    console.log('    ' + s.stack.join(' > '));
  }
  const specs = await page.evaluate(() => document.getElementById('previewSpecs').textContent.replace(/\s+/g, ' ').trim());
  console.log('规格:', specs);
  await page.screenshot({ path: OUT + '_finish.png' });

  // 排他性：其它系列不应出现 AP 专属件
  const excl = await page.evaluate(async () => {
    const out = {};
    for (const cat of ['Classic Retro Case', 'Classic Case', 'SKX 3.0 Case', 'SKX Samurai Case']) {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      if (!s) continue;
      if (!s.classList.contains('expanded')) s.querySelector('.case-series-header').click();
      await new Promise(r => setTimeout(r, 100));
      s.querySelectorAll('.case-series-variants .case-card')[0].click();
      await new Promise(r => setTimeout(r, 700));
      const q = sel => document.querySelectorAll(sel).length;
      out[cat] = {
        crown: q('#list-crown .part-item'),
        crownAP: q('#list-crown .part-item[data-id^="wc3-ap-"]'),
        crystal: q('#list-crystal .part-item'),
        crystalAP: q('#list-crystal .part-item[data-id^="cr-sjg42"]'),
        bezel: q('#list-bezel .part-item'),
        bezelAP: q('#list-bezel .part-item[data-id^="bz-ap-"]')
      };
    }
    return out;
  });
  console.log('\n===== 排他性（别的系列不应看到 AP 专属件）=====');
  for (const [k, v] of Object.entries(excl)) {
    console.log(`  ${k}: 表冠 ${v.crown}(AP ${v.crownAP}) | 表镜 ${v.crystal}(AP ${v.crystalAP}) | 表圈 ${v.bezel}(AP ${v.bezelAP})`);
  }
  console.log('\nJS errors:', errs.length ? errs : 'none');
  await browser.close();
})();
