import puppeteer from 'puppeteer-core';
const SCRATCH = process.env.SCRATCH;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--window-size=1280,800', '--mute-audio', '--use-gl=angle'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle0', timeout: 20000 });
await page.screenshot({ path: SCRATCH + '/n0-menu.png' });
await page.click('button[data-mode="triangle"]');
await page.click('button[data-diff="easy"]');
await new Promise(r => setTimeout(r, 1400));
// serve so we can watch a triangle rally with real nets
await page.mouse.move(640, 430); await page.mouse.down();
await new Promise(r => setTimeout(r, 450));
await page.mouse.up();
await new Promise(r => setTimeout(r, 1100));
await page.screenshot({ path: SCRATCH + '/n1-trinets.png' });
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
