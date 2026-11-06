// 表把点位换算：4 点位的画稿（WC-*）放到 3 点位的壳上要自动挪到 3 点位置，
// 3 点位的画稿放到 4 点位的壳上同理；同点位不能有位移。
//   URL=http://127.0.0.1:8796/index.html node tools/test_crown_position.cjs
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8796/index.html';

const CASES = [
  { case: 'SKX-B-1', crown: 'wc-a-1', label: '4点壳 + 4点画稿', moved: false, rot: 0 },
  { case: 'SK3-B1', crown: 'wc-a-1', label: '3点壳 + 4点画稿', moved: true, rot: -25 },
  { case: 'SKX-B-1', crown: 'wc3-j-1', label: '4点壳 + 3点画稿', moved: true, rot: 25 },
  { case: 'SK3-B1', crown: 'wc3-j-1', label: '3点壳 + 3点画稿', moved: false, rot: 0 },
  { case: 'SMR-WS-11', crown: 'wc3-j-1', label: '武士(3点, 有 -6 微调) + 3点画稿', moved: true, rot: 0 },
  { case: 'YW-1', crown: 'wc-q-2', label: '鹦鹉螺 + 短款(3点)', moved: false, rot: 0 },
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2000);

  const results = [];
  const check = (label, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    results.push(ok);
    console.log((ok ? '  ✓ ' : '  ✗ ') + label + '  期望 ' + JSON.stringify(want) + '  实际 ' + JSON.stringify(got));
  };

  for (const t of CASES) {
    await p.evaluate(() => goToStep(0));
    await p.waitForTimeout(200);
    const has = await p.evaluate((c) => !!DATA.caseSeries.find(x => x.code === c), t.case);
    check(`${t.case} 存在`, has, true);
    await p.evaluate((c) => selectCase(DATA.caseSeries.find(x => x.code === c).id), t.case);
    await p.waitForTimeout(500);
    await p.evaluate(() => goToStep(7));
    await p.waitForTimeout(500);
    const sel = await p.evaluate((id) => {
      const el = document.querySelector(`#list-crown .part-item[data-id="${id}"]`);
      if (!el) return false;
      // 卡片是开关：换壳时上一款表把可能还留着，已经在选中态就别再点（点一次会取消）
      if (!el.classList.contains('selected')) el.click();
      return true;
    }, t.crown);
    check(`${t.label}：${t.crown} 可选`, sel, true);
    await p.waitForTimeout(800);

    const st = await p.evaluate(() => {
      const im = [...document.querySelectorAll('#imgStack img')]
        .find(i => (i.getAttribute('src') || '').includes('/crown/'));
      return {
        tf: im ? (im.style.transform || '') : null,
        origin: im ? (im.style.transformOrigin || '') : null,
        broken: im ? (im.complete && im.naturalWidth === 0) : true,
      };
    });
    check(`${t.label}：表把进了预览`, st.tf === null, false);
    check(`${t.label}：${t.moved ? '有' : '没有'}位移`, !!st.tf, t.moved);
    check(`${t.label}：${t.rot ? `旋转 ${t.rot}°` : '不旋转'}`,
      st.tf ? (/rotate\((-?\d+(?:\.\d+)?)deg\)/.exec(st.tf) || [0, 0])[1] * 1 : 0, t.rot);
    if (t.rot) check(`${t.label}：绕杆尾旋转`, st.origin !== '' && st.origin !== '50% 50%', true);
    if (t.case === 'SMR-WS-11') check('武士保留 -6px 垂直微调', /-0\.6%/.test(st.tf || ''), true);
    if (t.case === 'SK3-B1' && t.crown === 'wc-a-1') {
      check('跨点位位移是 x+20 / y-105', st.tf, 'translate(2%, -10.5%) rotate(-25deg)');
      check('旋转轴心 = 4点位杆尾 (635,610)', st.origin, '79.375% 61%');
    }
  }

  check('无 JS 报错', errs, []);
  await b.close();
  const bad = results.filter(r => !r).length;
  console.log(`\n${results.length - bad}/${results.length} 通过`);
  process.exit(bad ? 1 : 0);
})();
