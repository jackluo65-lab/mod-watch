const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const TAG = process.env.TAG || 'local';

// Case cards must now serve the WebP thumbnail, keep the master as data-full,
// still load, and the wizard must still advance when a card is tapped.
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(3500);

  const cards = await p.evaluate(() => [...document.querySelectorAll('.case-card')].map(c => {
    const im = c.querySelector('.case-icon img');
    return { id: c.dataset.id, src: im ? im.getAttribute('src') : null, full: im ? im.dataset.full : null, w: im ? im.naturalWidth : 0 };
  }));
  const reps = await p.evaluate(() => [...document.querySelectorAll('.case-series-rep')].map(c => {
    const im = c.querySelector('.case-icon img');
    return { src: im ? im.getAttribute('src') : null, full: im ? im.dataset.full : null };
  }));

  // expand every series so all 55 variant cards enter the viewport and load
  await p.evaluate(async () => {
    for (const s of document.querySelectorAll('.case-series')) {
      const v = s.querySelector('.case-series-variants');
      if (!v.classList.contains('expanded')) (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
      await new Promise(r => setTimeout(r, 60));
    }
  });
  await p.waitForTimeout(2500);

  const loaded = await p.evaluate(() => [...document.querySelectorAll('.case-card .case-icon img')].map(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, complete: i.complete })));
  const webp = cards.filter(c => c.src && c.src.endsWith('.webp')).length;
  const pngCards = cards.filter(c => c.src && c.src.endsWith('.png'));
  const pngLeft = pngCards.length;
  // skxsub has no artwork at all (front.png 404s), so it is the one card allowed
  // to fall back to the master path — and it shows "Coming Soon" anyway.
  const pngOnlySkxsub = pngCards.every(c => c.id === 'skxsub');
  const noFull = cards.filter(c => c.src && (!c.full || !c.full.endsWith('.png'))).length;
  const broken = loaded.filter(x => x.complete && x.w === 0);

  // tap the first Vintage card to make sure selection still works
  await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Vintage Case');
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
  });
  await p.waitForTimeout(400);
  const clicked = await p.evaluate(() => {
    const c = [...document.querySelectorAll('.case-card')].find(x => x.dataset.id === 'vintage-jtf1');
    if (!c) return null; c.click(); return c.dataset.id;
  });
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({
    step: (document.getElementById('stepTitle') || {}).textContent,
    selected: document.querySelector('.case-card.selected') ? document.querySelector('.case-card.selected').dataset.id : null,
    stackImgs: [...document.querySelectorAll('#imgStack img')].map(i => (i.getAttribute('src') || '').split('/').slice(-2).join('/') + ' w' + i.naturalWidth),
  }));

  const checks = [
    ['55 个表壳卡片都渲染了', cards.length === 55],
    ['卡片图走 .webp 缩略图', webp >= 54],
    ['唯一用 PNG 的是没有素材的 skxsub 卡片', pngLeft === 0 || pngOnlySkxsub],
    ['每张卡片都留了 data-full 大图路径', noFull === 0],
    ['展开后缩略图真的解码成功（无 0 宽）', broken.length === 0 && loaded.length >= 54],
    ['系列代表图也用 .webp + data-full', reps.filter(r => r.src && !r.src.endsWith('.webp')).length === 0],
    ['点击表壳卡片仍在工作', after.selected === 'vintage-jtf1'],
    ['预览层用主图（大 PNG）并加载成功', after.stackImgs.some(s => s.includes('.png') && !s.endsWith('w0'))],
  ];
  let pass = 0, fail = 0;
  for (const [n, ok] of checks) { console.log(`   ${ok ? '✓' : '✗'} ${n}`); ok ? pass++ : fail++; }
  console.log('   step after tap:', after.step);
  console.log('   preview stack:', after.stackImgs.join(' | '));
  console.log('   404s:', bad.length ? [...new Set(bad)].slice(0, 4).join(' ') : 'none');
  console.log('   JS errors:', errs.length ? errs.join(' | ') : 'none');
  const kb = x => (x / 1024).toFixed(0) + ' KB';
  console.log(`   thumbnails: ${cards.length} cards, ${webp} webp${loaded.length ? ', avg ' + kb(loaded.reduce((a, x) => a + 0, 0)) : ''}`);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await p.screenshot({ path: `/tmp/case_cards_${TAG}.png`, fullPage: false });
  await b.close();
})();
