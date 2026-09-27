const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8794/index.html';

// Nine crystals, eleven families. Every case must actually offer a crystal — before this
// suite existed, four families referenced deleted ids and their step silently offered
// nothing at all, which looks identical to "this case takes no crystal".
//
// Expected option counts, and why:
//   SKX 3.8 / 3.8 MORE / 3.0 / SUB / Samurai  6  SJG02 x3 (sloped inserts) + SJG06 x3 (flat)
//   Classic / Explorer / Pilot / Vintage      3  SJG02 x3 — Vintage *only* because it has
//                                                 sloped inserts; SJG06 would empty that step
//   AP                                        3  SJG42 x3
//   Classic Retro                             0  no crystal of its own yet (art pending)
const EXPECT = {
  'SKX 3.8 Case': 6, 'SKX 3.8 MORE CASE': 6, 'SKX 3.0 Case': 6, 'SKX SUB Case': 6,
  'SKX Samurai Case': 6, 'Classic Case': 3, 'Explorer': 3, 'Pilot Case': 3,
  'Vintage Case': 3, 'AP Case': 3, 'Classic Retro Case': 0,
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const bad = [], errs = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const results = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + '  期望 ' + JSON.stringify(want) + '  实际 ' + JSON.stringify(got));
  };

  // select a family's first case and fill in everything that precedes the crystal step,
  // so the counts come from the same path the customer walks
  const enterFamily = (category) => page.evaluate((category) => {
    const c = DATA.caseSeries.find(x => x.category === category);
    selectedCase = c;
    selections = {};
    ['bezel', 'chapterRing'].forEach(t => {
      const refs = c.compatibleParts[t] || [];
      const p = (DATA.parts[t] || []).find(x => refs.includes(x.id));
      if (p) selections[t] = p;
    });
    goToStep(2);
    renderParts();
    updatePreview();
    return { id: c.id, code: c.code };
  }, category);

  const crystalStep = () => page.evaluate(() => {
    const items = [...document.querySelectorAll('#list-crystal .part-item[data-id]')];
    return {
      count: items.length,
      codes: items.map(el => (DATA.parts.crystal.find(p => p.id === el.dataset.id) || {}).code),
      guide: document.getElementById('stepGuide').textContent.trim(),
    };
  });

  const pickCrystal = (code) => page.evaluate((code) => {
    const p = (DATA.parts.crystal || []).find(x => x.code === code);
    selectPart('crystal', p);
  }, code);

  const insertStep = () => page.evaluate(() => {
    const items = [...document.querySelectorAll('#list-insert .part-item[data-id]')];
    return { count: items.length, flat: items.filter(el => /^(dl|zl|dn|zn|sn)-/.test(el.dataset.id)).length };
  });

  const previewHas = (frag) => page.evaluate((frag) => {
    const im = [...document.querySelectorAll('#imgStack img')].find(i => (i.getAttribute('src') || '').includes(frag));
    return im ? im.getAttribute('src').split('/').pop() : null;
  }, frag);

  // ---- 1. the matrix: every family offers the crystals it should ----
  console.log('== 每个系列的表镜选项 ==');
  const seen = {};
  for (const [category, want] of Object.entries(EXPECT)) {
    const c = await enterFamily(category);
    const s = await crystalStep();
    seen[category] = { caseId: c.id, ...s };
    const ok = s.count === want;
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + `${category.padEnd(20)} ${String(s.count).padStart(2)} 个  ${s.codes.join(' ')}`);
  }
  check('没有系列的表镜步骤是 0 选项（Classic Retro 除外，它还没自己的表镜）',
    Object.entries(seen).filter(([k, v]) => v.count === 0).map(([k]) => k), ['Classic Retro Case']);

  // ---- 2. the four families that used to be empty: pick one for real ----
  console.log('\n== 新接通表镜的四个系列（选 SJG02C 后预览要真的多一层玻璃）==');
  for (const category of ['Classic Case', 'Explorer', 'Pilot Case', 'Vintage Case']) {
    await enterFamily(category);
    const before = await previewHas('/crystal/');
    await pickCrystal('SJG02C');
    await page.waitForTimeout(700);
    const picked = await page.evaluate(() => selections.crystal && selections.crystal.code);
    const layer = await previewHas('/crystal/');
    const z = await page.evaluate(() => {
      const im = [...document.querySelectorAll('#imgStack img')].find(i => (i.getAttribute('src') || '').includes('/crystal/'));
      const ring = [...document.querySelectorAll('#imgStack img')].find(i => (i.getAttribute('src') || '').includes('/chapterRing/'));
      return im && ring ? { crystal: +getComputedStyle(im).zIndex, ring: +getComputedStyle(ring).zIndex } : null;
    });
    check(`${category}：SJG02C 选得上且预览出现玻璃`, [before, picked, layer], [null, 'SJG02C', 'SJG02C.png']);
    check(`${category}：玻璃在内影圈之上`, z && z.crystal > z.ring, true);
  }

  // ---- 3. Vintage: SJG02 must keep its 107 sloped inserts; SJG06 would wipe them ----
  console.log('\n== Vintage：SJG02 保插入，SJG06 会把插入清空 ==');
  await enterFamily('Vintage Case');
  await pickCrystal('SJG02C');
  let ins = await insertStep();
  check('Vintage + SJG02C -> 107 个斜面插入', [ins.count, ins.flat], [107, 0]);
  await pickCrystal('SJG06C');
  ins = await insertStep();
  check('Vintage + SJG06C -> 插入步骤空（所以 Vintage 只能给 SJG02）', [ins.count], [0]);

  // ---- 4. the families with no insert step stay that way ----
  console.log('\n== 没有插入步骤的系列：表镜不影响它们的插入列表 ==');
  for (const category of ['Classic Case', 'Explorer', 'Pilot Case']) {
    await enterFamily(category);
    await pickCrystal('SJG02C');
    ins = await insertStep();
    const deps = await page.evaluate(() => (selectedCase.compatibleParts.insert || []).length);
    check(`${category}：插入仍是 0 个引用（步骤自动跳过）`, [deps, ins.count], [0, 0]);
  }

  // ---- 5. the SKX families are untouched ----
  console.log('\n== SKX 系列回归 ==');
  await enterFamily('SKX 3.8 Case');
  await pickCrystal('SJG02C');
  ins = await insertStep();
  check('SKX 3.8 + SJG02C -> 仍是 107 斜面 / 0 平面', [ins.count, ins.flat], [107, 0]);
  await pickCrystal('SJG06C');
  ins = await insertStep();
  check('SKX 3.8 + SJG06C -> 仍是 18 平面 / 0 斜面', [ins.count, ins.flat], [18, 18]);

  // ---- 6. the crystal step is no longer auto-skipped: walk the whole wizard for real ----
  // A family whose crystal step used to be empty skipped it; now the customer has to pick,
  // so the step order and the Next button have to behave. Click through, don't inject.
  console.log('\n== 真点击走完向导（Classic / Vintage）==');
  for (const category of ['Classic Case', 'Vintage Case']) {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1800);
    await page.evaluate((category) => {
      const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === category);
      (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
      s.querySelectorAll('.case-series-variants .case-card')[0].click();
    }, category);
    await page.waitForTimeout(800);
    const seen = [];
    let sawCrystal = false, stuck = false;
    for (let i = 0; i < 40; i++) {
      const title = await page.evaluate(() => document.getElementById('stepTitle').textContent);
      if (seen[seen.length - 1] !== title) seen.push(title);
      if (/字面|字面/.test(title)) break;
      if (/表镜/.test(title)) sawCrystal = true;
      const opts = await page.evaluate(() => document.querySelectorAll('.part-group.active .part-item[data-id]:not([data-id="__upload__"])').length);
      if (opts) {
        await page.evaluate(() => document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])').click());
        await page.waitForTimeout(160);
      }
      const advanced = await page.evaluate(() => {
        const n = document.getElementById('btnNext');
        if (n && !n.disabled) { n.click(); return true; }
        return false;
      });
      if (!advanced) { stuck = true; break; }
      await page.waitForTimeout(320);
    }
    check(`${category}：表镜这一步真的走到了，且向导能一路走到字面`, [sawCrystal, stuck], [true, false]);
    console.log('      经过的步骤:', seen.join(' → '));
  }

  console.log('');
  console.log(results.every(Boolean) ? '全部通过 (' + results.length + ')' : '有失败项: ' + results.filter(x => !x).length);
  console.log('HTTP 4xx/5xx: ' + bad.length + (bad.length ? ' -> ' + bad.slice(0, 3).join(' | ') : ''));
  console.log('JS errors: ' + errs.length + (errs.length ? ' -> ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  process.exit(results.every(Boolean) && !bad.length && !errs.length ? 0 : 1);
})();
