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
