const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const TAG = process.env.TAG || 'local';

// Vintage revert check. Walks one Vintage case to the end (insert included) and then
// asserts, on the finished stack: generic ring art, d216 dials, ring above dial,
// ring scale / boreR back to the generic values, hands back to k = 0.9331.
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });

  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2000);

  const cases = await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Vintage Case');
    return [...s.querySelectorAll('.case-series-variants .case-card')].map(c => (c.querySelector('.case-card-name, h5') || c).textContent.trim().split('\n')[0]);
  });
  console.log('Vintage cases:', cases.length, cases.join(' / '));

  const stepTo = async (kw) => {
    for (let i = 0; i < 16; i++) {
      const t = await p.evaluate(() => document.getElementById('stepTitle').textContent);
      if (t.includes(kw)) return true;
      await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item'); if (c) c.click(); });
      await p.waitForTimeout(180);
      await p.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
      await p.waitForTimeout(400);
    }
    return false;
  };
  const pickFirst = async () => p.evaluate(() => {
    const c = document.querySelector('.part-group.active .part-item');
    if (c) c.click();
    return c ? (c.querySelector('.part-item-name, h5') || c).textContent.trim().split('\n')[0] : '-';
  });
  const countInStep = async () => p.evaluate(() => document.querySelectorAll('.part-group.active .part-item').length);

  await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Vintage Case');
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await p.waitForTimeout(700);

  const perStep = {};
  for (const kw of ['内影圈', '字面']) {
    if (!(await stepTo(kw))) { console.log(`⚠️ never reached ${kw}`); continue; }
    perStep[kw] = { n: await countInStep(), pick: await pickFirst() };
    await p.waitForTimeout(600);
  }
  // finish the wizard so the insert is fitted too
  if (!(await stepTo('表针'))) console.log('⚠️ never reached 表针');
  perStep['表针'] = { n: await countInStep() };
  await pickFirst();
  await p.waitForTimeout(900);

  const stack = await p.evaluate(() => [...document.querySelectorAll('#imgStack img')].map(im => ({
    src: (im.getAttribute('src') || '').split('/').slice(-2).join('/'), z: +im.style.zIndex || 0,
    tf: im.style.transform || '', nat: (im.naturalWidth || 0) + 'x' + (im.naturalHeight || 0)
  })));
  const sc = await p.evaluate(() => {
    try { return { k: chapterRingScale(), bore: selections.chapterRing ? selections.chapterRing.boreR : null, handsK: handsScale() }; } catch (e) { return { err: String(e) }; }
  });

  const ring = stack.find(s => s.src.startsWith('chapterRing/')) || stack.find(s => s.src.includes('cr-'));
  const dial = stack.find(s => s.src.includes('dial/') || /WD-D\d+/.test(s.src));
  const hands = stack.find(s => s.src.includes('hands/'));

  console.log('\nfinish stack:');
  stack.forEach(s => console.log('   ', JSON.stringify(s)));
  console.log('scales:', JSON.stringify(sc));
  console.log(`steps: 内影圈 ${perStep['内影圈'] && perStep['内影圈'].n} · 字面 ${perStep['字面'] && perStep['字面'].n} · 表针 ${perStep['表针'] && perStep['表针'].n}`);

  const checks = [
    ['内影圈用通用图 img/chapterRing/cr-*.png（非 vintage/）', !!ring && !ring.src.includes('vintage/')],
    ['内影圈的图在 <img> 里真的加载出来了（非 0 宽）', !!ring && !ring.nat.startsWith('0x')],
    ['字面用 d216 那套（不是已删除的 d226）', !!dial && dial.src.includes('d216/') && !dial.src.includes('d226/')],
    ['字面图加载正常', !!dial && !dial.nat.startsWith('0x')],
    ['内影圈画在字面之上', !!ring && !!dial && ring.z > dial.z],
    ['内影圈缩放回到通用值 1.02148（装了插入件）', /1\.02148/.test(ring ? ring.tf : '')],
    ['内影圈内孔 boreR 回到 187.6', sc.bore === 187.6],
    ['表针缩放 k 回到 0.9331（秒针尖端落在内孔内侧 5px）', !!sc.handsK && Math.abs(sc.handsK - 0.9331) < 0.002],
    ['内影圈这一步仍是 33 个选项', perStep['内影圈'] && perStep['内影圈'].n === 33],
    ['字面这一步仍是 28 个选项', perStep['字面'] && perStep['字面'].n === 28],
    ['表针这一步是 4 个真图选项', perStep['表针'] && perStep['表针'].n === 4],
    ['表针画在字面之上', !!hands && !!dial && hands.z > dial.z],
  ];
  let pass = 0, fail = 0;
  for (const [name, ok] of checks) { console.log(`   ${ok ? '✓' : '✗'} ${name}`); ok ? pass++ : fail++; }

  await (await p.$('#imgStack')).screenshot({ path: `/tmp/vintage_revert_${TAG}.png` });

  console.log('\n--- sweep: all 6 Vintage cases ---');
  for (const nm of cases) {
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(1200);
    await p.evaluate((name) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Vintage Case');
      (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
      const card = [...s.querySelectorAll('.case-series-variants .case-card')].find(c => (c.querySelector('.case-card-name, h5') || c).textContent.trim().split('\n')[0] === name);
      card.click();
    }, nm);
    await p.waitForTimeout(600);
    await stepTo('内影圈');
    const n = await countInStep();
    console.log(`   ${nm}: 内影圈 ${n} 个 ${n === 33 ? '✓' : '✗'} · 字面 ${await (async () => { await stepTo('字面'); return countInStep(); })()} 个`);
    n === 33 ? pass++ : fail++;
  }

  console.log('\n404s:', bad.length ? [...new Set(bad)].slice(0, 6).join(' ') : 'none');
  console.log('JS errors:', errs.length ? errs.join(' | ') : 'none');
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await b.close();
})();
