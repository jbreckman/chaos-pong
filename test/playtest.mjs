import puppeteer from 'puppeteer-core';
const SCRATCH = process.env.SCRATCH;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--window-size=1280,800', '--mute-audio', '--use-gl=angle'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 900));
await page.evaluate(() => { window.__frames = 0; const t = () => { window.__frames++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
await page.screenshot({ path: SCRATCH + '/o1-menu.png' });
if (process.env.MODE === 'hex') { await page.click('button[data-mode="hex"]'); await new Promise(r => setTimeout(r, 300)); }
await page.click('button[data-diff="easy"]');
await new Promise(r => setTimeout(r, 1300));
await page.screenshot({ path: SCRATCH + '/o2-serve.png' });

const start = Date.now();
let lastScore = '0-0';
const log = [];
const shotBanners = new Set();
let shotIdx = 0;
while (Date.now() - start < 75000) {
  const st = await page.evaluate(() => ({
    score: [...document.querySelectorAll('#scoreboard .pts')].map(e => e.textContent).join('-'),
    banner: document.getElementById('obstacle-banner').textContent,
    over: !document.getElementById('gameover').classList.contains('hidden'),
  }));
  if (st.score !== lastScore) { log.push(`${((Date.now()-start)/1000).toFixed(0)}s  ${st.score}  [${st.banner}]`); lastScore = st.score; }
  // one screenshot per distinct obstacle type seen mid-rally
  for (const key of ['BLACK HOLE', 'FAN', 'BLOCK', 'DECOY']) {
    if (st.banner.includes(key) && !shotBanners.has(key)) {
      shotBanners.add(key);
      await new Promise(r => setTimeout(r, 900));
      await page.screenshot({ path: `${SCRATCH}/o3-${key.replace(' ','')}-${shotIdx++}.png` });
    }
  }
  if (st.over) { log.push('GAME OVER at ' + st.score); break; }
  const x = 500 + Math.random() * 280, y = 350 + Math.random() * 200;
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 150 + Math.random() * 350));
  await page.mouse.move(600 + Math.random() * 80, 400 + Math.random() * 80, { steps: 4 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 350 + Math.random() * 300));
}
const frames = await page.evaluate(() => window.__frames);
const secs = (Date.now() - start) / 1000;
await page.screenshot({ path: SCRATCH + '/o4-final.png' });
console.log('SCORE LOG:'); log.forEach(l => console.log(' ', l));
console.log(`FPS approx: ${(frames / secs).toFixed(1)}`);
console.log('ERRORS:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
