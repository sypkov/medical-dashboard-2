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

const names = ['validLabDate', 'canonicalBloodCountUnit', 'trendMedicalValue', 'normalizedMedicalPoint'];
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
