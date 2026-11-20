// Run with: node --test tests/medical-data.test.cjs
// Synthetic data only: never add real patient information to this repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script, 'Dashboard inline script must exist');

// Extract actual production function declarations, rather than reimplementing logic in tests.
function extractFunction(name) {
  const source = script[1];
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing production function: ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}

const names = ['validLabDate', 'canonicalBloodCountUnit', 'trendMedicalValue', 'normalizedMedicalPoint', 'filterLabReports', 'labSearchDateTerms'];
const sandbox = vm.createContext({});
vm.runInContext(names.map(extractFunction).join('\n'), sandbox);

test('profile lookup failure is visible, retryable and makes no medical requests', async () => {
  const controls = new Map();
  const calls = [];
  const state = vm.createContext({
    privateViewEpoch:0, labsRequestSerial:0, signed:true, client:{}, PATIENT:null,
    e(id){ if(!controls.has(id))controls.set(id,{textContent:'',disabled:false,replaceChildren(){}});return controls.get(id); },
    resolvePatient:async()=>{throw Error('Profile unavailable')},
    renderOverview(){},renderHematologyCharts(){},refresh(){},
    loadSupplemental(){calls.push('supplemental');return Promise.resolve()},
    labReadPages(){calls.push('labs');return Promise.resolve([])}
  });
  vm.runInContext('async '+extractFunction('loadLabs'),state);
  await state.loadLabs();
  assert.match(controls.get('labsStatus').textContent,/Profile unavailable/);
  assert.equal(controls.get('loadLabs').disabled,false);
  assert.deepEqual(calls,[]);
  state.resolvePatient=async()=>{state.PATIENT='22222222-2222-4222-8222-222222222222'};
  await state.loadLabs();
  assert.deepEqual(calls,['labs','supplemental']);
});

test('logout during profile lookup prevents all medical loading', async () => {
  let complete;
  const calls=[];
  const state=vm.createContext({
    privateViewEpoch:0,labsRequestSerial:0,signed:true,client:{},PATIENT:null,
    e(){return {disabled:false,textContent:''}},
    resolvePatient:()=>new Promise(resolve=>{complete=resolve}),
    refresh(){calls.push('refresh')},labReadPages(){calls.push('labs')}
  });
  vm.runInContext('async '+extractFunction('loadLabs'),state);
  const pending=state.loadLabs();
  state.signed=false;state.privateViewEpoch++;
  complete();await pending;
  assert.deepEqual(calls,[]);
});

test('import stays disabled until a profile is resolved', () => {
  const controls=new Map();
  const state=vm.createContext({signed:true,busy:false,client:{},PATIENT:null,payload:{},importId:null,
    e(id){if(!controls.has(id))controls.set(id,{disabled:false,checked:true,classList:{toggle(){}}});return controls.get(id)}});
  vm.runInContext(extractFunction('refresh'),state);
  state.refresh();assert.equal(controls.get('stage').disabled,true);
  state.PATIENT='22222222-2222-4222-8222-222222222222';
  state.refresh();assert.equal(controls.get('stage').disabled,false);
});

test('calendar dates reject rollover, invalid format and missing values', () => {
  for (const date of ['2024-02-29', '2026-11-20', '2000-02-29'])
    assert.equal(sandbox.validLabDate(date), true, date);
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-11-31', '20.11.2026', '', null])
    assert.equal(sandbox.validLabDate(date), false, String(date));
});

test('generic trends distinguish missing values from real zero', () => {
  for (const numeric_value of [null, undefined, '', '   ', 'not-a-number'])
    assert.ok(Number.isNaN(sandbox.trendMedicalValue({analyte_name:'Гематокрит', numeric_value}).value));
  assert.equal(sandbox.trendMedicalValue({analyte_name:'Гематокрит', numeric_value:0}).value, 0);
});

test('hemoglobin units are converted consistently', () => {
  const input = {analyte_name:'Гемоглобин', numeric_value:15.2, unit:'г/дл'};
  const generic = sandbox.trendMedicalValue(input);
  assert.equal(generic.value, 152);
  assert.equal(generic.unit, 'г/л');
  const specific = sandbox.normalizedMedicalPoint({...input, ref_low:12, ref_high:17}, {title:'Гемоглобин'});
  assert.equal(specific.value, 152);
  assert.equal(specific.refLow, 120);
  assert.equal(specific.refHigh, 170);
  assert.equal(specific.converted, true);
});

test('specific charts preserve missing reference bounds', () => {
  const result = sandbox.normalizedMedicalPoint({numeric_value:42, unit:'%', ref_low:'', ref_high:null}, {title:'Гематокрит'});
  assert.equal(result.value, 42);
  assert.equal(result.refLow, null);
  assert.equal(result.refHigh, null);
  assert.ok(Number.isNaN(sandbox.normalizedMedicalPoint({numeric_value:' ', unit:'%'}, {title:'Гематокрит'}).value));
});

