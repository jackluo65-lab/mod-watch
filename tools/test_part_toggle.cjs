const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8794/index.html';
const IMG = process.env.IMG || __dirname + '/fixtures/dial-test-square.png';

// Clicking a part selects it; clicking the same card again clears it. Everything that
// depends on a selection has to follow: the card highlight, the description, the preview
// stack, the summary row — and the 「下一步」 button, which must grey out again on a
// required step and go back to 「跳过这一步 →」 on an optional one.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const bad = [], errs = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);

  const results = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + '  期望 ' + JSON.stringify(want) + '  实际 ' + JSON.stringify(got));
  };

  // everything a toggle should move, read in one go
  const snap = (type) => page.evaluate((type) => {
    const btn = document.getElementById('btnNext');
    const sel = selections[type];
    return {
      picked: sel ? (sel.code || sel.name) : null,
      marked: [...document.querySelectorAll(`.part-item[data-type="${type}"].selected`)].map(el => el.dataset.id),
      desc: document.getElementById('desc-' + type).textContent.trim(),
      guide: document.getElementById('stepGuide').textContent.trim(),
      nextLabel: btn.textContent.trim(),
      nextDisabled: btn.disabled,
      layers: [...document.querySelectorAll('#imgStack img')].map(i => (i.getAttribute('src') || '').split('/').pop()),
    };
  }, type);

  const click = (type, id) => page.evaluate(([type, id]) => {
    const el = document.querySelector(`.part-item[data-type="${type}"][data-id="${id}"]`);
    if (!el) throw new Error('no card ' + type + '/' + id);
    el.click();
  }, [type, id]);

  const firstId = (type) => page.evaluate((type) => {
    const el = document.querySelector(`.part-item[data-type="${type}"][data-id]:not([data-id="__upload__"])`);
    return el ? el.dataset.id : null;
  }, type);

  const goStep = (i) => page.evaluate((i) => { goToStep(i); renderParts(); }, i);

  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'SKX 3.8 Case');
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await page.waitForTimeout(900);

  // ---- 1. a required step: select, then click the same card again ----
  console.log('== 必选步骤（表圈）：再点一次取消 ==');
  await goStep(1);
  await page.waitForTimeout(300);
  const bzId = await firstId('bezel');
  const bzBefore = await snap('bezel');
  await click('bezel', bzId);
  await page.waitForTimeout(500);
  const bzOn = await snap('bezel');
  await click('bezel', bzId);
  await page.waitForTimeout(500);
  const bzOff = await snap('bezel');

  check('点第一下：选中并高亮', [!!bzOn.picked, bzOn.marked.length], [true, 1]);
  check('选中后提示变成「已选…」且下一步可点', [/已选/.test(bzOn.guide), bzOn.nextDisabled], [true, false]);
  check('点第二下：取消选择', [bzOff.picked, bzOff.marked.length], [null, 0]);
  check('取消后提示回到必选、下一步重新置灰',
    [/必选/.test(bzOff.guide), bzOff.nextLabel, bzOff.nextDisabled], [true, '下一步 →', true]);
  check('取消后描述回到占位文案', bzOff.desc === bzBefore.desc, true);
  check('取消后预览里没有表圈图层（也没有白色空洞）',
    [bzOff.layers.some(f => /bezel/i.test(f)), bzOff.layers.some(f => /dial-blank/.test(f))], [false, true]);

  // ---- 2. picking a sibling replaces, it does not toggle the old one ----
  console.log('\n== 同一组里换一个：直接换掉，不是叠加 ==');
  await click('bezel', bzId);
  await page.waitForTimeout(350);
  const bzIds = await page.evaluate(() => [...document.querySelectorAll('.part-item[data-type="bezel"][data-id]')].map(el => el.dataset.id));
  await click('bezel', bzIds[1]);
  await page.waitForTimeout(400);
  const swapped = await snap('bezel');
  check('换成另一个表圈后只有一个被选中', [swapped.marked.length, swapped.marked[0]], [1, bzIds[1]]);

  // ---- 3. an optional step: the skip button comes back ----
  console.log('\n== 选填步骤（插入）：取消后按钮回到「跳过这一步 →」 ==');
  await goStep(4);
  await page.waitForTimeout(300);
  const inId = await firstId('insert');
  const inBefore = await snap('insert');
  await click('insert', inId);
  await page.waitForTimeout(400);
  const inOn = await snap('insert');
  await click('insert', inId);
  await page.waitForTimeout(400);
  const inOff = await snap('insert');
  check('选填步骤提示本来是「可跳过」', /可跳过/.test(inBefore.guide), true);
  check('选中插入后按钮变回「下一步 →」', [!!inOn.picked, inOn.nextLabel], [true, '下一步 →']);
  check('取消后按钮回到「跳过这一步 →」且仍可点',
    [inOff.picked, inOff.nextLabel, inOff.nextDisabled], [null, '跳过这一步 →', false]);
  check('取消后提示重新写「可跳过」', /可跳过/.test(inOff.guide), true);

  // ---- 4. clearing the crystal puts the whole insert list back ----
  console.log('\n== 取消表镜：插入清单从 18 个平面恢复到 125 个 ==');
  await goStep(3);
  await page.waitForTimeout(300);
  await page.evaluate(() => { selectPart('crystal', DATA.parts.crystal.find(c => c.code === 'SJG06C')); });
  await page.waitForTimeout(700);
  const withCrystal = await page.evaluate(() => ({
    inserts: document.querySelectorAll('#list-insert .part-item[data-id]').length,
    crystal: selections.crystal && selections.crystal.code,
  }));
  await page.evaluate(() => {
    const c = DATA.parts.crystal.find(x => x.code === 'SJG06C');
    selectPart('crystal', c);            // click the same one again = clear
  });
  await page.waitForTimeout(700);
  const noCrystal = await page.evaluate(() => ({
    inserts: document.querySelectorAll('#list-insert .part-item[data-id]').length,
    crystal: selections.crystal ? selections.crystal.code : null,
    marked: document.querySelectorAll('.part-item[data-type="crystal"].selected').length,
  }));
  check('选 SJG06C 时插入 18 个', [withCrystal.crystal, withCrystal.inserts], ['SJG06C', 18]);
  check('取消表镜后插入恢复到 125 个且高亮清掉',
    [noCrystal.crystal, noCrystal.inserts, noCrystal.marked], [null, 125, 0]);

  // ---- 5. the panel follows ----
  console.log('\n== 「我的配置」跟着变 ==');
  const rows = await page.evaluate(() => {
    openBuildPanel();
    const pick = (kw) => {
      const el = [...document.querySelectorAll('#bpList .bp-row')].find(r => r.textContent.includes(kw));
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    };
    return { bezel: pick('表圈'), crystal: pick('表镜'), insert: pick('插入') };
  });
  check('已选的表圈显示编号，取消的表镜写「未选择」',
    [/B-/.test(rows.bezel), /表镜.*未选择/.test(rows.crystal)], [true, true]);
  check('取消的插入写「未选择（可跳过）」', /插入.*未选择（可跳过）/.test(rows.insert), true);

  // ---- 6. the customer's own dial: the card toggles, the pencil edits ----
  console.log('\n== 自定义字面：点卡片也能取消，✎ 只负责改图 ==');
  await goStep(5);
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('.part-item.part-upload').click(); });
  await page.waitForTimeout(400);
  await page.setInputFiles('#deFile', IMG);
  await page.waitForTimeout(1400);
  await page.evaluate(() => document.getElementById('deApply').click());
  await page.waitForTimeout(1400);
  const own1 = await page.evaluate(() => ({
    picked: selections.dial && selections.dial.id,
    marked: document.querySelectorAll('.part-item[data-type="dial"].selected').length,
    hasEdit: !!document.querySelector('.part-item .pi-edit'),
  }));
  await page.evaluate(() => { const el = document.querySelector('.part-item[data-id="' + CUSTOM_DIAL_ID + '"]'); el.click(); });
  await page.waitForTimeout(400);
  const own2 = await page.evaluate(() => ({
    picked: selections.dial ? selections.dial.id : null,
    marked: document.querySelectorAll('.part-item[data-type="dial"].selected').length,
    blank: [...document.querySelectorAll('#imgStack img')].some(i => (i.getAttribute('src') || '').includes('dial-blank')),
  }));
  await page.evaluate(() => { document.querySelector('.part-item .pi-edit').click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('deApply').click());
  await page.waitForTimeout(1400);
  const own3 = await page.evaluate(() => ({
    picked: selections.dial ? selections.dial.id : null,
    marked: document.querySelectorAll('.part-item[data-type="dial"].selected').length,
  }));
  check('上传后自己的字面被选中', [own1.picked, own1.marked, own1.hasEdit], ['dl-custom', 1, true]);
  check('再点一下卡片 → 取消，预览回到空白盘', [own2.picked, own2.marked, own2.blank], [null, 0, true]);
  check('从 ✎ 重新应用同一张图 → 仍是选中（不会被当成取消）',
    [own3.picked === null, own3.marked], [false, 1]);

  console.log('');
  console.log(results.every(Boolean) ? '全部通过 (' + results.length + ')' : '有失败项: ' + results.filter(x => !x).length);
  const realBad = bad.filter(u => !/skxsub/.test(u));
  console.log('HTTP 4xx/5xx（除已知的 skxsub 缺图）: ' + realBad.length + (realBad.length ? ' -> ' + realBad.slice(0, 3).join(' | ') : ''));
  console.log('JS errors: ' + errs.length + (errs.length ? ' -> ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  process.exit(results.every(Boolean) && !realBad.length && !errs.length ? 0 : 1);
})();
