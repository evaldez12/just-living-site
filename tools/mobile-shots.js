// Full-page phone screenshots of the site for sharing. Needs the preview server on :8765.
// Run: node ~/.claude/skills/playwright-skill/run.js   (or: NODE_PATH=~/.claude/skills/playwright-skill/node_modules node tools/mobile-shots.js)
const { chromium, devices } = require('playwright');
const path = require('path');
(async () => {
  const out = path.join(__dirname, '..', 'screenshots');
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'], colorScheme: 'dark' });
  const page = await ctx.newPage();
  const shots = [
    ['index.html', 'mobile-home.png', true],
    ['product-jl-sneaker-red.html', 'mobile-product.png', true],
    ['info.html', 'mobile-info.png', false],
  ];
  for (const [file, name, full] of shots) {
    await page.goto(`http://127.0.0.1:8765/${file}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500); // let the bones assemble
    // trigger reveal animations by scrolling through the page
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, name), fullPage: full });
    console.log('saved', name);
  }
  await browser.close();
})();
