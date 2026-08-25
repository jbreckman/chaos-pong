// Packages the vite build into a single artifact-ready HTML file:
// page content only (no doctype/html/head/body), all JS inlined.
import { readFileSync, writeFileSync, readdirSync } from 'fs';

const src = readFileSync('index.html', 'utf8');
const jsFile = readdirSync('dist/assets').find(f => f.endsWith('.js'));
let js = readFileSync('dist/assets/' + jsFile, 'utf8');
if (js.includes('</script>')) js = js.replaceAll('</script>', '<\\/script>');

// grab <style> block, <title>, and body markup from the source page
const style = src.match(/<style>[\s\S]*?<\/style>/)[0];
const body = src.match(/<body>([\s\S]*?)<script type="module"/)[1];

const out = `<title>Chaos Pong</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
${style}
${body}
<script type="module">${js}</script>
`;
writeFileSync('artifact.html', out);
console.log('artifact.html:', (out.length / 1024).toFixed(0) + 'KB');
