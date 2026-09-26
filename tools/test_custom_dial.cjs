const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const TAG = process.env.TAG || 'local';
// fixtures live in the repo so the test survives /tmp being cleaned
const IMG = process.env.IMG || __dirname + '/fixtures/dial-test-square.png';

// Custom dial upload: pick a picture, it must be auto-fitted to the family's disc,
// stay adjustable (drag / zoom / rotate) and end up in the preview stack as a
// transparent-disc PNG with the case's exact disc radius.
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2000);

  const stepTo = async (kw) => {
    for (let i = 0; i < 16; i++) {
      const t = await p.evaluate(() => document.getElementById('stepTitle').textContent);
      if (t.includes(kw)) return true;
      await p.evaluate(() => { const c = document.querySelector('.part-group.active .part-item[data-id]:not([data-id="__upload__"])'); if (c) c.click(); });
      await p.waitForTimeout(180);
      await p.evaluate(() => { const n = document.getElementById('btnNext'); if (n && !n.disabled) n.click(); });
      await p.waitForTimeout(400);
    }
    return false;
  };

  // Classic (r207 family)
  await p.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Case');
    (s.querySelector('.case-series-rep') || s.querySelector('.case-series-header')).click();
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await p.waitForTimeout(700);
  if (!(await stepTo('字面'))) console.log('⚠️ never reached the dial step');

  const ctx = await p.evaluate(() => ({
    disc: typeof dialDiscRadius === 'function' ? dialDiscRadius(selectedCase) : null,
    visible: typeof dialVisibleRadius === 'function' ? dialVisibleRadius() : null,
    hasUploadCard: !!document.querySelector('.part-item.part-upload'),
    presets: document.querySelectorAll('.part-group.active .part-item').length,
  }));
  console.log('before upload:', JSON.stringify(ctx));

  // open the editor from the upload card
  await p.evaluate(() => document.querySelector('.part-item.part-upload').click());
  await p.waitForTimeout(400);
  const opened = await p.evaluate(() => ({
    shown: document.getElementById('dialEditor').classList.contains('show'),
    stage: getComputedStyle(document.getElementById('deStageWrap')).display,
    applyDisabled: document.getElementById('deApply').disabled,
    text: document.getElementById('deTitle').textContent,
  }));
  console.log('editor opened:', JSON.stringify(opened));

  // upload + auto-fit
  await p.setInputFiles('#deFile', IMG);
  await p.waitForTimeout(1200);
  const fitted = await p.evaluate(() => ({
    stage: getComputedStyle(document.getElementById('deStageWrap')).display,
    applyDisabled: document.getElementById('deApply').disabled,
    zoom: document.getElementById('deZoom').value,
    rot: document.getElementById('deRotate').value,
    note: document.getElementById('deNote').textContent,
    src: (() => { const s = customDialSrc; return s ? { w: s.bitmap.width, h: s.bitmap.height, zoom: s.zoom, dxr: s.dxr, dyr: s.dyr } : null; })(),
    // is anything actually painted inside the disc?
    painted: (() => {
      const cv = document.getElementById('deCanvas');
      const c = cv.getContext('2d');
      const d = c.getImageData(400, 500, 1, 1).data;
      const edge = c.getImageData(400 + (dialDiscRadius(selectedCase) - 20), 500, 1, 1).data;
      const out = c.getImageData(400 + (dialDiscRadius(selectedCase) + 30), 500, 1, 1).data;
      return { centre: [d[0], d[1], d[2], d[3]], nearEdge: [edge[0], edge[1], edge[2], edge[3]], outside: [out[0], out[1], out[2], out[3]] };
    })(),
  }));
  console.log('after upload (auto-fit):', JSON.stringify(fitted));

  // manual: zoom, rotate, drag
  await p.evaluate(() => {
    const z = document.getElementById('deZoom'); z.value = 180; z.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(250);
  const zoomed = await p.evaluate(() => ({ zoom: customDialSrc.zoom, label: document.getElementById('deZoomVal').textContent }));

  await p.evaluate(() => {
    const box = document.getElementById('deCanvas').getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const cv = document.getElementById('deCanvas');
    const fire = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true }));
    fire('pointerdown', cx, cy);
    fire('pointermove', cx + 30, cy - 20);
    fire('pointerup', cx + 30, cy - 20);
  });
  await p.waitForTimeout(250);
  const dragged = await p.evaluate(() => ({ dxr: +customDialSrc.dxr.toFixed(4), dyr: +customDialSrc.dyr.toFixed(4) }));

  await p.evaluate(() => {
    const r = document.getElementById('deRotate'); r.value = 25; r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(200);
  const rotated = await p.evaluate(() => ({ angle: customDialSrc.angle, label: document.getElementById('deRotVal').textContent }));

  // reset then apply
  await p.evaluate(() => document.getElementById('deCenter').click());
  await p.waitForTimeout(200);
  const reset = await p.evaluate(() => ({ zoom: customDialSrc.zoom, dxr: customDialSrc.dxr, angle: customDialSrc.angle }));
  await p.evaluate(() => document.getElementById('deApply').click());
  await p.waitForTimeout(1200);

  const applied = await p.evaluate(() => {
    const part = selections.dial;
    const stack = [...document.querySelectorAll('#imgStack img')].map(i => (i.getAttribute('src') || '').slice(0, 30) + ' z' + i.style.zIndex);
    return {
      modalShown: document.getElementById('dialEditor').classList.contains('show'),
      custom: !!(part && part.custom),
      partId: part && part.id,
      radius: part && part.radius,
      isDataUrl: !!(part && /^data:image\/png/.test(part.image || '')),
      swatchUrl: !!(part && /^data:image\/png/.test(part.swatch || '')),
      cardShown: !!document.querySelector(`.part-item[data-id="dl-custom"]`),
      cardSelected: !!document.querySelector(`.part-item[data-id="dl-custom"].selected`),
      guide: document.getElementById('stepGuide').textContent,
      nextDisabled: document.getElementById('btnNext').disabled,
      stack,
    };
  });
  console.log('after apply:', JSON.stringify(applied));

  // check the generated disc
  const disc = await p.evaluate(async () => {
    const part = selections.dial;
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = part.image; });
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = 1000;
    const c = cv.getContext('2d'); c.drawImage(im, 0, 0);
    const px = (x, y) => { const d = c.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    const R = part.radius;
    // walk outwards from the centre and find where alpha stops
    let lastOpaque = 0;
    for (let r = 0; r < 400; r += 1) { if (px(400 + r, 500)[3] > 8) lastOpaque = r; }
    return { size: [cv.width, cv.height], R, measuredR: lastOpaque, centre: px(400, 500), corner: px(10, 10), outside: px(400 + R + 25, 500) };
  });
  console.log('generated disc:', JSON.stringify(disc));

  const preLen = await p.evaluate(() => (selections.dial.image || '').length);
  // switch to Vintage (r216): the upload must be re-cut to the bigger disc
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('.case-card')].find(c => c.dataset.id === 'vintage-jtf1');
    el.click();
  });
  await p.waitForTimeout(1200);
  const afterSwitch = await p.evaluate(() => {
    const part = selections.dial;
    return {
      kept: !!(part && part.custom),
      radius: part && part.radius,
      imageChanged: !!(part && /^data:image\/png/.test(part.image || '')),
      disc: dialDiscRadius(selectedCase),
      visible: +dialVisibleRadius().toFixed(1),
    };
  });
  console.log('after switching to Vintage:', JSON.stringify(afterSwitch));

  // selectCase intentionally drops back to step 2 — walk forward again to be sure
  // the rest of the wizard still works with an uploaded dial in place
  await stepTo('表针');
  const nextStep = await p.evaluate(() => document.getElementById('stepTitle').textContent);
  const finalLen = await p.evaluate(() => (selections.dial.image || '').length);

  const checks = [
    ['字面步骤出现「上传自己的字面」卡片', ctx.hasUploadCard],
    ['上传卡不计入预设零件数（步骤不被跳过）', ctx.presets >= 28],
    ['点击后编辑器弹出', opened.shown && opened.stage === 'none' && opened.applyDisabled],
    ['选图后自动进入编辑态、按钮可用', fitted.stage === 'block' && !fitted.applyDisabled && !fitted.note],
    ['自动适配：默认缩放 100%、居中', fitted.src && fitted.src.zoom === 1 && fitted.src.dxr === 0 && fitted.src.dyr === 0],
    ['预览在圆盘内已绘制内容', fitted.painted.centre[3] > 200],
    ['圆盘外没有图片像素（被裁在盘内）', fitted.painted.outside[3] < 60],
    ['缩放滑块生效', zoomed.zoom > 1.7 && zoomed.zoom < 1.9],
    ['拖动生效', Math.abs(dragged.dxr) > 0.01 || Math.abs(dragged.dyr) > 0.01],
    ['旋转滑块生效', rotated.angle === 25 && rotated.label.includes('25')],
    ['居中重置复原', reset.zoom === 1 && reset.dxr === 0 && reset.angle === 0],
    ['应用后弹窗关闭', !applied.modalShown],
    ['selections.dial 是自定义零件', applied.custom && applied.partId === 'dl-custom'],
    ['输出为透明底 PNG dataURL（主图 + 缩略图）', applied.isDataUrl && applied.swatchUrl],
    ['卡片列表出现「我的字面」并高亮', applied.cardShown && applied.cardSelected],
    ['引导文案 + 下一步可用', applied.guide.length > 4 && !applied.nextDisabled],
    ['预览层改用自定义图', applied.stack.some(s => s.startsWith('data:image/png'))],
    ['生成图 800×1000 且圆心在 (400,500)', disc.size[0] === 800 && disc.size[1] === 1000 && disc.centre[3] > 200],
    ['内容直径 = 该系列字面档位半径（207）', Math.abs(disc.measuredR - 207) <= 2],
    ['圆盘外透明、角落透明', disc.outside[3] < 8 && disc.corner[3] < 8],
    ['切换表壳后自定义字面保留', afterSwitch.kept],
    ['切换后按新档位重建（Vintage r216）', afterSwitch.radius === 216 && afterSwitch.disc === 216],
    ['切换表壳后可以继续走完剩余步骤', /表针/.test(nextStep)],
    ['切换后按 r216 重新生成了图片（与 r207 版本不同）', finalLen !== preLen && finalLen > 1000],
  ];
  let pass = 0, fail = 0;
  for (const [n, ok] of checks) { console.log(`   ${ok ? '✓' : '✗'} ${n}`); ok ? pass++ : fail++; }
  console.log('   next step:', nextStep);
  console.log('   404s:', bad.length ? [...new Set(bad)].slice(0, 3).join(' ') : 'none');
  console.log('   JS errors:', errs.length ? errs.join(' | ') : 'none');
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await p.screenshot({ path: `/tmp/custom_dial_${TAG}.png` });
  await b.close();
})();
