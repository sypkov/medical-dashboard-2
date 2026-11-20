const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.abort());
});

test('Unauthenticated visitor sees login but no medical dashboard', async ({ page }) => {
  await page.goto('http://127.0.0.1:8765/');
  await expect(page.locator('#loginCard')).toBeVisible();
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#overview')).toBeHidden();
  await expect(page.locator('#labsList')).toBeEmpty();
  await expect(page.locator('#labTrends')).toBeEmpty();
});

test('All eight medical sections exist but stay private without a session', async ({ page }) => {
  await page.goto('http://127.0.0.1:8765/');
  const sections = [
    'overview','hormonesSection','hematologySection','chemistrySection',
    'markersSection','protocolSection','bodySection','visitsSection'
  ];
  for (const id of sections) {
    await expect(page.locator('#' + id)).toHaveCount(1);
  }
  await expect(page.locator('#overview')).toBeHidden();
});

test('Login and recovery remain usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('http://127.0.0.1:8765/');
  await expect(page.locator('#loginCard')).toBeVisible();
  await expect(page.locator('#recoveryCard')).toBeVisible();
  await expect(page.locator('#requestRecovery')).toBeVisible();
  await expect(page.locator('#overview')).toBeHidden();
});
