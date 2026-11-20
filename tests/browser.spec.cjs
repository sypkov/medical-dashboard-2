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

test('Authenticated UI loads synthetic laboratory data and clears it on logout', async ({ page }) => {
  const fakeReport = '11111111-1111-4111-8111-111111111111';
  await page.route('https://*.supabase.co/**', async route => {
    const url = route.request().url();
    if (url.includes('/auth/v1/token?grant_type=password')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        access_token: 'synthetic-browser-test-token', token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600,
        refresh_token: 'synthetic-refresh', user: { id: 'synthetic-user' }
      }) });
    }
    if (url.includes('/rest/v1/md_lab_reports')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: fakeReport, lab_name: 'Тестовая лаборатория',
        sample_date: '2026-01-10', report_date: '2026-01-10' }])
    });
    if (url.includes('/rest/v1/md_lab_results')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ report_id: fakeReport, analyte_code: 'test_glucose',
        analyte_name: 'Глюкоза', numeric_value: 5.2, unit: 'ммоль/л',
        ref_low: 4.1, ref_high: 6.1, text_value: null, reference_text: null, flag: null }])
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#email').fill('browser-test@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#login').click();
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#labsList')).toContainText('Глюкоза', { timeout: 15000 });
  await page.locator('#accountLogout').click();
  await expect(page.locator('#overview')).toBeHidden();
  await expect(page.locator('#labsList')).toBeEmpty();
});
