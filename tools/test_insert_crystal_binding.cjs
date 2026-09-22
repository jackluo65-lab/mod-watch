const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8794/index.html';

// SJG06 is a flat-insert crystal: picking it must leave only the flat ceramic inserts on the
// table, and any sloped insert already chosen has to fall away. SJG02 constrains nothing.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const bad = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const snap = () => page.evaluate(() => {
    const ins = [...document.querySelectorAll('#list-insert .part-item')];
    return {
      insertCount: ins.length,
      ids: ins.map(el => el.dataset.id),
      allFlat: ins.every(el => /^(dl|zl|dn|zn|sn)-/.test(el.dataset.id)),
      pickedInsert: selections.insert ? selections.insert.code : null,
      pickedCrystal: selections.crystal ? selections.crystal.code : null,
      previewInsert: (() => {
        const im = [...document.querySelectorAll('#imgStack img')].find(i => (i.getAttribute('src') || '').includes('/insert/'));
        return im ? im.getAttribute('src').split('/').pop() : null;
      })()
    };
  });

  const pick = (ptype, code) => page.evaluate(([ptype, code]) => {
    const p = (DATA.parts[ptype] || []).find(x => x.code === code);
    selectPart(ptype, p);
  }, [ptype, code]);

  const reset = () => page.evaluate(() => {
    selectedCase = DATA.caseSeries.find(x => x.code === 'SKX-B-1');
    selections = {};
    goToStep(1);
    renderParts();
    updatePreview();
  });

  const results = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + '  期望 ' + JSON.stringify(want) + '  实际 ' + JSON.stringify(got));
  };

  // 1. 没选表镜：全部 125 个插入都在
  await reset();
  let s = await snap();
  check('未选表镜 -> 插入 125 个', [s.insertCount, s.allFlat], [125, false]);

  // 2. 选 SJG06C：只剩平面陶瓷圈
  await pick('crystal', 'SJG06C');
  s = await snap();
  check('选 SJG06C -> 只剩 18 个平面插入', [s.insertCount, s.allFlat], [18, true]);

  // 3. 选 SJG02C：约束解除，125 个回来
  await pick('crystal', 'SJG02C');
  s = await snap();
  check('改选 SJG02C -> 恢复 125 个', [s.insertCount, s.allFlat], [125, false]);

  // 4. SJG02 下选一个斜面插入，再回头换成 SJG06 -> 那个斜面插入必须被清掉
  await pick('insert', 'D-GMT-11');
  s = await snap();
  check('SJG02 + 斜面插入可正常选上', [s.pickedInsert, s.previewInsert], ['D-GMT-11', 'D-GMT-11.png']);
  await pick('crystal', 'SJG06C');
  s = await snap();
  check('换成 SJG06C -> 斜面插入被清空', [s.pickedInsert, s.previewInsert, s.insertCount], [null, null, 18]);

  // 5. 换成平面插入后一切正常
  await pick('insert', 'DL-3');
  s = await snap();
  check('SJG06C + DL-3 可正常选上', [s.pickedInsert, s.previewInsert], ['DL-3', 'DL-3.png']);

  // 6. 平面插入不会被"表镜无约束"误删
  await pick('crystal', 'SJG02C');
  s = await snap();
  check('改回 SJG02C -> 平面插入保留、列表恢复 125', [s.pickedInsert, s.insertCount], ['DL-3', 125]);

  // 7. 别系列不受影响：Vintage 没有平面插入，表镜步骤本身也是空的
  await page.evaluate(() => {
    selectedCase = DATA.caseSeries.find(x => x.code === 'VINTAGE-C-JTF-1');
    selections = {}; renderParts();
  });
  s = await snap();
  check('Vintage -> 仍是 107 个斜面插入', [s.insertCount, s.allFlat], [107, false]);

  console.log('');
  console.log(results.every(Boolean) ? '全部通过 (' + results.length + ')' : '有失败项: ' + results.filter(x => !x).length);
  console.log('HTTP 4xx/5xx: ' + bad.length + (bad.length ? ' -> ' + bad.slice(0, 3).join(' | ') : ''));
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
