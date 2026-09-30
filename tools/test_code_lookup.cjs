const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8794/index.html';

// "My Build" → 想看某个编号长什么样：type a part number, see its picture. Read-only — the
// build must not move until the customer presses 用到这套配置, and a number that is not in the
// catalogue has to be called out instead of silently doing nothing.
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const bad = [], errs = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { window.alert = () => {}; window.confirm = () => true; });

  const results = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + '  期望 ' + JSON.stringify(want) + '  实际 ' + JSON.stringify(got));
  };

  // type into the picture box and read what came back
  const look = (code) => page.evaluate((code) => {
    document.getElementById('bpLookCode').value = code;
    document.getElementById('bpLookBtn').click();
    const box = document.getElementById('bpLookResult');
    return {
      cards: [...box.querySelectorAll('.lk-card')].map(c => ({
        code: (c.querySelector('.lk-code') || {}).textContent,
        type: (c.querySelector('.lk-type') || {}).textContent,
        name: (c.querySelector('.lk-name') || {}).textContent,
        scope: (c.querySelector('.lk-scope') || {}).textContent,
        note: (c.querySelector('.lk-note') || {}).textContent || null,
        img: (c.querySelector('.lk-img img') || {}).getAttribute
          ? c.querySelector('.lk-img img').getAttribute('src') : null,
        hasUse: !!c.querySelector('.lk-use'),
        useLabel: (c.querySelector('.lk-use') || {}).textContent,
      })),
      err: (box.querySelector('.lk-err') || {}).textContent || null,
      picks: Object.keys(selections).filter(k => selections[k]),
      caseId: selectedCase ? selectedCase.id : null,
    };
  }, code);

  const openPanel = () => page.evaluate(() => openBuildPanel());
  const waitImg = () => page.waitForTimeout(900);

  // pick a case first so "does it fit" is a meaningful question
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'SKX 3.8 Case');
    s.querySelector('.case-series-rep').click();
    s.querySelector('.case-series-variants .case-card').click();
  });
  await page.waitForTimeout(900);
  await openPanel();
  await page.waitForTimeout(400);

  // ---- 1. a part number shows its picture, and the build does not move ----
  console.log('== 输入编号 -> 显示图片（不改配置）==');
  let r = await look('CR-G-3');
  await waitImg();
  // CR-G-3 在库里有两份（通用 + AP 专用，编号相同）—— 两张都要列出来，只有装得上的那张给按钮
  check('一个编号 -> 列出全部同编号零件（通用 + AP 专用），类别/名称都在',
    [r.cards.length, r.cards[0].code, r.cards[0].type, /橙圈/.test(r.cards[0].name)], [2, 'CR-G-3', '内影圈', true]);
  check('同编号里只有一个能装在这枚表壳上（只有它带按钮）',
    r.cards.filter(c => c.hasUse).length, 1);
  check('看图卡片的名称不重复编号（类别与编号已各占一行）',
    r.cards.every(c => !c.name || !RegExp(c.code.replace(/-/g, '[-\\s]?'), 'i').test(c.name)), true);
  check('看图卡片的名称不重复类别词',
    r.cards.every(c => !c.name || !c.name.includes(c.type)), true);
  check('卡片里的就是该编号的图片', /cr-g-3\.png$/.test(r.cards[0].img || ''), true);
  check('图片真的能显示出来', await page.evaluate(() => {
    const im = document.querySelector('#bpLookResult .lk-img img');
    return !!im && im.complete && im.naturalWidth > 0;
  }), true);
  check('看图不会动配置（零件仍是空的）', r.picks, []);
  check('适配范围写出来了', /所有系列|个系列/.test(r.cards[0].scope || ''), true);

  // ---- 2. it can be applied deliberately ----
  console.log('\n== 点「用到这套配置」才真的换上去 ==');
  const applied = await page.evaluate(() => {
    document.querySelector('#bpLookResult .lk-use').click();
    return { ring: selections.chapterRing && selections.chapterRing.code,
             row: (() => { const el = [...document.querySelectorAll('#bpList .bp-row')].find(x => /内影圈/.test(x.textContent)); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; })() };
  });
  check('按钮把零件装进配置，清单同步', [applied.ring, /CR-G-3/.test(applied.row)], ['CR-G-3', true]);

  // ---- 3. a number that exists in two sizes shows both ----
  console.log('\n== 同一编号有两档（字面 d207/d216）-> 两张卡片都列出来 ==');
  r = await look('D1067');
  await waitImg();
  check('D1067 -> 两张卡片，编号相同', [r.cards.length, r.cards.every(c => c.code === 'D1067')], [2, true]);
  check('两张卡片的图片不同（两档尺寸各一份）',
    new Set(r.cards.map(c => c.img)).size, 2);

  // ---- 4. an unknown number is called out ----
  console.log('\n== 库里没有的编号 -> 明确提示 ==');
  r = await look('ZZZ-999');
  check('提示「没有这个零件编号」并带上客户输入的编号',
    [!!r.err, /没有这个零件编号/.test(r.err || ''), /ZZZ-999/.test(r.err || '')], [true, true, true]);
  check('提示时没有任何卡片', r.cards.length, 0);
  r = await look('');
  check('空输入提示先输入编号', /请先输入/.test(r.err || ''), true);

  // ---- 5. tolerance: case + separators ----
  console.log('\n== 大小写 / 分隔符不敏感 ==');
  r = await look('b jd 1');
  await waitImg();
  check('「b jd 1」也能找到 B-JD-1', [r.cards.length, r.cards[0].code], [1, 'B-JD-1']);

  // ---- 6. a part that cannot go on the current case says so ----
  console.log('\n== 装不上的编号：给图但不给「用上去」==');
  r = await look('B-AP-1');
  await waitImg();
  check('AP 表圈在 SKX 表壳上：显示图片但没有可用按钮，并说明装不上',
    [r.cards.length, !!r.cards[0].img, r.cards[0].hasUse, /装不上/.test(r.cards[0].note || '')],
    [1, true, false, true]);

  // ---- 7. a case number shows the case and can be switched to ----
  console.log('\n== 输入表壳编号 -> 显示表壳图 + 一键换壳 ==');
  r = await look('C-JTF-1');
  await waitImg();
  check('表壳编号给出一张卡片，类别是「表壳」并有换壳按钮',
    [r.cards.length, r.cards[0].type, r.cards[0].hasUse, /case\/classic|C-JTF-1/.test(r.cards[0].img || '')],
    [1, '表壳', true, true]);
  const switched = await page.evaluate(() => {
    document.querySelector('#bpLookResult .lk-use').click();
    return { caseId: selectedCase.id, code: selectedCase.code };
  });
  check('点「换成这个表壳」真的换掉了', [switched.code, switched.caseId], ['C-JTF-1', 'classic-jtf1']);

  // ---- 8. the two inputs are independent ----
  console.log('\n== 两个输入框互不干扰 ==');
  const both = await page.evaluate(() => ({
    look: document.getElementById('bpLookCode').value,
    find: document.getElementById('bpCode').value,
    msg: document.getElementById('bpMsg').textContent.trim(),
  }));
  check('看图框里有值，查找框仍为空、也没冒出提示', [both.look, both.find, both.msg], ['C-JTF-1', '', '']);

  console.log('');
  console.log(results.every(Boolean) ? '全部通过 (' + results.length + ')' : '有失败项: ' + results.filter(x => !x).length);
  const realBad = bad.filter(u => !/skxsub/.test(u));
  console.log('HTTP 4xx/5xx（除已知的 skxsub 缺图）: ' + realBad.length + (realBad.length ? ' -> ' + realBad.slice(0, 3).join(' | ') : ''));
  console.log('JS errors: ' + errs.length + (errs.length ? ' -> ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  process.exit(results.every(Boolean) && !realBad.length && !errs.length ? 0 : 1);
})();
