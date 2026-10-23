// 新款表壳（PRX / Nautilus / SKX Square / Turtle）回归：
//   第 1 步出现 4 个新系列，卡片用占位图，选中后能进第 2 步并给出对应表圈。
//   URL=http://127.0.0.1:8791/index.html node tools/test_new_families.cjs
//
// ⚠️ 表壳卡是开关：点第二次会 resetAll。所以「展开」点头部、「选择」只点一次。
// ⚠️ 卡片缩略图带 loading="lazy"，折叠时 naturalWidth 恒为 0 —— 不能拿它判断破图，
//    这里直接请求图片 URL。
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const BASE = URL.replace(/\/index\.html.*$/, '/');

const FAMILIES = [
  { cat: 'PRX Case', cases: 3, bezels: 4, first: 'C-PRX-1' },
  { cat: 'Nautilus Case', cases: 8, bezels: 8, first: 'YW-1' },
  { cat: 'SKX Square Case', cases: 8, bezels: 8, first: 'C-AF-1' },
  { cat: 'Turtle Case', cases: 6, bezels: 6, first: 'C-AT-A1' },
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1040 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  const results = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + '  期望 ' + JSON.stringify(want) + '  实际 ' + JSON.stringify(got));
  };

  // 1) 第 1 步：四个新系列都在，款数对
  const grid = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('.case-series').forEach(s => {
      out[s.dataset.category] = s.querySelectorAll('.case-series-variants .case-card').length;
    });
    return out;
  });
  for (const f of FAMILIES) {
    check(`${f.cat} 出现在第 1 步`, !!grid[f.cat], true);
    check(`${f.cat} 有 ${f.cases} 款`, grid[f.cat], f.cases);
  }
  const order = Object.keys(grid);
  check('新系列追加在已有系列之后（AP Case 仍在前）',
    order.indexOf('AP Case') < order.indexOf('PRX Case'), true);

  // 2) 卡片指向占位图，且图真的能取到
  const cards = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.case-series').forEach(s => {
      if (!['PRX Case', 'Nautilus Case', 'SKX Square Case', 'Turtle Case'].includes(s.dataset.category)) return;
      s.querySelectorAll('.case-series-variants .case-card').forEach(c => {
        const img = c.querySelector('img');
        out.push({ cat: s.dataset.category, id: c.dataset.id, src: img ? img.getAttribute('src') : '' });
      });
    });
    return out;
  });
  check('新系列卡片总数 25', cards.length, 25);
  check('全部用占位缩略图',
    cards.every(c => c.src.endsWith('img/placeholder/working-on-it-thumb.png')), true);
  const probe = await p.request.get(BASE + 'img/placeholder/working-on-it-thumb.png');
  check('占位缩略图可访问', probe.status(), 200);
  const probeFull = await p.request.get(BASE + 'img/placeholder/working-on-it.png');
  check('占位主图可访问', probeFull.status(), 200);

  // 3) 逐个系列：展开（点头部）→ 选一次卡片 → 看第 2 步表圈
  for (const f of FAMILIES) {
    await p.evaluate(() => goToStep(0));
    await p.waitForTimeout(400);
    await p.evaluate((cat) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      if (!s.classList.contains('expanded')) s.querySelector('.case-series-header').click();
    }, f.cat);
    await p.waitForTimeout(500);
    const clicked = await p.evaluate((cat) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === cat);
      const card = s.querySelector('.case-series-variants .case-card');
      card.click();
      return card.dataset.id;
    }, f.cat);
    await p.waitForTimeout(1500);

    const state = await p.evaluate(() => ({
      code: selectedCase && selectedCase.code,
      step: document.getElementById('stepTitle').textContent.trim(),
      bezelCount: document.querySelectorAll('#list-bezel .part-item[data-id]:not([data-id="__upload__"])').length,
      bezelSrcs: [...document.querySelectorAll('#list-bezel .part-item img')].map(i => i.getAttribute('src')),
      stackBroken: [...document.querySelectorAll('#imgStack img')].filter(i => i.complete && i.naturalWidth === 0).length,
      stackCount: document.querySelectorAll('#imgStack img').length,
    }));
    check(`${f.cat} 点一次卡片就选中 ${f.first}`, [state.code, /表圈/.test(state.step)], [f.first, true]);
    check(`${f.cat} 表圈给 ${f.bezels} 个`, state.bezelCount, f.bezels);
    check(`${f.cat} 表圈卡全用占位图`,
      state.bezelSrcs.length > 0 && state.bezelSrcs.every(s => s && s.endsWith('img/placeholder/working-on-it-thumb.png')), true);
    check(`${f.cat} 预览层有图且无破图`, [state.stackCount > 0, state.stackBroken], [true, 0]);
  }

  check('无 JS 报错', errs, []);
  await b.close();
  const bad = results.filter(r => !r).length;
  console.log(`\n${results.length - bad}/${results.length} 通过`);
  process.exit(bad ? 1 : 0);
})();
