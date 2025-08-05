const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Helper to get extension ID after loading
async function getExtensionId(context) {
  // Wait for background page, then parse ID from URL
  const background = context.backgroundPages().length
    ? context.backgroundPages()[0]
    : await context.waitForEvent('backgroundpage');
  return background.url().split('/')[2];
}

 test('generate config from Ottoneu and upload to Stream Finder', async () => {
  const extensionPath = path.join(__dirname, '..');

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  const extensionId = await getExtensionId(context);

  // Open popup and save base config
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#configFile').setInputFiles(path.join(__dirname, 'baseConfig.json'));
  await popup.locator('#saveConfigButton').click();
  await popup.locator('#configStatus.success').waitFor();

  // Navigate to Ottoneu page
  const page = await context.newPage();
  await page.goto('https://ottoneu.fangraphs.com/sixpicks/view/74779');

  // Generate config via popup
  const generator = await context.newPage();
  await generator.goto(`chrome-extension://${extensionId}/popup.html`);
  const downloadPromise = generator.waitForEvent('download');
  await generator.locator('#generateButton').click();
  const download = await downloadPromise;
  const configPath = path.join(__dirname, 'generated_config.json');
  await download.saveAs(configPath);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  expect(Array.isArray(config.priority)).toBeTruthy();
  expect(config.priority.length).toBeGreaterThan(0);
  for (const item of config.priority) {
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('data');
    expect(item).toHaveProperty('priority');
  }

  // Upload config to Baseball Reference Stream Finder
  const streamFinder = await context.newPage();
  await streamFinder.goto('https://www.baseball-reference.com/stream-finder.shtml');
  const fileInput = streamFinder.locator('input[type="file"]');
  await fileInput.setInputFiles(configPath);
  const submitButton = streamFinder.locator('input[type="submit"]');
  if (await submitButton.count() > 0) {
    await Promise.all([
      streamFinder.waitForLoadState('networkidle'),
      submitButton.first().click()
    ]);
  }
  await expect(streamFinder).toHaveURL(/stream-finder/);

  await context.close();
});
