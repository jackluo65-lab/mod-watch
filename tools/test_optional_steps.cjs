const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8794/index.html';

// 插入 / 字面 / 表针 / 表带 are optional: the customer may walk past them without choosing.
// Everything else (case, bezel, chapter ring, crystal, crown, caseback) must still be picked.
//
// The dial is the one that needs a rendering fallback — with no dial the case bore is
// transparent and the white page shows through as if the preview had broken, so the renderer
// drops a blank dial plate in that slot. These checks cover both halves.
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

  const state = () => page.evaluate(() => {
    const btn = document.getElementById('btnNext');
    return {
      step: document.getElementById('stepTitle').textContent.trim(),
      guide: document.getElementById('stepGuide').textContent.trim(),
      nextLabel: btn.textContent.trim(),
      nextDisabled: btn.disabled,
      btnStartsSkip: btn.dataset.startsSkip || null,
      picked: Object.fromEntries(Object.keys(selections).filter(k => selections[k]).map(k => [k, selections[k].code || selections[k].name])),
      layers: [...document.querySelectorAll('#imgStack img')].map(i => (i.getAttribute('src') || '').split('/').pop()),
      skipped: typeof skippedSteps !== 'undefined' ? [...skippedSteps] : null,
    };
  });

  const pickFirst = () => page.evaluate(() => {
    const el = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])');
    if (el) el.click();
  });

  const start = (category) => page.evaluate((category) => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === category);
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  }, category);

  // stub alert so a "required" step can be probed without blocking the run
  await page.evaluate(() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m)); });

  // ---- 1. walk from the case to the finish, skipping every optional step ----
  console.log('== 一路跳过选填步骤 ==');
  await start('SKX 3.8 Case');
  await page.waitForTimeout(900);

  const seen = [], optionalSeen = [];
  for (let i = 0; i < 30; i++) {
    const s = await state();
    if (seen[seen.length - 1] !== s.step) seen.push(s.step);
    const m = s.step.match(/第 (\d+) 步/);
    const stepNo = m ? +m[1] : null;
    if ([5, 6, 7, 10].includes(stepNo)) optionalSeen.push({ stepNo, label: s.nextLabel, disabled: s.nextDisabled, guide: s.guide });
    await page.evaluate(() => document.getElementById('btnNext').click());
    await page.waitForTimeout(420);
    // the finish page hides #btnNext but keeps the last title — read the section instead
    const done = await page.evaluate(() => document.getElementById('finalSection').classList.contains('visible'));
    if (done) break;
    // on a step the wizard insists on, clicking does nothing — pick the first option to move on
    const after = await page.evaluate(() => document.getElementById('btnNext').disabled);
    if (after) { await pickFirst(); await page.waitForTimeout(200); }
  }
  const endState = await page.evaluate(() => ({
    finish: document.getElementById('finalSection').classList.contains('visible'),
    picked: Object.fromEntries(Object.keys(selections).filter(k => selections[k]).map(k => [k, selections[k].code || selections[k].name])),
  }));
  check('四个选填步骤都给出「跳过这一步 →」且按钮可点',
    optionalSeen.map(o => [o.stepNo, o.label, o.disabled]),
    [[5, '跳过这一步 →', false], [6, '跳过这一步 →', false], [7, '跳过这一步 →', false], [10, '跳过这一步 →', false]]);
  check('选填步骤的提示写明「可跳过」', optionalSeen.every(o => /可跳过/.test(o.guide)), true);
  check('跳完选填步骤能走到配置清单页', endState.finish, true);
  console.log('      经过的步骤:', seen.join(' → '));
  console.log('      最终已选:', JSON.stringify(endState.picked));

  // ---- 2. the skipped steps show up as "not chosen (optional)" in the build list ----
  const panelRows = await page.evaluate(() => {
    openBuildPanel();
    const rows = [...document.querySelectorAll('#bpList .bp-row')].map(el => el.textContent.replace(/\s+/g, ' ').trim());
    return { rows, copy: buildPlainText(), badge: document.getElementById('buildCount').textContent };
  });
  const skippedRows = panelRows.rows.filter(r => /未选择（可跳过）/.test(r));
  check('清单里 4 个跳过的选填步骤都写「未选择（可跳过）」', skippedRows.length, 4);
  check('纯文本清单也写明可跳过（工厂能分清"没填"和"不用填"）',
    (panelRows.copy.match(/未选择（可跳过）/g) || []).length, 4);

  // ---- 3. no dial -> nothing is drawn in the dial slot: the case's bore is transparent art,
  //         and the customer sees the case as it is before a dial goes in. (A blank grey plate
  //         lived here for two days; the user read it as "a white cloth over the case".)
  console.log('\n== 不选字面时的预览：开孔保持透明 ==');
  const hasDialLayer = () => page.evaluate(() => [...document.querySelectorAll('#imgStack img')]
    .some(i => { const s = i.getAttribute('src') || ''; return s.includes('/dial/') || s.startsWith('data:image'); }));
  const noDial = await page.evaluate(() => ({ dial: selections.dial ? 'picked' : 'none' }));
  check('没选字面时预览里没有字面图层（开孔透明）', [noDial.dial, await hasDialLayer()], ['none', false]);

  // ---- 4. required steps are still required ----
  console.log('\n== 必选步骤仍然拦人 ==');
  const required = await page.evaluate(() => {
    selectedCase = DATA.caseSeries.find(x => x.category === 'SKX 3.8 Case');
    selections = {}; skippedSteps.clear();
    goToStep(1); renderParts();
    return { optional: OPTIONAL_STEPS.slice() };
  });
  await page.waitForTimeout(300);
  for (const [stepNo, type, label] of [[2, 'bezel', '表圈'], [4, 'crystal', '表镜'], [8, 'crown', '表冠'], [9, 'caseback', '后盖']]) {
    await page.evaluate((i) => { selections = {}; skippedSteps.clear(); goToStep(i); renderParts(); }, stepNo - 1);
    await page.waitForTimeout(250);
    const s = await state();
    const blocked = await page.evaluate(() => { window.__alerts = []; nextStep(); return window.__alerts.length; });
    check(`${label}（第 ${stepNo} 步）是必选：按钮置灰 + 点下一步会提示`,
      [s.nextDisabled, s.nextLabel, blocked > 0], [true, '下一步 →', true]);
  }
  check('选填步骤清单 = 插入 / 字面 / 表针 / 表带', required.optional, ['insert', 'dial', 'hands', 'strap']);

  // ---- 5. skipping is remembered, so going forward again does not stop there ----
  console.log('\n== 跳过过的步骤不再拦第二次 ==');
  await page.evaluate(() => {
    selectedCase = DATA.caseSeries.find(x => x.category === 'SKX 3.8 Case');
    selections = {}; skippedSteps.clear();
    goToStep(3); renderParts();                       // 表镜（必选，先选一个）
  });
  await pickFirst();
  await page.waitForTimeout(250);
  await page.evaluate(() => document.getElementById('btnNext').click());   // -> 插入
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('btnNext').click());   // 跳过插入 -> 字面
  await page.waitForTimeout(400);
  await page.waitForTimeout(400);
  const afterSkip = await state();
  await page.evaluate(() => document.getElementById('btnPrev').click());   // 回到插入
  await page.waitForTimeout(350);
  const backOn = await state();
  await page.evaluate(() => document.getElementById('btnNext').click());   // 再前进
  await page.waitForTimeout(400);
  const forward = await state();
  check('跳过插入后前进落在字面', /字面/.test(afterSkip.step), true);
  check('退回插入那一步再前进，不再重复拦一次', [backOn ? /插入/.test(backOn.step) : false, /字面/.test(forward.step)],
    [true, true]);

  // ---- 6. picking on an optional step un-skips it ----
  console.log('\n== 在选填步骤上真选了零件就照常记下来 ==');
  await page.evaluate(() => { selections = {}; skippedSteps.clear(); goToStep(1); renderParts(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { const c = document.querySelector('#list-bezel .part-item[data-id]'); if (c) c.click(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById('btnNext').click(); });
  await page.waitForTimeout(350);
  await page.evaluate(() => { const c = document.querySelector('#list-chapterRing .part-item[data-id]'); if (c) c.click(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById('btnNext').click(); });
  await page.waitForTimeout(350);
  await page.evaluate(() => { const c = document.querySelector('#list-crystal .part-item[data-id]'); if (c) c.click(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.getElementById('btnNext').click(); });
  await page.waitForTimeout(450);
  const onInsert = await state();
  await pickFirst();                                   // 这次真选一个插入
  await page.waitForTimeout(400);
  const pickedInsert = await page.evaluate(() => ({
    code: selections.insert && selections.insert.code,
    skipped: [...skippedSteps],
    row: (() => { openBuildPanel(); const r = [...document.querySelectorAll('#bpList .bp-row')].find(el => /插入/.test(el.textContent)); return r ? r.textContent.replace(/\s+/g, ' ').trim() : null; })(),
  }));
  check('选了插入后不再标记为跳过', pickedInsert.skipped.includes('insert'), false);
  check('清单里显示的是选中的编号而不是「可跳过」', /^\S*插入/.test(pickedInsert.row) && !/未选择（可跳过）/.test(pickedInsert.row), true);
  console.log('      ', onInsert.step, '->', JSON.stringify(pickedInsert.code), '|', pickedInsert.row);

  console.log('');
  console.log(results.every(Boolean) ? '全部通过 (' + results.length + ')' : '有失败项: ' + results.filter(x => !x).length);
  const realBad = bad.filter(u => !/skxsub/.test(u));
  console.log('HTTP 4xx/5xx（除已知的 skxsub 缺图）: ' + realBad.length + (realBad.length ? ' -> ' + realBad.slice(0, 3).join(' | ') : ''));
  console.log('JS errors: ' + errs.length + (errs.length ? ' -> ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  process.exit(results.every(Boolean) && !realBad.length && !errs.length ? 0 : 1);
})();
