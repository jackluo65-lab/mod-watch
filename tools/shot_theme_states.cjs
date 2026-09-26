const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const BEFORE = process.env.BEFORE || '/tmp/index_before_theme.html';
const OUT = process.env.OUT || '/tmp';

// Two frames of the SAME site, differing only in the stylesheet: one served with the
// pre-theme index.html injected via request interception, one as it is now.
async function shot(b, tag, useOld) {
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  if (useOld) {
    const html = fs.readFileSync(BEFORE, 'utf8');
    await p.route('**/index.html*', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  }
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    const s = document.querySelector('.case-series');
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await p.waitForTimeout(1000);
  const seen = await p.evaluate(() => ({
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
    name: getComputedStyle(document.querySelector('.part-info h5')).fontSize,
  }));
  console.log(`[${tag}] ${JSON.stringify(seen)}`);
  await p.screenshot({ path: `${OUT}/theme_${tag}.png`, clip: { x: 0, y: 0, width: 1280, height: 1000 } });
  await p.close();
}
(async () => {
  const b = await chromium.launch();
  await shot(b, 'old', true);
  await shot(b, 'new', false);
  await b.close();
})();
