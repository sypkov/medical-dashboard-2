const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.abort());
});

test('Chart periods filter real measurements and mild elevation is yellow', async ({ page }) => {
  const dates=['2026-01-10','2026-07-10','2026-10-10','2026-11-10'];
  const ids=dates.map((_,i)=>'11111111-1111-4111-8111-11111111111'+i);
  await page.route('https://*.supabase.co/**',async route=>{
    const url=route.request().url();let body=[];
    if(url.includes('/auth/v1/token'))body={access_token:'synthetic-period-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'synthetic-period-user'}};
    else if(url.includes('/md_memberships'))body=[{patient_id:'22222222-2222-4222-8222-222222222222',role:'owner'}];
    else if(url.includes('/md_lab_reports'))body=dates.map((date,i)=>({id:ids[i],sample_date:date,report_date:date,lab_name:'Тестовая лаборатория'}));
    else if(url.includes('/md_lab_results'))body=dates.map((_,i)=>({report_id:ids[i],analyte_name:'Тестостерон общий',numeric_value:[25,9,19,20][i],unit:'нмоль/л',ref_low:10,ref_high:19.6}));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#email').fill('periods@example.invalid');await page.locator('#password').fill('synthetic-password');await page.locator('#login').click();
  const chart=page.locator('#hormoneCharts .hematology-chart-card').first();
  await expect(chart.locator('.chart-point')).toHaveCount(4);
  await expect(chart.locator('.medical-reference-gradient stop')).toHaveCount(8);
  expect(await chart.locator('.chart-point').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('fill')))).toEqual(['#b96243','#b96243','#397b64','#a17b13']);
  const smallCard=page.locator('#hormonesOverview .data-row.mild').first();
  await expect(smallCard.locator('polyline')).toHaveAttribute('stroke','#a17b13');
  await expect(smallCard.locator('strong')).toHaveCSS('color','rgb(161, 123, 19)');
  await expect(chart.locator('.chart-status')).toHaveCSS('background-color','rgb(255, 242, 189)');
  await expect(page.locator('#overviewMetrics .metric.mild .result-badge')).toHaveCSS('background-color','rgb(255, 242, 189)');
  const mild=page.locator('#hormonesOverview .data-row.mild').first();
  await expect(mild).toHaveCSS('border-top-color','rgb(215, 183, 78)');
  await chart.getByRole('button',{name:'6 мес',exact:true}).click();await expect(chart.locator('.chart-point')).toHaveCount(3);
  await chart.getByRole('button',{name:'3 мес',exact:true}).click();await expect(chart.locator('.chart-point')).toHaveCount(2);
  await expect(chart.getByRole('button',{name:'3 мес',exact:true})).toHaveAttribute('aria-pressed','true');
  await chart.getByRole('button',{name:'Показать все',exact:true}).click();await expect(chart.locator('.chart-point')).toHaveCount(4);
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
    if (url.includes('/rest/v1/md_content_blocks') && url.includes('eq.patient_profile')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{body:JSON.stringify({display_name:'Иванов Иван Иванович',birth_date:'1980-06-16'})}])});
    if (url.includes('/rest/v1/md_lab_reports')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: fakeReport, lab_name: 'Тестовая лаборатория',
        sample_date: '2026-01-10', report_date: '2026-01-10' }, { id:'33333333-3333-4333-8333-333333333333',lab_name:'Тестовая лаборатория',sample_date:'2026-01-03',report_date:'2026-01-03'}, {id:'44444444-4444-4444-8444-444444444444',lab_name:'Синтетический архив без дня анализа',sample_date:null,report_date:null}])
    });
    if (url.includes('/rest/v1/md_lab_results')) return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ report_id: fakeReport, analyte_code: 'test_glucose',
        analyte_name: 'Глюкоза', numeric_value: 5.2, unit: 'ммоль/л',
        ref_low: 4.1, ref_high: 6.1, text_value: null, reference_text: null, flag: null },
        {report_id:fakeReport,analyte_code:'baso_pct',analyte_name:'Базофилы %',numeric_value:0.8,unit:'%',ref_low:0,ref_high:0.7},
        {report_id:'33333333-3333-4333-8333-333333333333',analyte_code:'baso_pct',analyte_name:'Базофилы %',numeric_value:0.5,unit:'%',ref_low:0,ref_high:0.7}, ...['Тестостерон общий','Эстрадиол (E2)','Гематокрит','Гемоглобин','Эритроциты','Тромбоциты'].flatMap((name,index)=>[
          {report_id:fakeReport,analyte_code:'chart_'+index,analyte_name:name,numeric_value:20+index,...(index===0?{ref_low:10,ref_high:19.6}:{}),unit:['нмоль/л','пмоль/л','%','г/л','×10¹²/л','×10⁹/л'][index]},
          {report_id:'33333333-3333-4333-8333-333333333333',analyte_code:'chart_'+index,analyte_name:name,numeric_value:19+index,unit:['нмоль/л','пмоль/л','%','г/л','×10¹²/л','×10⁹/л'][index]}
        ]), {report_id:'44444444-4444-4444-8444-444444444444',analyte_code:'synthetic_archive',analyte_name:'Синтетический архивный показатель',numeric_value:2,unit:'условные единицы'}])
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#email').fill('browser-test@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#login').click();
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#labsList')).toContainText('Глюкоза', { timeout: 15000 });
  await expect(page.locator('#patientDisplayName')).toHaveText('Иванов Иван Иванович');
  await expect(page.locator('#patientMetadata')).toContainText('16.06.1980');
  await expect(page.locator('#accountBar')).toBeHidden();
  await page.locator('#journalSearch').fill('глюк');
  await page.locator('#journalSearchResults').getByRole('button',{name:'Глюкоза',exact:true}).click();
  await expect(page.locator('#labsFilter')).toHaveValue('Глюкоза');
  await page.locator('#labsFilter').fill('');
  await page.locator('#labsList details').first().evaluate(el => { el.open = true; });
  await expect(page.locator('#labsList .row').first()).toContainText('5.2');
  const basophils = page.locator('#hematologyOverview .data-row').filter({hasText:'Базофилы %'});
  await expect(basophils).toHaveCount(2);
  await expect(page.locator('#chemistryOverview')).toContainText('Без точной даты');
  await expect(page.locator('#chemistryOverview')).toContainText('Синтетический архив без дня анализа');
  await expect(basophils.first()).toContainText('0,8 %');
  await expect(basophils.last()).toContainText('0,5 %');
  await expect(page.locator('#hematologyOverview .lab-date-heading')).toHaveText(['10.01.2026','03.01.2026']);
  await expect(page.locator('#hormoneCharts svg')).toHaveCount(2);
  await expect(page.locator('#hormoneCharts .chart-status').first()).toHaveText('немного выше');
  await expect(page.locator('#overviewMetrics .metric').nth(1)).toContainText('немного выше');
  await expect(page.locator('#hormonesOverview .data-row').filter({hasText:'Тестостерон общий'}).first()).toContainText('Немного выше референса');
  await expect(page.locator('#hormoneCharts svg').first().locator('.chart-axis')).toHaveCount(6);
  await expect(page.locator('#hormoneCharts .medical-curve').first()).toHaveAttribute('stroke',/^url\(#medical-reference-/);
  const hormoneChart=page.locator('#hormoneCharts .medical-chart').first();
  await hormoneChart.locator('.medical-curve').click();
  await expect(hormoneChart.locator('[role=tooltip]')).toBeVisible();
  await expect(hormoneChart.locator('.tooltip-date')).toHaveText(/03\.01\.2026|10\.01\.2026/);
  await expect(hormoneChart.locator('.tooltip-value')).toContainText('нмоль/л');
  await expect(hormoneChart.locator('.tooltip-lab')).toHaveText('Тестовая лаборатория');
  await hormoneChart.locator('.chart-point').first().press('Enter');
  await expect(hormoneChart.locator('.tooltip-date')).toHaveText('03.01.2026');
  await expect(hormoneChart.locator('.tooltip-value')).toHaveText('19 нмоль/л');
  await hormoneChart.locator('.chart-point').first().press('Escape');
  await expect(hormoneChart.locator('[role=tooltip]')).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  await hormoneChart.locator('.medical-curve').click();
  await expect(hormoneChart.locator('[role=tooltip]')).toBeVisible();
  const tipBounds=await hormoneChart.locator('[role=tooltip]').boundingBox();
  expect(tipBounds.x).toBeGreaterThanOrEqual(0);
  expect(tipBounds.x+tipBounds.width).toBeLessThanOrEqual(390);
  await page.setViewportSize({width:1280,height:900});
  await expect(page.locator('#hematologyCharts svg')).toHaveCount(4);
  await expect(page.locator('#labTrends svg')).toHaveCount(1);
  await expect(page.locator('#labTrends')).toContainText('Базофилы %');
  for(const name of ['Тестостерон общий','Эстрадиол','Гематокрит','Гемоглобин','Эритроциты','Тромбоциты']){
    await expect(page.locator('#labTrends')).not.toContainText(name);
  }
  await page.locator('#labsFilter').fill('10.01.2026 ГЛЮКОЗА');
  await expect(page.locator('#labsList .lab-report').first()).not.toHaveClass(/hidden/);
  await page.locator('#labsFilter').fill('несуществующий показатель');
  await expect(page.locator('#labsList .lab-report').first()).toHaveClass(/hidden/);
  await page.locator('#labsFilter').fill('');
  await page.locator('#onlyAbnormal').check();
  await expect(page.locator('#labsList .row').first()).toHaveClass(/hidden/);
  await page.locator('#onlyAbnormal').uncheck();
  await expect(page.locator('#labsList .lab-report').first()).not.toHaveClass(/hidden/);
  await page.locator('#sourceArchive summary').first().click();
  await expect(page.locator('#archiveContent')).toContainText('Архив недоступен для этого аккаунта.');
  await page.locator('#journalMenuButton').click();
  await expect(page.locator('#accountBar')).toBeVisible();
  await page.locator('#accountLogout').click();
  await expect(page.locator('#overview')).toBeHidden();
  await expect(page.locator('#labsList')).toBeEmpty();
  await expect(page.locator('#archiveContent')).toBeEmpty();
  await expect(page.locator('#patientDisplayName')).toHaveText('Медицинский профиль');
  await expect(page.locator('#journalInitials')).toBeEmpty();
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
      body = [{event_at:'2026-01-10T08:00:00Z',medication:'Омнадрен',
        dose:100,dose_unit:'мг',note:'Подтверждено в Google Sheets. Время инъекции не указано. · Источник: Google Sheets GZT; точное время не указано.'},
        {event_at:'2026-01-03T08:00:00Z',medication:'Омнадрен',dose:125,dose_unit:'мг',note:'По плану'},
        {event_at:'2026-01-10T08:00:00Z',medication:'ХГЧ',dose:500,dose_unit:'ед'},
        {event_at:'2026-01-10T08:00:00Z',medication:'Тирзепатид',dose:2.5,dose_unit:'мг'}];
    } else if (url.pathname.endsWith('/md_diary_entries')) {
      body = [
        {measured_at:'2026-01-01T08:00:00Z',metric:'systolic',value:120,unit:'мм рт. ст.'},
        {measured_at:'2026-01-10T08:00:00Z',metric:'systolic',value:118,unit:'мм рт. ст.'},
        {measured_at:'2026-01-01T08:00:00Z',metric:'diastolic',value:80,unit:'мм рт. ст.'},
        {measured_at:'2026-01-10T08:00:00Z',metric:'diastolic',value:78,unit:'мм рт. ст.'},
        {measured_at:'2026-01-01T08:00:00Z',metric:'pulse',value:70,unit:'уд/мин'},
        {measured_at:'2026-01-10T08:00:00Z',metric:'pulse',value:72,unit:'уд/мин'}
      ];
    } else if (url.pathname.endsWith('/md_sync_runs')) {
      body = [{status:'success',finished_at:'2026-01-10T08:00:00Z',started_at:'2026-01-10T07:59:00Z'}];
    } else if (url.pathname.endsWith('/md_content_blocks') && url.searchParams.get('kind') === 'eq.consultation_history') {
      body=[{title:'Гастроэнтеролог — 01.01.2026',body:'Врач Первый. Заключение и назначение А.'},{title:'Гастроэнтеролог — 10.01.2026',body:'Врач Второй. Заключение и назначение Б.'},{title:'Колопроктолог — 03.01.2026',body:'Контрольное заключение.'}];
    } else if (url.pathname.endsWith('/md_content_blocks') && url.searchParams.get('kind') === 'eq.medication_inventory') {
      body=[{body:JSON.stringify({medication:'Омнадрен',mg_per_ampoule:100,ml_per_ampoule:1,receipts:[{date:'2026-01-01',ampoules:2,label:'Начальный запас'},{date:'2026-01-07',ampoules:3,label:'Закупка'}]})}];
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
  await expect(page.locator('#protocolOverview')).toContainText('Омнадрен');
  await page.getByRole('link',{name:'Врачи',exact:true}).click();
  const specialty=page.locator('#visitsOverview > details').filter({has:page.locator('summary').filter({hasText:/^Гастроэнтеролог$/})});
  await expect(specialty).toHaveCount(1);
  await specialty.locator('summary').click();
  await expect(specialty.locator('.consultation-entry')).toHaveCount(2);
  await expect(specialty.locator('h4')).toHaveText(['Гастроэнтеролог — 10.01.2026','Гастроэнтеролог — 01.01.2026']);
  await expect(specialty).toContainText('Врач Первый. Заключение и назначение А.');
  await expect(specialty).toContainText('Врач Второй. Заключение и назначение Б.');
  await page.locator('#visitsSearch').fill('Врач Второй');
  await expect(page.locator('#visitsOverview .consultation-entry')).toHaveCount(1);
  await page.locator('#visitsSearch').fill('');
  await expect(page.locator('#visitsOverview > details')).toHaveCount(2);
  await page.getByRole('link',{name:'Протокол',exact:true}).click();
  await expect(page.locator('.protocol-history-table')).toHaveCount(3);
  const omnadren = page.getByRole('table',{name:'Омнадрен — история инъекций'});
  await expect(omnadren.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.protocol-dose-total')).toHaveText('Всего введено: 225 мг');
  await expect(omnadren.locator('.protocol-cumulative')).toHaveText(['Накоплено: 225 мгОстаток: 275 мг · 2,75 ампулы в эквиваленте','Накоплено: 125 мгОстаток: 75 мг · 0,75 ампулы в эквиваленте']);
  await expect(page.getByRole('table',{name:'ХГЧ — история инъекций'})).not.toContainText('Омнадрен');
  await expect(page.getByRole('table',{name:'Тирзепатид — история инъекций'})).not.toContainText('ХГЧ');
  await expect(page.locator('.protocol-stock-balance')).toHaveText('Расчётный остаток: 275 мг · 2,75 ампулы в эквиваленте');
  const row = omnadren.locator('tbody tr').first();
  await expect(row).toHaveCSS('display','grid');
  await expect(row.locator('td').first()).toHaveText('10.01.2026');
  await expect(row.locator('td').nth(3).locator('span')).toHaveText('Выполнено');
  await expect(page.locator('.reference-sticky')).toHaveCSS('position','static');
  await expect(page.locator('.reference-sticky')).not.toBeInViewport();
  await expect(row.locator('details')).toHaveCount(0);
  await expect(row).not.toContainText('Google Sheets');
  await page.getByRole('link',{name:'Состав тела и давление',exact:true}).click();
  await expect(page.locator('#bloodPressureChart svg')).toBeVisible();
  await expect(page.locator('#bloodPressureChart .chart-axis')).toHaveCount(6);
  await expect(page.locator('#diarySyncStatus')).toContainText('10.01.2026');
  await expect(page.locator('#diarySyncStatus')).toContainText('успешно');
  await expect(page.locator('#pulseChartNew svg')).toBeVisible();
  await page.locator('.body-toolbar').getByRole('button',{name:'3 мес',exact:true}).click();
  await expect(page.locator('#bloodPressureChart')).toContainText('118');
  await page.getByRole('link',{name:'Все анализы',exact:true}).click();
  await page.locator('#sourceArchive > summary').click();
  await expect(page.locator('#archiveContent')).toContainText('Синтетическая архивная запись');
  await page.locator('#journalMenuButton').click();
  await expect(page.locator('#accountBar')).toBeVisible();
  await page.locator('#accountLogout').click();
  await expect(page.locator('#overview')).toBeHidden();
  for (const id of ['protocolOverview','bloodPressureChart','pulseChartNew','archiveContent','diarySyncStatus']) {
    await expect(page.locator('#'+id)).toBeEmpty();
  }
});


test('Journal design uses the supplied warm palette and serif headings at both screen sizes', async ({ page }) => {
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:8765/');
    await expect(page.locator('body')).toHaveCSS('background-color','rgb(242, 240, 231)');
    await expect(page.locator('#loginCard')).toHaveCSS('background-color','rgb(252, 251, 246)');
    await expect(page.locator('.header h1')).toHaveCSS('font-family',/Georgia/);
    await expect(page.locator('.header h1')).toHaveText('Лабораторный журнал');
    await expect(page.locator('#loginCard h2')).toHaveCSS('color','rgb(32, 33, 28)');
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
    expect(fits).toBe(true);
  }
});

