import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const svg = `<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;background:#111}
.row{display:flex;gap:16px;padding:16px;align-items:flex-end}
.box{background:#333}
</style></head><body>
<div class="row">
  <div class="box" style="width:16px;height:16px"><img src="file:///workspace/.grok/favicon.svg.tmp" width="16" height="16"></div>
  <div class="box" style="width:32px;height:32px"><img src="file:///workspace/.grok/favicon.svg.tmp" width="32" height="32"></div>
  <div class="box" style="width:64px;height:64px"><img src="file:///workspace/.grok/favicon.svg.tmp" width="64" height="64"></div>
</div>
</body></html>`;
writeFileSync("/workspace/.grok/favicon-preview.html", svg);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
});
const page = await browser.newPage({ viewport: { width: 280, height: 120 }, deviceScaleFactor: 4 });
await page.goto("file:///workspace/.grok/favicon-preview.html");
await page.waitForTimeout(100);
await page.screenshot({ path: "/workspace/.grok/favicon-preview.png", type: "png" });
await browser.close();
console.log("favicon preview ok");
