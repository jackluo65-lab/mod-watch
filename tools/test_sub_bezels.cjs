// SUB 系列回归：SKX 潜航者表壳 → 7 款 B-SUB-* 表圈，图片与缩略图都到位。
//   URL=http://127.0.0.1:8794/index.html node tools/test_sub_bezels.cjs
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8794/index.html';

const EXPECTED = ['bz-sub-1', 'bz-sub-2', 'bz-sub-3', 'bz-sub-4', 'bz-sub-5', 'bz-sub-6', 'bz-sub-8'];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1040 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  const results = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + '  期望 ' + JSON.stringify(want) + '  实际 ' + JSON.stringify(got));
  };

  const series = await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'SKX SUB Case');
    if (!s) return null;
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    return true;
  });
  check('第 1 步有 SKX SUB 系列卡', !!series, true);
  await p.waitForTimeout(700);

  const cases = await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'SKX SUB Case');
    return [...s.querySelectorAll('.case-series-variants .case-card')].map(c => c.dataset.id);
  });
  check('系列里有 SKX 潜航者表壳', cases.includes('skxsub'), true);

  await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'SKX SUB Case');
    s.querySelector('.case-series-variants .case-card').click();
  });
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({ step: document.getElementById('stepTitle').textContent.trim(), id: selectedCase && selectedCase.id }));
  check('选中后进入第 2 步（选择表圈）', [after.id, /表圈/.test(after.step)], ['skxsub', true]);

  await p.waitForTimeout(1400);
  const bez = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#list-bezel .part-item[data-id]')];
    return {
      ids: items.map(el => el.dataset.id),
      srcs: items.map(el => { const i = el.querySelector('img'); return i ? (i.getAttribute('src') || '') : ''; }),
      labels: items.map(el => el.textContent.replace(/\s+/g, ' ').trim()),
      broken: items.filter(el => { const i = el.querySelector('img'); return i && i.complete && i.naturalWidth === 0; }).length,
    };
  });
  check('表圈步骤给出 7 个 B-SUB-* 选项', bez.ids, EXPECTED);
  check('每张卡都用缩略图（img/bezel/thumb/*.webp）',
    bez.srcs.every(s => s.includes('/thumb/B-SUB-') && s.endsWith('.webp')), true);
  check('没有加载失败的卡片图', bez.broken, 0);
  check('卡片名称带颜色（7 条都写出来了）',
    bez.labels.every((t, i) => /（(银色|黑色|金色|玫瑰金)）/.test(t)) && bez.labels.length === 7, true);
  check('黑色两款标成 Steel / PVD',
    bez.labels.filter(t => /PVD/.test(t)).length, 2);

  await p.evaluate(() => document.querySelector('#list-bezel .part-item[data-id="bz-sub-1"]').click());
  await p.waitForTimeout(1000);
  const picked = await p.evaluate(() => ({
    code: selections.bezel && selections.bezel.code,
    hasLayer: [...document.querySelectorAll('#imgStack img')].some(i => (i.getAttribute('src') || '').includes('B-SUB-1.png')),
  }));
  check('选中 B-SUB-1：编号正确且图层进了预览', picked, { code: 'B-SUB-1', hasLayer: true });

  const inserted = await p.evaluate(() => {
    // 再点一次 = 取消（开关行为），列表必须完好
    document.querySelector('#list-bezel .part-item[data-id="bz-sub-1"]').click();
    return { cleared: !selections.bezel, still: document.querySelectorAll('#list-bezel .part-item[data-id]').length };
  });
  check('再点一次取消，7 个选项仍在', inserted, { cleared: true, still: 7 });

  check('无 JS 报错', errs.length, 0);

  const pass = results.filter(Boolean).length;
  console.log('\nRESULT: ' + pass + ' passed, ' + (results.length - pass) + ' failed');
  if (pass !== results.length) process.exitCode = 1;
  await b.close();
})();
