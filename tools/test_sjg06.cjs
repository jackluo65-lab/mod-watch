const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  async function crystalFor(code) {
    return page.evaluate((code) => {
      const c = DATA.caseSeries.find(x => x.code === code);
      selectedCase = c;
      renderParts();
      const items = [...document.querySelectorAll('#list-crystal .part-item')];
      return {
        code,
        category: c.category,
        count: items.length,
        ids: items.map(el => el.dataset.id),
        labels: items.map(el => (el.querySelector('h5') ? el.querySelector('h5').textContent.trim() : '')),
        imgs: [...document.querySelectorAll('#list-crystal .part-item img')].map(i => i.getAttribute('src')),
        broken: [...document.querySelectorAll('#list-crystal .part-item img')].filter(i => !i.complete || i.naturalWidth === 0).length
      };
    }, code);
  }

  for (const code of ['SKX-B-1', 'SMR-WS-11', 'C-AP-1']) {
    const r = await crystalFor(code);
    console.log('');
    console.log('[' + r.code + ']  category=' + r.category);
    console.log('  表镜选项 ' + r.count + ' 个:');
    r.ids.forEach(function (id, i) {
      console.log('    - ' + id.padEnd(12) + ' ' + r.labels[i].padEnd(22) + ' ' + r.imgs[i]);
    });
    console.log('  图片加载失败: ' + r.broken);
  }

  console.log('');
  console.log('HTTP 4xx/5xx: ' + bad.length + ' ' + bad.slice(0, 5).join(' | '));

  await crystalFor('SKX-B-1');
  await page.evaluate(() => {
    const g = document.querySelector('.part-group[data-part="crystal"]');
    if (g) g.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: '/tmp/wmc/sjg06-crystal-panel.png' });
  await browser.close();
})();
