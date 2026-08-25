import puppeteer from 'puppeteer-core';
const SCRATCH = process.env.SCRATCH;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--window-size=1280,800', '--mute-audio', '--use-gl=angle'],
});
const shot = async (name, setup, mode) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5178/', { waitUntil: 'networkidle0', timeout: 20000 });
  if (mode === 'triangle') { await page.click('button[data-mode="triangle"]'); }
  await page.click('button[data-diff="easy"]');
  await new Promise(r => setTimeout(r, 1100));
  if (setup) await page.evaluate(setup);
  await new Promise(r => setTimeout(r, 2600));
  await page.mouse.move(640, 420);
  await page.screenshot({ path: `${SCRATCH}/${name}.png` });
  console.log(name, '| ERRORS:', errors.length ? errors : 'none');
  await page.close();
};
await shot('t1-triangle', null, 'triangle');
await shot('t2-chaos', () => {
  window.__obstacles.clear();
  window.__obstacles.spawn('volcano');
  window.__obstacles.spawn('snow');
  window.__obstacles.spawn('bite');
  window.__obstacles.spawn('meteor');
});
await shot('t3-bumpy', () => {
  window.__obstacles.clear();
  window.__obstacles.spawn('bumpy');
  window.__obstacles.spawn('fakeballs');
});
await browser.close();
