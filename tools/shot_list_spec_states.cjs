// 配置清单"去重前 / 去重后"两帧对照：请求拦截把改前的 index.html 喂给同一份部署，
// 所以两帧只差这一次改动。
const { chromium } = require('playwright');
const fs = require('fs');

// 左边那帧放的是"改前"的 index.html —— 从 git 里取出来再跑：
//   git show <commit>^:index.html > /tmp/index_before_spec.html
const BEFORE = process.env.BEFORE_HTML || '/tmp/index_before_spec.html';
const BUILD = () => {
  const cs = DATA.caseSeries.find(c => c.code === 'SKX-B-1');
  selectedCase = cs; selections = {};
  const pick = (t, code) => { const x = (DATA.parts[t] || []).find(p => p.code === code); if (x) selections[t] = x; };
  pick('bezel', 'B-C-1'); pick('chapterRing', 'CR-H-1'); pick('crystal', 'SJG06B');
  pick('insert', 'DL-4'); pick('dial', 'D1019'); pick('hands', 'H-11');
  pick('crown', 'WC-E-2'); pick('caseback', 'CB-B-1');
  const st = (DATA.parts.strap || []).find(s => /NATO/.test(s.name) && /橄榄/.test(s.nameZh || ''));
  if (st) selections.strap = st;
  goToStep(9); renderParts(); updatePreview(); updateSummary();
};

(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const [tag, before] of [['before', fs.readFileSync(BEFORE, 'utf8')], ['after', null]]) {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 1100 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    if (before) {
      await p.route('**/index.html*', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: before }));
    }
    await p.goto('http://127.0.0.1:8794/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(2600);
    await p.evaluate(BUILD);
    await p.waitForTimeout(700);
    await p.evaluate(() => openBuildPanel());
    await p.waitForTimeout(700);
    const el = await p.$('#buildPanel .bp-box');
    await el.screenshot({ path: `/tmp/spec_${tag}_panel.png` });
    out[tag] = await p.evaluate(() => buildPlainText());
    await ctx.close();
  }
  fs.writeFileSync('/tmp/spec_text.json', JSON.stringify(out, null, 2));
  console.log('--- before ---\n' + out.before + '\n--- after ---\n' + out.after);
  await b.close();
})();
