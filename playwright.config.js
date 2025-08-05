const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    headless: false
  }
});
