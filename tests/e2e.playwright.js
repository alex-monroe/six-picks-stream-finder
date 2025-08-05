const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test('generate config and upload to stream finder', async () => {
  const extensionPath = path.join(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  const background = await context.waitForEvent('backgroundpage');
  const extensionId = background.url().split('/')[2];

  const ottoneuPage = await context.newPage();
  await ottoneuPage.goto('https://ottoneu.fangraphs.com/sixpicks/view/74779');

  const baseConfigPath = path.join(__dirname, 'baseConfig.json');
  fs.writeFileSync(baseConfigPath, JSON.stringify({ priority: [] }));

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await popup.setInputFiles('#configFile', baseConfigPath);
  await popup.click('#saveConfigButton');

  await ottoneuPage.bringToFront();

  const [download] = await Promise.all([
    popup.waitForEvent('download'),
    popup.evaluate(() => document.getElementById('generateButton').click()),
  ]);

  const downloadPath = await download.path();
  const configText = fs.readFileSync(downloadPath, 'utf-8');
  const config = JSON.parse(configText);

  expect(Array.isArray(config.priority)).toBeTruthy();
  expect(config.priority.length).toBeGreaterThan(0);

  await ottoneuPage.goto('https://www.baseball-reference.com/stream-finder.shtml');
  const fileInput = await ottoneuPage.$('input[type=file]');
  await fileInput.setInputFiles(downloadPath);

  await context.close();
});
