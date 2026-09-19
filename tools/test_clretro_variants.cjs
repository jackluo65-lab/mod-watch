const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  // 1) case grid: the new series must be present with 3 variants
  const seriesInfo = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Retro Case');
    if (!s) return null;
    const els = [...s.querySelectorAll('.case-series-variants .case-card')];
    return {
      label: s.querySelector('.case-series-header').textContent.replace(/\s+/g, ' ').trim(),
      order: [...document.querySelectorAll('.case-series')].map(x => x.dataset.category),
      variants: els.map(e => ({
        id: e.dataset.id,
        img: (e.querySelector('img') || {}).getAttribute ? e.querySelector('img').getAttribute('src') : null,
        text: e.textContent.replace(/\s+/g, ' ').trim()
      }))
    };
  });
  console.log('series:', JSON.stringify(seriesInfo, null, 1));
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Retro Case');
    s.querySelector('.case-series-header').click();
    s.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/clretro_grid.png' });

  // 2) each variant: check the bezel list + that every layer loads
  for (const id of ['clretro-cl1', 'clretro-cl3', 'clretro-cl4']) {
    const r = await page.evaluate(async (cid) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Retro Case');
      const card = s.querySelector(`.case-card[data-id="${cid}"]`);
      card.click();
      await new Promise(r => setTimeout(r, 500));
      document.querySelectorAll('.part-group.active .part-item')[0].click();
      await new Promise(r => setTimeout(r, 600));
      const imgs = [...document.querySelectorAll('#imgStack img')];
      await Promise.all(imgs.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      return {
        id: cid,
        bezelOptions: document.querySelectorAll('.part-group.active .part-item').length,
        layers: imgs.map(im => `${im.getAttribute('src').split('/').pop()}:${im.naturalWidth}x${im.naturalHeight}`),
        hint: getComputedStyle(document.getElementById('loadHint')).display,
        specs: document.getElementById('previewSpecs').textContent.replace(/\s+/g, ' ').trim()
      };
    }, id);
    console.log(JSON.stringify(r));
    await page.screenshot({ path: `/tmp/clretro_${id}.png` });
  }
  await browser.close();
})();