test('blood count unit variants normalize to one display unit', () => {
  assert.equal(sandbox.canonicalBloodCountUnit('Тромбоциты', '10^9/л'), '×10⁹/л');
  assert.equal(sandbox.canonicalBloodCountUnit('Эритроциты', '×10¹²/л'), '×10¹²/л');
});

test('lab filters reveal matching rows and restore manual expansion state', () => {
  function classes() {
    const values = new Set();
    return {toggle(name, enabled) { if (enabled) values.add(name); else values.delete(name); }, contains(name) { return values.has(name); }};
  }
  const rows = [
    {dataset:{name:'гематокрит hct', abnormal:'true'}, classList:classes()},
    {dataset:{name:'гемоглобин hgb', abnormal:'false'}, classList:classes()}
  ];
  const details = {open:false, dataset:{}};
  const summary = {textContent:''};
  const card = {
    dataset:{reportSearch:'лаборатория север 2026-11-20'},
    classList:classes(),
    querySelectorAll(selector) { assert.equal(selector, '.lab-results .row'); return rows; },
    querySelector(selector) { return selector==='details'?details:selector==='summary'?summary:null; }
  };
  const controls = {
    labsFilter:{value:''},
    onlyAbnormal:{checked:false},
    labsList:{children:[card]}
  };
  sandbox.e = id => controls[id];
  controls.labsFilter.value='  ГЕМАТОКРИТ    СЕВЕР  ';
  sandbox.filterLabReports();
  assert.equal(rows[0].classList.contains('hidden'), false);
  assert.equal(rows[1].classList.contains('hidden'), true);
  assert.equal(details.open, true);
  assert.equal(summary.textContent, 'Показатели (1)');
  assert.equal(card.classList.contains('hidden'), false);
  controls.labsFilter.value='';
  controls.onlyAbnormal.checked=true;
  sandbox.filterLabReports();
  assert.equal(details.open, true);
  assert.equal(rows[1].classList.contains('hidden'), true);
  controls.onlyAbnormal.checked=false;
  sandbox.filterLabReports();
  assert.equal(details.open, false, 'manual closed state must be restored');
  assert.equal(details.dataset.preFilterOpen, undefined);
  assert.equal(rows[1].classList.contains('hidden'), false);
  assert.equal(summary.textContent, 'Показатели (2)');
});

test('lab filter retains empty reports only when their metadata matches', () => {
  const hidden = new Set();
  const card = {
    dataset:{reportSearch:'архивная лаборатория 2025-03-04'},
    classList:{toggle(name, on){if(on)hidden.add(name);else hidden.delete(name)}},
    querySelectorAll(){return []},
    querySelector(){return null}
  };
  const controls = {labsFilter:{value:'архивная'},onlyAbnormal:{checked:false},labsList:{children:[card]}};
  sandbox.e = id => controls[id];
  sandbox.filterLabReports();
  assert.equal(hidden.has('hidden'), false);
  controls.labsFilter.value='неизвестная';
  sandbox.filterLabReports();
  assert.equal(hidden.has('hidden'), true);
  controls.labsFilter.value='';
  sandbox.filterLabReports();
  assert.equal(hidden.has('hidden'), false);
});

test('laboratory report date search accepts ISO and Russian calendar notation', () => {
  const valid = Array.from(sandbox.labSearchDateTerms('2026-11-20'));
  assert.deepEqual(valid, ['2026-11-20', '20.11.2026']);
  const leap = Array.from(sandbox.labSearchDateTerms('2024-02-29'));
  assert.deepEqual(leap, ['2024-02-29', '29.02.2024']);
  assert.deepEqual(Array.from(sandbox.labSearchDateTerms('2026-02-30')), ['2026-02-30']);
});

test('lab filtering preserves an initially expanded report', () => {
  const row = {dataset:{name:'эстрадиол e2',abnormal:'false'},classList:{toggle(){}}};
  const details = {open:true,dataset:{}};
  const card = {
    dataset:{reportSearch:'лаборатория тест 2026-11-20'},
    classList:{toggle(){}},
    querySelectorAll(){return [row]},
    querySelector(selector){return selector==='details'?details:{textContent:''}}
  };
  const controls={labsFilter:{value:'эстрадиол'},onlyAbnormal:{checked:false},labsList:{children:[card]}};
  sandbox.e=id=>controls[id];
  sandbox.filterLabReports();
  assert.equal(details.open,true);
  assert.equal(details.dataset.preFilterOpen,'true');
  controls.labsFilter.value='несуществующий показатель';
  sandbox.filterLabReports();
  assert.equal(details.open,false);
  controls.labsFilter.value='';
  sandbox.filterLabReports();
  assert.equal(details.open,true,'original expanded state should be restored');
  assert.equal(details.dataset.preFilterOpen,undefined);
});

