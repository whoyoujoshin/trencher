import { chromium } from "playwright";

const executablePath =
  process.env.AGENT_BROWSER_EXECUTABLE_PATH?.endsWith(".sh")
    ? "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell"
    : (process.env.AGENT_BROWSER_EXECUTABLE_PATH ||
      "/opt/pw-browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell");

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-web-security", "--allow-file-access-from-files"],
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto("file:///workspace/.grok/og-card.html", { waitUntil: "load" });
await page.evaluate(async () => {
  await document.fonts.ready;
});
await page.waitForTimeout(400);
await page.screenshot({
  path: "/workspace/.grok/og-card-2x.png",
  type: "png",
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await browser.close();
console.log("shot ok", executablePath);
