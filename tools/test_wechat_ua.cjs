const { chromium, webkit } = require('playwright');

const WECHAT_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2c) NetType/WIFI Language/zh_CN';
const WECHAT_ANDROID = 'Mozilla/5.0 (Linux; Android 13; V2254A Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231202 MicroMessenger/8.0.44.2502(0x28002c38) WeChat/arm64';
const URL = process.env.URL || 'https://www.mod-watch.com/index.html';

async function run(engine, name, ua) {
  let b;
  try {
    b = await engine.launch();
  } catch (e) {
    console.log(`\n[${name}] skipped: ${String(e).split('\n')[0].slice(0, 80)} (browser not installed)`);
    return;
  }
  const ctx = await b.newContext({
    userAgent: ua, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
  });
  const p = await ctx.newPage();
  const errs = [], failed = [], bad = [];
  p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  p.on('requestfailed', r => failed.push(r.url().split('/').slice(-2).join('/') + ' :: ' + (r.failure() || {}).errorText));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().split('/').slice(-2).join('/')); });

  const t0 = Date.now();
  try {
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(4000);
  } catch (e) { console.log(`[${name}] goto failed: ${e.message.split('\n')[0]}`); }
  const loadMs = Date.now() - t0;

  const state = await p.evaluate(() => ({
    title: document.title,
    bodyLen: document.body ? document.body.innerText.length : -1,
    series: document.querySelectorAll('.case-series').length,
    cards: document.querySelectorAll('.case-card').length,
    step: (document.getElementById('stepTitle') || {}).textContent || null,
    hint: (document.getElementById('loadHint') || {}).textContent || null,
    hintShown: (() => { const h = document.getElementById('loadHint'); return h ? getComputedStyle(h).display : 'absent'; })(),
    imgs: document.querySelectorAll('#imgStack img').length,
    brokenImgs: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
    totalImgs: document.images.length,
  })).catch(e => ({ err: String(e) }));
  console.log(`\n[${name}] ${loadMs}ms`);
  console.log('   ', JSON.stringify(state));

  // tap through: enter the first series, pick the first case, screenshot
  try {
    await p.evaluate(() => {
      const s = document.querySelector('.case-series');
      if (!s) return;
      const h = s.querySelector('.case-series-rep') || s.querySelector('.case-series-header');
      if (h) h.click();
    });
    await p.waitForTimeout(600);
    await p.evaluate(() => { const c = document.querySelector('.case-series-variants .case-card'); if (c) c.click(); });
    await p.waitForTimeout(1200);
    const after = await p.evaluate(() => ({
      step: (document.getElementById('stepTitle') || {}).textContent || null,
      items: document.querySelectorAll('.part-group.active .part-item').length,
      imgs: document.querySelectorAll('#imgStack img').length,
    }));
    console.log('    after tap:', JSON.stringify(after));
  } catch (e) { console.log('    tap failed:', String(e).split('\n')[0]); }

  await p.screenshot({ path: `/tmp/wechat_${name}.png`, fullPage: false }).catch(() => {});
  console.log('    pageerrors:', errs.length ? errs.slice(0, 3).join(' | ') : 'none');
  console.log('    req failed:', failed.length ? [...new Set(failed)].slice(0, 4).join(' | ') : 'none');
  console.log('    4xx/5xx   :', bad.length ? [...new Set(bad)].slice(0, 4).join(' | ') : 'none');
  await b.close();
}

(async () => {
  await run(webkit, 'ios-webkit', WECHAT_IOS);
  await run(chromium, 'android-x5', WECHAT_ANDROID);
})();
