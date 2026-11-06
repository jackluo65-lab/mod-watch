// 表把落位：位置按表壳点位平移，方向按「表壳倾角 − 画稿倾角」旋转。
// 4 点位画稿画在 25°，3 点位画稿是水平的；有 5 款拍摄画稿摆在 4 点位槽里却是水平画的，
// 靠 crownAngle=0 补 25°。占位图不参与预览。
//   URL=http://127.0.0.1:8796/index.html node tools/test_crown_position.cjs
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8796/index.html';

const CASES = [
  { case: 'SKX-B-1', crown: 'wc-a-1', label: '4点壳 + 4点斜画稿', moved: false, rot: 0 },
  { case: 'SK3-B1', crown: 'wc-a-1', label: '3点壳 + 4点斜画稿', moved: true, rot: -25 },
  { case: 'SKX-B-1', crown: 'wc3-j-1', label: '4点壳 + 3点平画稿', moved: true, rot: 25 },
  { case: 'SK3-B1', crown: 'wc3-j-1', label: '3点壳 + 3点平画稿', moved: false, rot: 0 },
  // 拍摄画稿摆在 4 点位槽里但画的是水平 → 4 点壳上必须补 25°
  // 拍摄画稿还比 WC-E-1 低 24px，靠数据里的 crownShift 抬回来（moved=true 只关平移）
  { case: 'SKX-B-1', crown: 'wc-a-2', label: '4点壳 + 水平画稿(wc-a-2)', moved: true, rot: 25 },
  { case: 'SMR-WS-11', crown: 'wc3-j-1', label: '武士(3点, 有 -6 微调) + 3点画稿', moved: true, rot: 0 },
  { case: 'YW-1', crown: 'wc-q-2', label: '鹦鹉螺 + 短款(3点)', moved: false, rot: 0 },
  // 占位图（努力更新中）不该进预览
  { case: 'SKX-B-1', crown: 'wc-c-1', label: '4点壳 + 占位图表把', moved: false, rot: 0, hidden: true },
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
      const all = [...document.querySelectorAll('#imgStack img')];
      const im = all.find(i => (i.getAttribute('src') || '').includes('/crown/'));
      const ph = all.find(i => (i.getAttribute('src') || '').includes('/placeholder/'));
      return {
        tf: im ? (im.style.transform || '') : null,
        origin: im ? (im.style.transformOrigin || '') : null,
        placeholder: !!ph,
        broken: im ? (im.complete && im.naturalWidth === 0) : true,
      };
    });
    if (t.hidden) {
      check(`${t.label}：不进预览`, st.tf === null, true);
      check(`${t.label}：占位图没被当成图层`, st.placeholder, false);
    } else {
      check(`${t.label}：表把进了预览`, st.tf === null, false);
      check(`${t.label}：占位图没混进来`, st.placeholder, false);
      check(`${t.label}：${t.moved ? '有' : '没有'}位移`, !!st.tf && /translate/.test(st.tf), t.moved);
      check(`${t.label}：${t.rot ? `旋转 ${t.rot}°` : '不旋转'}`,
        st.tf ? (/rotate\((-?\d+(?:\.\d+)?)deg\)/.exec(st.tf) || [0, 0])[1] * 1 : 0, t.rot);
      if (t.rot) check(`${t.label}：绕画稿中心旋转`, st.origin !== '' && st.origin !== '50% 50%', true);
    }
    if (t.case === 'SMR-WS-11') check('武士保留 -6px 垂直微调', /-0\.6%/.test(st.tf || ''), true);
    if (t.case === 'SK3-B1' && t.crown === 'wc-a-1') {
      check('跨点位位移是 x+20 / y-105', st.tf, 'translate(2.5%, -10.5%) rotate(-25deg)');
      check('旋转轴心 = 4点位锚点 (635,610)', st.origin, '79.375% 61%');
    }
    if (t.case === 'SKX-B-1' && t.crown === 'wc-a-2') {
      check('水平画稿在 4 点壳上：旋转 25° + 按 crownShift 抬 24px', st.tf, 'rotate(25deg) translate(0%, -2.4%)');
    }
  }

  check('无 JS 报错', errs, []);
  await b.close();
  const bad = results.filter(r => !r).length;
  console.log(`\n${results.length - bad}/${results.length} 通过`);
  process.exit(bad ? 1 : 0);
})();
