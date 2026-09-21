const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const TAG = process.env.TAG || 'local';

// My Build panel: every step listed with name + part number, and a lookup that
// switches the build from a number the customer already has.
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2500);

  // 1) open the panel with nothing chosen yet
  await p.evaluate(() => document.getElementById('buildBtn').click());
  await p.waitForTimeout(400);
  const empty = await p.evaluate(() => ({
    shown: document.getElementById('buildPanel').classList.contains('show'),
    rows: document.querySelectorAll('#bpList .bp-row').length,
    empties: document.querySelectorAll('#bpList .bp-row.empty').length,
    first: (document.querySelector('#bpList .bp-row') || {}).textContent.replace(/\s+/g, ' ').trim(),
    copyBtn: !!document.getElementById('bpCopy'),
  }));
  console.log('empty build:', JSON.stringify(empty));

  const lookup = async (code) => {
    await p.evaluate((c) => {
      const i = document.getElementById('bpCode');
      i.value = c;
      document.getElementById('bpApply').click();
    }, code);
    await p.waitForTimeout(500);
    return p.evaluate(() => ({
      msg: document.getElementById('bpMsg').textContent.replace(/\s+/g, ' ').trim(),
      cls: document.getElementById('bpMsg').className,
      buttons: [...document.querySelectorAll('#bpMsg button')].map(b => b.textContent),
      // the panel keeps a monospace code per row — read them all
      codes: [...document.querySelectorAll('#bpList .bp-code')].map(e => e.textContent),
      caseName: selectedCase ? (selectedCase.code + ' ' + selectedCase.id) : null,
      sel: Object.fromEntries(Object.keys(selections).map(k => [k, selections[k].code || selections[k].id])),
    }));
  };

  // 2) a case number
  const byCase = await lookup('skx-b-1');
  console.log('lookup skx-b-1:', JSON.stringify(byCase));

  // 3) a ring number that the current case takes
  const byRing = await lookup('cr-g-3');
  console.log('lookup cr-g-3:', JSON.stringify(byRing));

  // 4) a dial number that exists in two sizes (d207 / d216) — must pick the
  //    one this family actually uses
  const byDial = await lookup('D1067');
  const dialImg = await p.evaluate(() => (selections.dial && selections.dial.image) || '');
  console.log('lookup D1067:', JSON.stringify(byDial), '| image:', dialImg);

  // 5) a bezel number that belongs to another family — must NOT be applied
  const byOther = await lookup('B-JD-1');
  console.log('lookup B-JD-1:', JSON.stringify(byOther));
  const afterOther = await p.evaluate(() => (selections.bezel ? selections.bezel.code : null));

  // 6) the offered one-tap switch
  await p.evaluate(() => { const b = document.querySelector('#bpMsg button'); if (b) b.click(); });
  await p.waitForTimeout(1200);
  const afterSwitch = await p.evaluate(() => ({
    caseCode: selectedCase.code, id: selectedCase.id,
    bezel: selections.bezel ? selections.bezel.code : null,
    msg: document.getElementById('bpMsg').textContent.replace(/\s+/g, ' ').trim(),
    codes: [...document.querySelectorAll('#bpList .bp-code')].map(e => e.textContent),
  }));
  console.log('after one-tap switch:', JSON.stringify(afterSwitch));

  // 7) nonsense
  const nope = await lookup('ZZZ-999');
  console.log('lookup ZZZ-999:', JSON.stringify({ msg: nope.msg, cls: nope.cls }));

  // 8) copy the list
  await p.evaluate(() => document.getElementById('bpCopy').click());
  await p.waitForTimeout(500);
  const copied = await p.evaluate(async () => {
    let clip = '';
    try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'ERR:' + e.message; }
    return { clip, msg: document.getElementById('bpMsg').textContent.trim() };
  });
  console.log('copy:', JSON.stringify(copied).slice(0, 260));

  // 9) the finish page shows the same rows with numbers
  await p.evaluate(() => { closeBuildPanel(); });
  await p.waitForTimeout(300);
  for (let i = 0; i < 20; i++) {
    const t = await p.evaluate(() => document.getElementById('stepTitle').textContent);
    if (/完成|大功告成|配置/.test(t)) break;
    await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])'); if (c) c.click(); });
    await p.waitForTimeout(150);
    await p.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
    await p.waitForTimeout(300);
  }
  const finish = await p.evaluate(() => ({
    step: document.getElementById('stepTitle').textContent,
    rows: document.querySelectorAll('#summaryList .summary-item').length,
    withCode: [...document.querySelectorAll('#summaryList .scode')].map(e => e.textContent),
    sample: (document.querySelector('#summaryList .summary-item') || {}).textContent.replace(/\s+/g, ' ').trim(),
  }));
  console.log('finish page:', JSON.stringify(finish));

  const checks = [
    ['页头有「我的配置」入口，点开面板', empty.shown && empty.copyBtn],
    ['未选任何零件时也列出全部 10 个步骤', empty.rows === 10],
    ['未选的步骤标为「未选择」', empty.empties === 10],
    ['表壳行提示还没选表壳', /还没选表壳/.test(empty.first)],
    ['输入表壳编号 → 切换表壳', !!byCase.caseName && byCase.caseName.startsWith('SKX-B-1')],
    ['面板里的表壳行显示编号', byCase.codes[0] === 'SKX-B-1'],
    ['输入内影圈编号 → 自动选中该零件', byRing.sel.chapterRing === 'CR-G-3'],
    ['面板里的内影圈行显示编号', byRing.codes[2] === 'CR-G-3'],
    ['输入字面编号（两个尺寸档）→ 选到本系列那一档', byDial.sel.dial === 'D1067' && dialImg.includes('d207')],
    ['跨系列编号不硬套：不改变当前选择', afterOther === null],
    ['跨系列编号给出可切换的表壳按钮', byOther.buttons.length > 0 && /B-JD-1/.test(byOther.msg)],
    ['点按钮后切换表壳并应用该零件', afterSwitch.caseCode === 'C-JTF-1' && afterSwitch.bezel === 'B-JD-1'],
    ['切换后编号出现在清单里', afterSwitch.codes.includes('B-JD-1') && afterSwitch.codes.includes('C-JTF-1')],
    ['不存在的编号给出错误提示', nope.cls.includes('err')],
    ['复制清单可用', (copied.clip.includes('MOD WATCH') || copied.msg.length > 0) && copied.clip.length > 40],
    ['完成页清单同样带编号', finish.withCode.length >= 3 && /[A-Z]/.test(finish.sample)],
  ];
  let pass = 0, fail = 0;
  for (const [n, ok] of checks) { console.log(`   ${ok ? '✓' : '✗'} ${n}`); ok ? pass++ : fail++; }
  console.log('   JS errors:', errs.length ? errs.join(' | ') : 'none');
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);

  await p.evaluate(() => openBuildPanel());
  await p.waitForTimeout(500);
  await p.screenshot({ path: `/tmp/build_panel_${TAG}.png` });
  await b.close();
})();
