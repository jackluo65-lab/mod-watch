// Before/after frames for the crystal step, both taken from the live deployment so the
// only difference is what this change touched: the "before" frame gets the pre-change
// data.json served over the same site through request interception.
//
//   BEFORE_DATA=/path/to/data-before.json node tools/shot_crystal_states.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.env.URL || 'https://www.mod-watch.com/index.html';
const FAMILY = process.env.FAMILY || 'Vintage Case';
const BEFORE = process.env.BEFORE_DATA;

// pick the family's first case, fill the steps before the crystal, stop on the crystal step
const walkToCrystal = async (page) => {
  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(3500);
  await page.evaluate((family) => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === family);
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  }, FAMILY);
  await page.waitForTimeout(1200);
  for (let i = 0; i < 12; i++) {
    const t = await page.evaluate(() => document.getElementById('stepTitle').textContent);
    // stop at the crystal step — or at step 4+ when the step does not exist at all
    // (which is exactly the "before" state: the wizard walked straight past it)
    const n = parseInt((t.match(/第\s*(\d+)\s*步/) || [])[1] || '0', 10);
    if (/表镜/.test(t) || n >= 4) break;
    const opts = await page.evaluate(() => document.querySelectorAll('.part-group.active .part-item[data-id]:not([data-id="__upload__"])').length);
    if (opts) {
      await page.evaluate(() => { const g = document.querySelector('.part-group.active'); if (!g || g.querySelector('.part-item.selected')) return; const c = g.querySelector('.part-item[data-id]:not([data-id="__upload__"])'); if (c) c.click(); });
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
    await page.waitForTimeout(450);
  }
  // choose a coating so the preview shows the glass, when the step has options at all
  await page.evaluate(() => {
    const el = document.querySelector('#list-crystal .part-item[data-id]');
    if (el) el.click();
  });
  await page.waitForTimeout(1500);
  return page.evaluate(() => ({
    step: document.getElementById('stepTitle').textContent.trim(),
    guide: document.getElementById('stepGuide').textContent.trim(),
    cards: document.querySelectorAll('#list-crystal .part-item[data-id]').length,
    picked: selections.crystal ? selections.crystal.code : null,
    layers: document.querySelectorAll('#imgStack img').length,
  }));
};

(async () => {
  const browser = await chromium.launch();
  const out = {};

  for (const [tag, dataFile] of [['before', BEFORE], ['after', null]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
    if (dataFile) {
      const body = fs.readFileSync(dataFile);
      await page.route('**/data.json*', route => route.fulfill({ status: 200, contentType: 'application/json', body }));
    }
    const state = await walkToCrystal(page);
    out[tag] = state;
    console.log(tag, JSON.stringify(state));
    await page.screenshot({ path: `/tmp/crystal_${tag}.png` });
    await page.close();
  }

  await browser.close();
  fs.writeFileSync('/tmp/crystal_states.json', JSON.stringify(out, null, 1));
})();
