const { chromium } = require('playwright');
const URL = process.env.URL || 'https://www.mod-watch.com/index.html';
const WAIT = +(process.env.WAIT || 9000);

// How much does the landing screen actually pull? The wizard renders a card for
// every one of the 55 cases up front and nothing is lazy — measure the real bytes.
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const HOST = URL.replace(/^https?:\/\//, '').split('/')[0];
  const seen = new Map();   // url -> bytes
  p.on('response', async r => {
    const url = r.url();
    if (!url.includes(HOST)) return;
    let len = +(r.headers()['content-length'] || 0);
    if (!len) { try { len = (await r.body()).length; } catch (e) { len = 0; } }
    seen.set(url.split('/').slice(3).join('/').split('?')[0], len);
  });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(WAIT);
  const dom = await p.evaluate(() => ({
    imgs: document.images.length,
    pending: [...document.images].filter(i => !i.complete).length,
    series: document.querySelectorAll('.case-series').length,
    variantsImgs: document.querySelectorAll('.case-series-variants img').length,
    repImgs: document.querySelectorAll('.case-series-rep img').length,
  }));
  const rows = [...seen.entries()];
  const total = rows.reduce((a, [, n]) => a + n, 0);
  const byDir = {};
  rows.forEach(([u, n]) => { const k = u.split('/').slice(0, 3).join('/'); byDir[k] = (byDir[k] || 0) + n; });
  const mb = x => (x / 1024 / 1024).toFixed(2) + ' MB';
  console.log(`landing screen after ${WAIT}ms: ${rows.length} requests, ${mb(total)}`);
  console.log('  DOM:', JSON.stringify(dom));
  console.log('  by folder:');
  Object.entries(byDir).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(`    ${mb(v).padStart(9)}  ${k}`));
  const big = rows.sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('  heaviest single files:');
  big.forEach(([u, n]) => console.log(`    ${(n / 1024).toFixed(0).padStart(5)} KB  ${u}`));
  const steps = await p.evaluate(() => document.querySelectorAll('.case-series-variants .case-card').length);
  console.log(`  case cards in DOM: ${steps}`);
  await b.close();
})();