test('filtering across a report and an analyte is order-independent', () => {
  const row={dataset:{name:'тестостерон общий testo',abnormal:'false'},hidden:false,
    classList:{toggle(name,on){if(name==='hidden')this.hidden=on},hidden:false}};
  const card={dataset:{reportSearch:'северная лаборатория 2026-11-20'},hidden:false,
    classList:{toggle(name,on){if(name==='hidden')this.hidden=on},hidden:false},
    querySelectorAll(){return [row]},querySelector(){return null}};
  const controls={labsFilter:{value:'ТЕСТОСТЕРОН   СЕВЕРНАЯ'},onlyAbnormal:{checked:false},labsList:{children:[card]}};
  sandbox.e=id=>controls[id];
  sandbox.filterLabReports();
  assert.equal(row.classList.hidden,false);
  assert.equal(card.classList.hidden,false);
  controls.labsFilter.value='северная тестостерон';
  sandbox.filterLabReports();
  assert.equal(row.classList.hidden,false);
});

test('abnormal-only filter hides normal results and reports without abnormalities', () => {
  function classes(){return {hidden:false,toggle(name,on){if(name==='hidden')this.hidden=on}}}
  function card(rows){return {dataset:{reportSearch:'лаборатория'},classList:classes(),
    querySelectorAll(){return rows},querySelector(){return null}}}
  const abnormal={dataset:{name:'гематокрит',abnormal:'true'},classList:classes()};
  const normal={dataset:{name:'гемоглобин',abnormal:'false'},classList:classes()};
  const first=card([abnormal,normal]),second=card([{dataset:{name:'эстрадиол',abnormal:'false'},classList:classes()}]);
  const controls={labsFilter:{value:''},onlyAbnormal:{checked:true},labsList:{children:[first,second]}};
  sandbox.e=id=>controls[id];
  sandbox.filterLabReports();
  assert.equal(abnormal.classList.hidden,false);
  assert.equal(normal.classList.hidden,true);
  assert.equal(first.classList.hidden,false);
  assert.equal(second.classList.hidden,true);
  controls.onlyAbnormal.checked=false;
  sandbox.filterLabReports();
  assert.equal(normal.classList.hidden,false);
  assert.equal(second.classList.hidden,false);
});

test('laboratory report search combines Russian dates with analyte names', () => {
  const row={dataset:{name:'гемоглобин hgb',abnormal:'false'},classList:{hidden:false,toggle(name,on){if(name==='hidden')this.hidden=on}}};
  const reportTerms=['клиническая лаборатория',...sandbox.labSearchDateTerms('2026-11-20')].join(' ').toLowerCase();
  const card={dataset:{reportSearch:reportTerms},classList:{hidden:false,toggle(name,on){if(name==='hidden')this.hidden=on}},
    querySelectorAll(){return [row]},querySelector(){return null}};
  const controls={labsFilter:{value:'20.11.2026 гемоглобин'},onlyAbnormal:{checked:false},labsList:{children:[card]}};
  sandbox.e=id=>controls[id];
  sandbox.filterLabReports();
  assert.equal(row.classList.hidden,false);
  assert.equal(card.classList.hidden,false);
  controls.labsFilter.value='21.11.2026 гемоглобин';
  sandbox.filterLabReports();
  assert.equal(row.classList.hidden,true);
  assert.equal(card.classList.hidden,true);
});

test('laboratory search uses both sample date and report date', () => {
  const sample=sandbox.labSearchDateTerms('2026-11-18');
  const issued=sandbox.labSearchDateTerms('2026-11-20');
  const reportSearch=['медицинская лаборатория',...sample,...issued].join(' ');
  const row={dataset:{name:'тромбоциты plt',abnormal:'false'},classList:{hidden:false,toggle(name,on){if(name==='hidden')this.hidden=on}}};
  const card={dataset:{reportSearch},classList:{hidden:false,toggle(name,on){if(name==='hidden')this.hidden=on}},
    querySelectorAll(){return [row]},querySelector(){return null}};
  const controls={labsFilter:{value:'18.11.2026 тромбоциты'},onlyAbnormal:{checked:false},labsList:{children:[card]}};
  sandbox.e=id=>controls[id];
  sandbox.filterLabReports();
  assert.equal(row.classList.hidden,false);
  controls.labsFilter.value='20.11.2026 тромбоциты';
  sandbox.filterLabReports();
  assert.equal(row.classList.hidden,false);
  controls.labsFilter.value='19.11.2026 тромбоциты';
  sandbox.filterLabReports();
  assert.equal(row.classList.hidden,true);
});

