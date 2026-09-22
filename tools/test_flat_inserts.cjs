const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8793/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const rows = await page.evaluate(() => {
    const out = [];
    for (const code of ['SKX-B-1', 'SKX-N-1', 'SK3-B1', 'FRONT', 'SMR-WS-11', 'VINTAGE-C-JTF-1', 'C-AP-1']) {
      selectedCase = DATA.caseSeries.find(x => x.code === code);
      renderParts();
      const ins = [...document.querySelectorAll('#list-insert .part-item')];
      const cry = [...document.querySelectorAll('#list-crystal .part-item')];
      out.push({
        code,
        category: selectedCase.category,
        insert: ins.length,
        crystal: cry.length,
        flat: ins.filter(el => /^(dl|zl|dn|zn|sn)-/.test(el.dataset.id)).map(el => el.dataset.id),
        crystalNames: cry.map(el => el.querySelector('h5').textContent.trim())
      });
    }
    return out;
  });

  for (const r of rows) {
    console.log('');
    console.log('[' + r.code + '] ' + r.category);
    console.log('  插入 ' + r.insert + ' 个，其中平面陶瓷圈 ' + r.flat.length + ' 个');
    if (r.flat.length) console.log('    ' + r.flat.join(', '));
    console.log('  表镜 ' + r.crystal + ' 个: ' + r.crystalNames.join(' / '));
  }

  // 图片加载检查：SKX 系列的 insert 面板
  await page.evaluate(() => {
    selectedCase = DATA.caseSeries.find(x => x.code === 'SKX-B-1');
    renderParts();
    document.querySelectorAll('.part-group').forEach(g => g.style.display = 'none');
    const g = document.querySelector('.part-group[data-part="insert"]');
    g.style.display = 'block';
    document.querySelectorAll('.part-list').forEach(l => l.classList.add('active'));
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:0;background:#fff';
    document.body.appendChild(g);
  });
  await page.waitForTimeout(4000);
  const broken = await page.evaluate(() => [...document.querySelectorAll('#list-insert img')].filter(i => !i.naturalWidth).map(i => i.getAttribute('src')));
  console.log('');
  console.log('插入面板图片加载失败: ' + broken.length + (broken.length ? ' -> ' + broken.slice(0, 6).join(', ') : ''));
  await page.screenshot({ path: '/tmp/pcn/live-insert-panel.png' });
  console.log('HTTP 4xx/5xx: ' + bad.length + ' ' + bad.slice(0, 4).join(' | '));
  await browser.close();
})();
