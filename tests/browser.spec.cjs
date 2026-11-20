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
    if (url.includes('/rest/v1/md_memberships')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ patient_id: '22222222-2222-4222-8222-222222222222', role: 'owner' }])
    });
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
  await page.locator('#labsList details').first().evaluate(el => { el.open = true; });
  await expect(page.locator('#labsList .row').first()).toContainText('5.2');
  await page.locator('#labsFilter').fill('10.01.2026 ГЛЮКОЗА');
  await expect(page.locator('#labsList .lab-report').first()).not.toHaveClass(/hidden/);
  await page.locator('#labsFilter').fill('несуществующий показатель');
  await expect(page.locator('#labsList .lab-report').first()).toHaveClass(/hidden/);
  await page.locator('#labsFilter').fill('');
  await page.locator('#onlyAbnormal').check();
  await expect(page.locator('#labsList .lab-report').first()).toHaveClass(/hidden/);
  await page.locator('#onlyAbnormal').uncheck();
  await expect(page.locator('#labsList .lab-report').first()).not.toHaveClass(/hidden/);
  await page.locator('#sourceArchive summary').first().click();
  await expect(page.locator('#archiveContent')).toContainText('Архив недоступен для этого аккаунта.');
  await page.locator('#accountLogout').click();
  await expect(page.locator('#overview')).toBeHidden();
  await expect(page.locator('#labsList')).toBeEmpty();
  await expect(page.locator('#archiveContent')).toBeEmpty();
  await expect(page.locator('#bloodPressureChart')).toBeEmpty();
  await expect(page.locator('#sourceArchive')).not.toHaveAttribute('open');
});

test('Failed authentication never reveals the medical dashboard', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({
    status: 401, contentType: 'application/json',
    body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' })
  }));
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#email').fill('invalid@example.invalid');
  await page.locator('#password').fill('incorrect');
  await page.locator('#login').click();
  await expect(page.locator('#status')).toContainText('Ошибка входа');
  await expect(page.locator('#overview')).toBeHidden();
  await expect(page.locator('#labsList')).toBeEmpty();
});

test('Mobile diary, protocol, archive and scrolling work together', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const patient = '22222222-2222-4222-8222-222222222222';
  await page.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body = [];
    if (url.pathname === '/auth/v1/token') {
      body = { access_token:'synthetic-mobile-token', refresh_token:'synthetic-refresh',
        expires_at:Math.floor(Date.now()/1000)+3600, user:{id:'synthetic-mobile-user'} };
    } else if (url.pathname.endsWith('/md_memberships')) {
      body = [{patient_id:patient,role:'owner'}];
    } else if (url.pathname.endsWith('/md_therapy_events')) {
      body = [{event_at:'2026-01-10T08:00:00Z',medication:'Тестовый препарат',
        dose:1,dose_unit:'мг',note:'Подтверждено в Google Sheets. Время инъекции не указано. · Источник: Google Sheets GZT; точное время не указано.'}];
    } else if (url.pathname.endsWith('/md_diary_entries')) {
      body = [
        {measured_at:'2026-01-01T08:00:00Z',metric:'systolic',value:120,unit:'мм рт. ст.'},
        {measured_at:'2026-01-10T08:00:00Z',metric:'systolic',value:118,unit:'мм рт. ст.'},
        {measured_at:'2026-01-01T08:00:00Z',metric:'diastolic',value:80,unit:'мм рт. ст.'},
        {measured_at:'2026-01-10T08:00:00Z',metric:'diastolic',value:78,unit:'мм рт. ст.'},
        {measured_at:'2026-01-01T08:00:00Z',metric:'pulse',value:70,unit:'уд/мин'},
        {measured_at:'2026-01-10T08:00:00Z',metric:'pulse',value:72,unit:'уд/мин'}
      ];
    } else if (url.pathname.endsWith('/md_content_blocks') &&
               url.searchParams.get('kind') === 'eq.source_archive') {
      body = [{title:'Синтетическая архивная запись',body:'Контрольный текст архива'}];
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#email').fill('mobile@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#login').click();
  await expect(page.locator('#protocolOverview')).toContainText('Тестовый препарат');
  await page.getByRole('link',{name:'Протокол',exact:true}).click();
  const row = page.locator('.protocol-history-table tbody tr').first();
  await expect(row).toHaveCSS('display','grid');
  await expect(row.locator('td').first()).toHaveText('10.01.2026');
  await expect(row.locator('td').nth(3).locator('span')).toHaveText('Выполнено');
  await expect(page.locator('.reference-sticky')).toHaveCSS('position','static');
  await expect(page.locator('.reference-sticky')).not.toBeInViewport();
  await row.locator('.protocol-source summary').click();
  await expect(row.locator('.protocol-source p')).toContainText('Google Sheets GZT');
  await page.getByRole('link',{name:'Состав тела и давление',exact:true}).click();
  await expect(page.locator('#bloodPressureChart svg')).toBeVisible();
  await expect(page.locator('#pulseChartNew svg')).toBeVisible();
  await page.getByRole('button',{name:'30 дней',exact:true}).click();
  await expect(page.locator('#bloodPressureChart')).toContainText('118');
  await page.getByRole('link',{name:'Все анализы',exact:true}).click();
  await page.locator('#sourceArchive > summary').click();
  await expect(page.locator('#archiveContent')).toContainText('Синтетическая архивная запись');
  await page.locator('#accountLogout').click();
  await expect(page.locator('#overview')).toBeHidden();
  for (const id of ['protocolOverview','bloodPressureChart','pulseChartNew','archiveContent']) {
    await expect(page.locator('#'+id)).toBeEmpty();
  }
});
