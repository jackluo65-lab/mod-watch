const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url()));

  await page.goto('http://localhost:8796/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => { try { return !!(DATA && DATA.parts.crown.length); } catch (e) { return false; } });

  // --- 1. 3.8 case: crown step must offer the 16 real crowns
  await page.evaluate(() => selectCase('skx38-b1'));
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const i = stepOrder.findIndex(s => s.type === 'crown');
    goToStep(i);
  });
  await page.waitForTimeout(500);

  const cards = await page.locator('#list-crown .part-item').count();
  console.log('3.8 case -> crown cards:', cards);

  const load = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('#list-crown .part-item img')];
    let ok = 0; const bad = [];
    await Promise.all(imgs.map(im => new Promise(res => {
      const done = () => { im.naturalWidth > 0 ? ok++ : bad.push(im.src.split('/').pop()); res(); };
      if (im.complete) return done();
      im.onload = done; im.onerror = done;
    })));
    return { total: imgs.length, ok, bad };
  });
  console.log('CROWN THUMBS:', JSON.stringify(load));

  await page.locator('#list-crown .part-item').first().click();
  await page.waitForTimeout(1200);
  const dump = await page.evaluate(() => ({
    hint: getComputedStyle(document.getElementById('loadHint')).display,
    desc: document.getElementById('desc-crown').textContent,
    layers: [...document.querySelectorAll('#imgStack img')].map(i => ({
      src: i.src.split('/').pop(), z: getComputedStyle(i).zIndex,
      nw: i.naturalWidth, disp: getComputedStyle(i).display,
      rect: (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }))(i.getBoundingClientRect()),
    })),
  }));
  console.log('AFTER SELECT:', JSON.stringify(dump, null, 1));
  await page.locator('#imgStack').screenshot({ path: '/tmp/crown38/preview-38.png' });
  await page.screenshot({ path: '/tmp/crown38/step-38.png' });

  // --- 2. 3.8 MORE case must also see them
  await page.evaluate(() => selectCase('skx38-more-n1'));
  await page.waitForTimeout(900);
  const moreCards = await page.locator('#list-crown .part-item').count();
  console.log('3.8 MORE case -> crown cards:', moreCards);

  // --- 3. non-3.8 case must see none (step auto-skips)
  for (const id of ['classic-jtf1', 'skx30', 'skxsub']) {
    await page.evaluate(cid => selectCase(cid), id);
    await page.waitForTimeout(800);
    const n = await page.locator('#list-crown .part-item').count();
    const avail = await page.evaluate(() => availablePartsCount.crown);
    console.log(`${id} -> crown cards: ${n}, availablePartsCount: ${avail}`);
  }

  // --- 4. back to 3.8, finish page + EN copy
  await page.evaluate(() => selectCase('skx38-b1'));
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    selectPart('crown', DATA.parts.crown.find(p => p.id === 'wc-b-1'));
    selectPart('bezel', DATA.parts.bezel.find(p => p.id === 'bz-bc-1') || DATA.parts.bezel[0]);
  });
  await page.waitForTimeout(600);
  const enDesc = await page.evaluate(() => {
    const p = DATA.parts.crown.find(x => x.id === 'wc-b-1');
    return { zh: p.description, en: p.descriptionEn, zhName: p.nameZh, enName: p.name };
  });
  console.log('COPY:', JSON.stringify(enDesc, null, 1));

  // --- 5. mobile viewport
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto('http://localhost:8796/index.html', { waitUntil: 'networkidle' });
  await m.waitForFunction(() => { try { return !!(DATA && DATA.parts.crown.length); } catch (e) { return false; } });
  await m.evaluate(() => selectCase('skx38-b1'));
  await m.waitForTimeout(900);
  await m.evaluate(() => goToStep(stepOrder.findIndex(s => s.type === 'crown')));
  await m.waitForTimeout(500);
  await m.locator('#list-crown .part-item').first().click();
  await m.waitForTimeout(1000);
  console.log('mobile crown cards:', await m.locator('#list-crown .part-item').count());
  await m.screenshot({ path: '/tmp/crown38/mobile.png' });

  console.log('errors:', errors.slice(0, 10));
  await browser.close();
})();
