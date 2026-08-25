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
await page.goto('https://jbreckman.github.io/chaos-pong/', { waitUntil: 'networkidle0', timeout: 30000 });
await page.click('button[data-diff="medium"]');
await new Promise(r => setTimeout(r, 1500));
await page.mouse.move(640, 430); await page.mouse.down();
await new Promise(r => setTimeout(r, 500));
await page.mouse.up();
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: SCRATCH + '/live.png' });
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
