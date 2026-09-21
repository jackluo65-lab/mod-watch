const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.env.URL || 'https://mod-watch.com/index.html';
const OUT = process.env.OUT || '/tmp';
const BEFORE_DATA = process.env.BEFORE_DATA || '/tmp/vintage-undo-backup/data-before.json';
const BEFORE_IMG = process.env.BEFORE_IMG || '/tmp/vintage-undo-backup';

// Shot the Vintage preview in two states:
//   after  = whatever the site serves now
//   before = the same live site, but with the pre-revert data.json and the retired
//            d226 / vintage-ring artwork served from the local backup via request
//            interception (no need to rebuild a whole second copy of the site).
async function shot(b, tag, stale) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  if (stale) {
    await p.route('**/data.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(BEFORE_DATA, 'utf8') }));
    await p.route('**/img/dial/d226/**', r => {
      const f = BEFORE_IMG + '/d226/' + r.request().url().split('/img/dial/d226/')[1].split('?')[0];
      fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(f) }) : r.continue();
    });
    await p.route('**/img/chapterRing/vintage/**', r => {
      const f = BEFORE_IMG + '/chapterRing-vintage/' + r.request().url().split('/img/chapterRing/vintage/')[1].split('?')[0];
      fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(f) }) : r.continue();
    });
  }
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Vintage Case');
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await p.waitForTimeout(700);
  for (let i = 0; i < 16; i++) {
    const t = await p.evaluate(() => document.getElementById('stepTitle').textContent);
    if (t.includes('表针')) break;
    await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item'); if (c) c.click(); });
    await p.waitForTimeout(180);
    await p.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
    await p.waitForTimeout(400);
  }
  await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item'); if (c) c.click(); });
  await p.waitForTimeout(900);
  // hide the floating "click to zoom" hint so the crop only shows the watch
  await p.evaluate(() => {
    [...document.querySelectorAll('*')].filter(e => !e.children.length && /点击放大|Click to zoom/i.test(e.textContent || ''))
      .forEach(e => { const host = e.closest('button,.zoom-hint,[class*=hint],[class*=zoom]') || e.parentElement; if (host) host.style.visibility = 'hidden'; });
  });
  const info = await p.evaluate(() => [...document.querySelectorAll('#imgStack img')].map(im =>
    (im.getAttribute('src') || '').split('/').slice(-2).join('/') + ' z' + im.style.zIndex + (im.style.transform ? ' ' + im.style.transform : '')).join(' | '));
  console.log(`[${tag}] ${info}`);
  await (await p.$('#imgStack')).screenshot({ path: `${OUT}/vintage_${tag}.png` });
  await p.close();
}
(async () => {
  const b = await chromium.launch();
  await shot(b, 'before', true);
  await shot(b, 'after', false);
  await b.close();
})();
