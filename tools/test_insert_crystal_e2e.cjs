const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8794/index.html';

// 真实点击走一遍向导：选表壳 -> 下一步到表镜 -> 点 SJG06C -> 下一步，看插入那一步还剩几个。
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const stepInfo = () => page.evaluate(() => ({
    step: currentStep,
    type: stepOrder[currentStep] ? stepOrder[currentStep].type : 'finish',
    title: document.getElementById('stepTitle').textContent.trim(),
    cards: document.querySelectorAll('.part-group.active .part-item').length
  }));

  // 1) 选表壳
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'SKX 3.8 Case');
    s.querySelector('.case-series-header').click();
  });
  await page.waitForTimeout(400);
  await page.locator('.case-series.expanded .case-card').first().click();
  await page.waitForTimeout(800);

  let info = await stepInfo();
  console.log('选完表壳 -> 步骤 ' + info.step + ' (' + info.type + ') ' + info.title + '，卡片 ' + info.cards);

  // 2) 一路 Next 到表镜（每一步都得先挑一个零件，Next 才会亮）
  for (let i = 0; i < 20; i++) {
    info = await stepInfo();
    if (info.type === 'crystal') break;
    const nextDisabled = await page.locator('#btnNext').isDisabled();
    if (nextDisabled) {
      const picked = await page.evaluate(() => {
        const el = document.querySelector('.part-group.active .part-item');
        if (!el) return null;
        el.click();
        return el.querySelector('h5').textContent.trim();
      });
      if (!picked) { console.log('!! 步骤 ' + info.type + ' 没有可选项，无法继续'); break; }
      console.log('  步骤 ' + info.step + ' (' + info.type + ') 选: ' + picked);
      await page.waitForTimeout(500);
    } else {
      await page.locator('#btnNext').click();
      await page.waitForTimeout(600);
    }
  }
  info = await stepInfo();
  console.log('走到表镜步骤 -> step ' + info.step + ' (' + info.type + ')，表镜卡片 ' + info.cards);
  if (info.type !== 'crystal') { console.log('!! 没能走到表镜步骤'); await browser.close(); process.exit(1); }

  const cryNames = await page.evaluate(() =>
    [...document.querySelectorAll('.part-group.active .part-item h5')].map(e => e.textContent.trim()));
  console.log('  可选表镜: ' + cryNames.join(' / '));

  // 3) 点 SJG06C
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.part-group.active .part-item')]
      .find(x => x.querySelector('h5').textContent.includes('SJG06C'));
    el.click();
  });
  await page.waitForTimeout(700);
  const afterPick = await page.evaluate(() => ({
    listNow: document.querySelectorAll('#list-insert .part-item').length,
    guide: document.getElementById('stepGuide').textContent.trim()
  }));
  console.log('点完 SJG06C：插入列表（后台已重建）' + afterPick.listNow + ' 个');
  console.log('  提示语: ' + afterPick.guide);

  // 4) Next 到插入步骤
  await page.locator('#btnNext').click();
  await page.waitForTimeout(800);
  info = await stepInfo();
  const ins = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.part-group.active .part-item')];
    return {
      count: items.length,
      names: items.map(e => e.querySelector('h5').textContent.trim()),
      desc: document.getElementById('desc-insert').textContent.trim(),
      nonFlat: items.map(e => e.dataset.id).filter(id => !/^(dl|zl|dn|zn|sn)-/.test(id))
    };
  });
  console.log('');
  console.log('下一步到「' + info.title + '」：卡片 ' + ins.count + ' 个，非平面插入 ' + ins.nonFlat.length + ' 个');
  console.log('  型号: ' + ins.names.join(', '));

  await page.evaluate(() => {
    const g = document.querySelector('.part-group[data-part="insert"]');
    if (g) g.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/pcn/sjg06-insert-only-flat.png' });

  const pass = ins.count === 18 && ins.nonFlat.length === 0;
  console.log('');
  console.log(pass ? '✓ 端到端通过：SJG06 下插入只剩 18 个平面陶瓷圈' : '✗ 端到端失败');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
