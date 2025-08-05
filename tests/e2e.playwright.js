const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test('generate config and upload to stream finder', async () => {
  const extensionPath = path.join(__dirname, '..');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ['--disable-background-networking'],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  // Stub MLB Stats API responses so tests do not rely on external network.
  let mockId = 1;
  await context.route('https://statsapi.mlb.com/*', route => {
    const body = JSON.stringify({ people: [{ id: mockId++ }] });
    route.fulfill({ contentType: 'application/json', body });
  });

  // Extension service worker may already be running by the time this test
  // starts listening for it. Check for an existing worker first so we don't
  // hang waiting for a second one that will never appear.
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  const extensionId = serviceWorker.url().split('/')[2];
  console.log('Loaded extension with id', extensionId);
  serviceWorker.on('console', msg => console.log('sw console:', msg.text()));

  const ottoneuPage = await context.newPage();
  console.log('Navigating to Ottoneu six picks page');
  await ottoneuPage.goto('https://ottoneu.fangraphs.com/sixpicks/view/74779');
  console.log('Ottoneu page loaded');

  const baseConfigPath = path.join(__dirname, 'baseConfig.json');
  fs.writeFileSync(baseConfigPath, JSON.stringify({ priority: [] }));

  console.log('Opening extension popup');
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    serviceWorker.evaluate(id => chrome.tabs.create({ url: `chrome-extension://${id}/popup.html`, active: false }), extensionId)
  ]);
  console.log('Popup loaded');
  popup.on('console', msg => console.log('popup console:', msg.text()));

  console.log('Uploading base config');
  await popup.setInputFiles('#configFile', baseConfigPath);
  await popup.click('#saveConfigButton');
  await popup.waitForSelector('#configStatus.success');
  console.log('Base config saved');

  await ottoneuPage.bringToFront();
  console.log('Generating stream finder config');
  console.log('Triggering generate button');

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
  console.log('Navigated to stream finder upload page');
  const fileInput = await ottoneuPage.$('input[type=file]');
  await fileInput.setInputFiles(downloadPath);
  console.log('Uploaded generated config');

  await context.close();
});
