import puppeteer from 'puppeteer-core';
const SCRATCH = process.env.SCRATCH;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--mute-audio', '--use-gl=angle'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: SCRATCH + '/m1-menu.png' });
await page.tap('button[data-diff="easy"]');
await new Promise(r => setTimeout(r, 1200));
// touch-serve: press & hold via touchscreen
await page.touchscreen.touchStart(195, 500);
await new Promise(r => setTimeout(r, 500));
await page.touchscreen.touchEnd();
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: SCRATCH + '/m2-rally.png' });
const st = await page.evaluate(() => document.getElementById('scoreboard').classList.contains('show'));
console.log('scoreboard shown:', st, '| ERRORS:', errors.length ? errors : 'none');
await browser.close();
