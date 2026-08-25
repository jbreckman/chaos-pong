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
await page.click('button[data-diff="easy"]');
await new Promise(r => setTimeout(r, 1000));
await page.evaluate(() => {
  window.__obstacles.clear();
  window.__obstacles.spawn('blackhole', () => 0.5);
  window.__obstacles.spawn('fan', () => 0.3);
  window.__obstacles.spawn('fakeballs', () => 0.4);
});
await new Promise(r => setTimeout(r, 2500));
await page.mouse.move(640, 420);
await page.screenshot({ path: SCRATCH + '/o5-allobstacles.png' });
console.log('ERRORS:', errors.length ? errors : 'none');
await browser.close();
