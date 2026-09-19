const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:8791/index.html';
const OUT = process.env.OUT || '/tmp/cl_live.png';
const SHOT_STEP = process.env.SHOT_STEP || '';

const txt = s => (s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  const step = async () => page.evaluate(() => {
    const active = document.querySelector('.step.active') || document.querySelector('.step[style*="block"]');
    const list = document.querySelector('.part-list.active') || document.querySelector('.part-list');
    const cards = document.querySelectorAll('.part-group.active .part-item');
    const stack = [...document.querySelectorAll('#imgStack img')].map(im => ({
      z: im.style.zIndex, src: im.getAttribute('src'), tf: im.style.transform || ''
    }));
    return {
      title: document.getElementById('stepTitle').textContent,
      guide: document.getElementById('stepGuide').textContent,
      cards: cards.length,
      stack,
      hint: getComputedStyle(document.getElementById('loadHint')).display,
      btnDisabled: document.getElementById('btnNext').disabled
    };
  });

  // enter the Classic Retro series
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Retro Case');
    s.querySelector('.case-series-header').click();
  });
  await page.waitForTimeout(300);
  const nVariants = await page.evaluate(() =>
    [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Retro Case')
      .querySelectorAll('.case-series-variants .case-card').length);
  console.log('variants in series:', nVariants);
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.case-series')].find(x => x.dataset.category === 'Classic Retro Case');
    s.querySelectorAll('.case-series-variants .case-card')[0].click();
  });
  await page.waitForTimeout(600);
  console.log('IMG after case pick:', JSON.stringify((await step()).stack));

  for (let i = 0; i < 12; i++) {
    const s = await step();
    console.log(`\n--- ${txt(s.title)} | cards=${s.cards} | nextDisabled=${s.btnDisabled} | hint=${s.hint}`);
    console.log('    guide:', txt(s.guide));
    console.log('    stack:', s.stack.map(x => `${x.src.split('/').pop()}(z${x.z}${x.tf ? ' ' + x.tf : ''})`).join(' > '));
    if (SHOT_STEP && txt(s.title).includes(SHOT_STEP)) {
      await page.screenshot({ path: OUT });
      console.log('    shot -> ' + OUT);
    }
    if (s.cards > 0) {
      await page.click('.part-group.active .part-item');
      await page.waitForTimeout(400);
    }
    const before = s.title;
    await page.click('#btnNext');
    await page.waitForTimeout(500);
    const after = (await step()).title;
    if (before === after) { console.log('\n(next did not advance — done or blocked)'); break; }
  }

  await page.screenshot({ path: OUT.replace('.png', '_finish.png') });
  console.log('\nfinal shot -> ' + OUT.replace('.png', '_finish.png'));
  await browser.close();
})();
