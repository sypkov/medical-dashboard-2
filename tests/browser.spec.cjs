const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.abort());
});

test('Chemistry tables retain all measurements and text blocks are available', async ({ page }) => {
  const dates=['2026-01-10','2026-07-10','2026-10-10','2026-11-10'];
  const ids=dates.map((_,i)=>'11111111-1111-4111-8111-11111111111'+i);
  await page.route('https://*.supabase.co/**',async route=>{
    const url=route.request().url();let body=[];
    if(url.includes('/auth/v1/token'))body={access_token:'synthetic-chem-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'synthetic-chem-user'}};
    else if(url.includes('/md_memberships'))body=[{patient_id:'22222222-2222-4222-8222-222222222222',role:'owner'}];
    else if(url.includes('/md_lab_reports'))body=dates.map((date,i)=>({id:ids[i],sample_date:date,report_date:date,lab_name:'Тестовая лаборатория'}));
    else if(url.includes('/md_lab_results'))body=dates.map((_,i)=>({report_id:ids[i],analyte_name:'Глюкоза',numeric_value:[5,5.8,6.2,6.1][i],unit:'ммоль/л',...(i===3?{ref_low:4,ref_high:6}:{reference_text:'Исторический дашборд; референсы из старого HTML'})}));
    else if(url.includes('/md_content_blocks')&&url.includes('kind=in.'))body=[{kind:'interpretation',title:'Интерпретация тестового анализа',body:'Мочевина: полный текст интерпретации.'},...[['chemistry','Пояснение биохимии','Полный текст исторического блока.'],['hormones','Пояснение гормонов','Динамика гормонов.'],['hematology','Пояснение гематологии','Динамика гематокрита.'],['protocol','Пояснение протокола','История дозировки.']].map(([section,title,text])=>({kind:'section_note',title,body:JSON.stringify({section,title,tone:'note',as_of:'2026-01-01',paragraphs:[[{text,bold:true}]]})}))];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:8765/');await page.locator('#email').fill('chemistry@example.invalid');await page.locator('#password').fill('synthetic-password');await page.locator('#login').click();
  const table=page.getByRole('table',{name:'Биохимия — три последних результата',exact:true});
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody td strong')).toHaveText(['6,1','6,2','5,8']);
  await expect(table).toContainText('Референс: 4–6 ммоль/л');
  await expect(page.locator('#chemistryOverview')).not.toContainText('старого HTML');
  await expect(page.locator('#chemistryOverview .data-row')).toHaveCount(0);
  const history=page.locator('.chemistry-history');await expect(history).not.toHaveAttribute('open');await history.locator('summary').click();
  await expect(page.getByRole('table',{name:'Биохимия — полная хронология',exact:true}).locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('#chemistrySectionNotes')).toContainText('полный текст интерпретации.');
  await expect(page.locator('#chemistrySectionNotes')).toContainText('Полный текст исторического блока.');
  await expect(page.locator('#chemistrySectionNotes strong')).toHaveText('Полный текст исторического блока.');
  await expect(page.locator('#hormonesSectionNotes')).toContainText('Динамика гормонов.');
  await expect(page.locator('#hematologySectionNotes')).toContainText('Динамика гематокрита.');
  await expect(page.locator('#protocolSectionNotes')).toContainText('История дозировки.');
  await expect(page.locator('#chemistrySectionNotes')).not.toContainText('Динамика гормонов.');
  expect(await page.locator('#chemistrySectionNotes').evaluate(node=>node.previousElementSibling.id)).toBe('chemistryOverview');
  await expect(page.locator('#textBlocksSection')).toHaveCount(0);
  await page.locator('#journalMenuButton').click();await page.locator('#accountLogout').click();await expect(page.locator('#chemistrySectionNotes')).toBeEmpty();await expect(page.locator('#hormonesSectionNotes')).toBeEmpty();
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
  await expect(chart.getByRole('button',{name:'6 мес',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(chart.locator('.chart-point')).toHaveCount(3);
  await expect(chart.locator('.medical-reference-gradient stop')).toHaveCount(8);
  expect(await chart.locator('.chart-point').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('fill')))).toEqual(['#b96243','#397b64','#a17b13']);
  const summary=page.getByRole('table',{name:'Гормоны — три последних результата',exact:true});
  await expect(summary.locator('tbody td strong')).toHaveText(['20','19','9']);
  await expect(summary.locator('tbody td').first()).toHaveAttribute('title','Немного выше референса');
  await expect(summary.locator('tbody td strong').first()).toHaveCSS('color','rgb(161, 123, 19)');
  const history=page.locator('#hormonesOverview details');
  await expect(history).not.toHaveAttribute('open');
  await history.locator('summary').click();
  const all=page.getByRole('table',{name:'Гормоны — полная хронология',exact:true});
  await expect(all.locator('tbody tr td:first-child')).toHaveText(['10.11.2026','10.10.2026','10.07.2026','10.01.2026']);
  await expect(chart.locator('.chart-status')).toHaveCSS('background-color','rgb(255, 242, 189)');
  await expect(page.locator('#overviewMetrics .metric.mild .result-badge')).toHaveCSS('background-color','rgb(255, 242, 189)');

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
        {report_id:fakeReport,analyte_code:'synthetic_wbc',analyte_name:'Лейкоциты',numeric_value:6,unit:'×10⁹/л'},
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
  await page.getByRole('button',{name:'По дате',exact:true}).click();
  await page.locator('#labsList details').first().evaluate(el => { el.open = true; });
  await expect(page.locator('#labsList .row').filter({hasText:'Глюкоза'}).first()).toContainText('5,2');
  const hematology = page.getByRole('table',{name:'Гематология — три последних результата',exact:true});
  const basophils = hematology.getByRole('row').filter({hasText:'Базофилы %'});
  await expect(basophils).toHaveCount(1);
  await expect(basophils.locator('td strong')).toHaveText(['0,8','0,5']);
  await expect(hematology.locator('tbody th span').last()).toHaveText('Лейкоциты');
  const hematologyHistory = page.locator('#hematologyOverview details');
  await expect(hematologyHistory).not.toHaveAttribute('open');
  await hematologyHistory.locator('summary').click();
  const hematologyDates = hematologyHistory.locator('tbody td:first-child');
  await expect(hematologyDates).toHaveText([...Array(6).fill('10.01.2026'),...Array(5).fill('03.01.2026')]);
  await expect(page.locator('#chemistryOverview')).toContainText('Без точной даты');
  await expect(page.locator('#chemistryOverview')).toContainText('Синтетический архив без дня анализа');
  await expect(page.locator('#hormoneCharts svg')).toHaveCount(2);
  await expect(page.locator('#hormoneCharts .chart-status').first()).toHaveText('немного выше');
  await expect(page.locator('#overviewMetrics .metric').nth(1)).toContainText('немного выше');
  await expect(page.locator('#hormonesOverview tbody tr').filter({hasText:'Тестостерон общий'}).first().locator('td').first()).toHaveAttribute('title','Немного выше референса');
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
  await page.getByRole('button',{name:'По показателю',exact:true}).click();
  await page.locator('#labsFilter').fill('Базофилы %');
  await expect(page.locator('#labAnalyteView svg')).toHaveCount(1);
  await expect(page.locator('#labAnalyteView h3')).toHaveText('Базофилы %');
  for(const name of ['Тестостерон общий','Эстрадиол','Гематокрит','Гемоглобин','Эритроциты','Тромбоциты']){
    await expect(page.locator('#labAnalyteView')).not.toContainText(name);
  }
  await page.getByRole('button',{name:'По дате',exact:true}).click();
  await page.locator('#labsFilter').fill('10.01.2026 ГЛЮКОЗА');
  await expect(page.locator('#labsList .lab-report').first()).not.toHaveClass(/hidden/);
  await page.locator('#labsFilter').fill('несуществующий показатель');
  await expect(page.locator('#labsList .lab-report').first()).toHaveClass(/hidden/);
  await page.locator('#labsFilter').fill('');
  await page.locator('#onlyAbnormal').check();
  await expect(page.locator('#labsList .row').filter({hasText:'Глюкоза'}).first()).toHaveClass(/hidden/);
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
  expect(await page.locator('#bloodPressureChart .chart-axis').count()).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#bloodPressureChart .medical-curve').first()).toHaveAttribute('stroke','#ee4b85');
  await expect(page.locator('#bloodPressureChart .medical-curve').nth(1)).toHaveAttribute('stroke','#5271ff');
  await expect(page.locator('#pulseChartNew .body-chart-area')).toHaveCount(1);
  await expect(page.locator('#bloodPressureChart .chart-point').first()).toHaveAttribute('fill','#fcfbf6');
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


test('Markers use tables and protocol reveals seven completed and two planned injections',async ({page})=>{
  await page.clock.install({time:new Date('2026-11-21T12:00:00Z')});
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());let body=[];
    const medications=['Омнадрен','ХГЧ','Тирзепатид'];
    if(url.pathname==='/auth/v1/token')body={access_token:'synthetic-compact',refresh_token:'synthetic-refresh',expires_at:1900000000,user:{id:'synthetic-compact-user'}};
    else if(url.pathname.endsWith('/md_memberships'))body=[{patient_id:'22222222-2222-4222-8222-222222222222',role:'owner'}];
    else if(url.pathname.endsWith('/md_therapy_events'))body=medications.flatMap(medication=>Array.from({length:10},(_,i)=>({medication,event_at:'2026-11-'+String(i+1).padStart(2,'0')+'T08:00:00Z',dose:medication==='Омнадрен'?100:medication==='ХГЧ'?500:2.5,dose_unit:medication==='ХГЧ'?'ед':'мг'})));
    else if(url.pathname.endsWith('/md_lab_reports'))body=[{id:'11111111-1111-4111-8111-111111111111',sample_date:'2026-11-19'},{id:'11111111-1111-4111-8111-111111111112',sample_date:'2026-11-12'}];
    else if(url.pathname.endsWith('/md_lab_results'))body=[{report_id:'11111111-1111-4111-8111-111111111111',analyte_name:'Ферритин',numeric_value:200,unit:'мкг/л'},{report_id:'11111111-1111-4111-8111-111111111112',analyte_name:'Ферритин',numeric_value:180,unit:'мкг/л'}];
    else if(url.pathname.endsWith('/md_content_blocks')&&url.searchParams.get('kind')==='eq.sheets_source_snapshot')body=[{body:JSON.stringify({therapy:[['Дата','ХГЧ','Омнадрен','Тирзепатид','ХГЧ_подтверждено','Омнадрен_подтверждено','Тирзепатид_подтверждено'],...['22.11.2026','24.11.2026','26.11.2026'].map(date=>[date,'500','100','2,5','','',''])]})}];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#email').fill('compact@example.invalid');await page.locator('#password').fill('synthetic-password');await page.locator('#login').click();
  const markers=page.getByRole('table',{name:'Маркеры — три последних результата',exact:true});
  await expect(markers.locator('tbody td strong')).toHaveText(['200','180']);
  await expect(page.locator('#markersOverview .data-row')).toHaveCount(0);
  await expect(page.locator('#labTrends')).not.toContainText('Ферритин');
  for(const medication of ['Омнадрен','ХГЧ','Тирзепатид']){
    const table=page.getByRole('table',{name:medication+' — история инъекций',exact:true});
    await expect(table.locator('tbody tr')).toHaveCount(9);
    await expect(table.locator('tbody tr.protocol-planned')).toHaveCount(2);
    await expect(table.locator('tbody tr td:first-child')).toHaveText(['22.11.2026','24.11.2026','10.11.2026','09.11.2026','08.11.2026','07.11.2026','06.11.2026','05.11.2026','04.11.2026']);
    const more=table.locator('xpath=ancestor::section[1]').locator('details.protocol-more');
    await expect(more).not.toHaveAttribute('open');
    await more.locator('summary').click();
    await expect(more.locator('tbody tr')).toHaveCount(4);
  }
  await expect(page.locator('.protocol-dose-total')).toHaveText('Всего введено: 1 000 мг');
  await expect(page.locator('.body-period[data-days="6"]')).toHaveAttribute('aria-pressed','true');
});

test('Body measurements use one summary table and collapsed complete history',async ({page})=>{
  const dates=['2025-01-01','2026-05-15','2026-08-15','2026-10-15','2026-11-15'];
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());let body=[];
    if(url.pathname==='/auth/v1/token')body={access_token:'synthetic-body-table',refresh_token:'synthetic-refresh',expires_at:1900000000,user:{id:'synthetic-body-user'}};
    else if(url.pathname.endsWith('/md_memberships'))body=[{patient_id:'22222222-2222-4222-8222-222222222222',role:'owner'}];
    else if(url.pathname.endsWith('/md_diary_entries'))body=dates.flatMap((date,index)=>[
      {measured_at:date+'T08:00:00Z',metric:'weight',value:70-index,unit:'кг'},
      {measured_at:date+'T08:00:00Z',metric:'muscle_mass',value:50+index,unit:'кг'},
      {measured_at:date+'T08:00:00Z',metric:'body_fat',value:25-index,unit:'%'},
      {measured_at:date+'T08:00:00Z',metric:'hydration',value:53,unit:'%'},
      {measured_at:date+'T08:00:00Z',metric:'pulse',value:70,unit:'уд/мин'}
    ]);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:8765/');
  await page.locator('#email').fill('body@example.invalid');await page.locator('#password').fill('synthetic-password');await page.locator('#login').click();
  const summary=page.getByRole('table',{name:'Состав тела — три последних результата',exact:true});
  await expect(summary.locator('tbody th span')).toHaveText(['Вес','Мышечная масса','Доля жира','Гидратация']);
  await expect(summary.locator('tbody tr').first().locator('td strong')).toHaveText(['66','67','68']);
  await expect(page.locator('#bodyOverview .data-row')).toHaveCount(0);
  await expect(page.locator('#bodyOverview svg')).toHaveCount(0);
  expect(await page.locator('#bodyCharts').evaluate(node=>Boolean(node.compareDocumentPosition(document.getElementById('bodyOverview'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const weight=page.locator('#bodyWeightCard');
  await weight.getByRole('button',{name:'1 мес',exact:true}).click();
  await expect(weight.getByRole('button',{name:'1 мес',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(weight.locator('#bodyWeightChart .chart-point')).toHaveCount(2);
  const history=page.locator('#bodyOverview .body-history');
  await expect(history).not.toHaveAttribute('open');
  await history.locator('summary').click();
  const all=page.getByRole('table',{name:'Состав тела — полная хронология',exact:true});
  await expect(all.locator('tbody tr')).toHaveCount(20);
  await expect(all).toContainText('01.01.2025');
  await expect(all).not.toContainText('Пульс');
  await page.locator('.body-toolbar').getByRole('button',{name:'3 мес',exact:true}).click();
  await expect(summary.locator('tbody tr').first().locator('td small')).toHaveText(['15.11.2026','15.10.2026','15.08.2026']);
  await page.locator('#bodyOverview .body-history summary').click();
  await expect(all.locator('tbody tr')).toHaveCount(20);
});

test('Laboratory search opens compact analyte history and dates combine laboratories',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  const ids=['11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111112','11111111-1111-4111-8111-111111111113'];
  await page.route('https://*.supabase.co/**',async route=>{
    const url=new URL(route.request().url());let body=[];
    if(url.pathname==='/auth/v1/token')body={access_token:'synthetic-journal',refresh_token:'synthetic-refresh',expires_at:1900000000,user:{id:'synthetic-journal-user'}};
    else if(url.pathname.endsWith('/md_memberships'))body=[{patient_id:'22222222-2222-4222-8222-222222222222',role:'owner'}];
    else if(url.pathname.endsWith('/md_lab_reports'))body=ids.map((id,i)=>({id,sample_date:i<2?'2026-11-19':'2026-11-12',report_date:i<2?'2026-11-19':'2026-11-12',lab_name:i===1?'Lab B':'Lab A'}));
    else if(url.pathname.endsWith('/md_lab_results'))body=[
      {report_id:ids[0],analyte_name:'Гемоглобин',numeric_value:165,unit:'г/л',ref_low:135,ref_high:169},
      {report_id:ids[1],analyte_name:'Глюкоза',numeric_value:5,unit:'ммоль/л',ref_low:4,ref_high:6},
      {report_id:ids[2],analyte_name:'Гемоглобин',numeric_value:173,unit:'г/л',ref_low:135,ref_high:169}
    ];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:8765/');await page.locator('#email').fill('journal@example.invalid');await page.locator('#password').fill('synthetic-password');await page.locator('#login').click();
  await page.locator('#journalSearch').fill('гемог');
  await page.locator('#journalSearchResults').getByRole('button',{name:'Гемоглобин',exact:true}).click();
  const history=page.getByRole('table',{name:'Гемоглобин — история результатов',exact:true});
  await expect(history.locator('tr.row')).toHaveCount(2);
  await expect(history.locator('tr.row .lab-value')).toHaveText(['165 г/л','173 г/л↑']);
  await expect(page.locator('#labAnalyteView svg')).toHaveCount(1);
  await expect(page.locator('#labsList')).toBeHidden();
  await history.getByRole('button',{name:'19.11.2026',exact:true}).click();
  await expect(history.locator('.lab-details-row').first()).not.toHaveClass(/hidden/);
  await expect(history.locator('.lab-mobile-lab').first()).toBeVisible();
  await page.locator('#onlyAbnormal').check();
  await expect(history.locator('tr.row')).toHaveCount(1);
  await expect(page.locator('#labsStatus')).toContainText('Измерений 1');
  await page.locator('#onlyAbnormal').uncheck();await page.locator('#labsFilter').fill('');
  await page.getByRole('button',{name:'По дате',exact:true}).click();
  await expect(page.locator('#labsList > .lab-report')).toHaveCount(2);
  const date=page.locator('#labsList > .lab-report').first();
  await expect(date.locator('summary')).toHaveText('19.11.2026 (2)');
  await date.locator('summary').click();
  await expect(date.locator('tr.row')).toHaveCount(2);
  await expect(date).toContainText('Lab A');await expect(date).toContainText('Lab B');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#journalMenuButton').click();await page.locator('#accountLogout').click();
  await expect(page.locator('#labAnalyteView')).toBeEmpty();await expect(page.locator('#labsList')).toBeEmpty();
});
