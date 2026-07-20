const test = require('node:test');
const assert = require('node:assert/strict');

const { isAllowedOrigin, parseCandidates, checkRateLimit } = require('../worker/src/lib.js');

const validIngredients = [
  { id: 'I09', name: '枸杞子' },
  { id: 'I11', name: '紅棗' },
  { id: 'I18', name: '菊花' },
];

test('the GitHub Pages origin is allowed', () => {
  assert.equal(isAllowedOrigin('https://anthea1003-bit.github.io'), true);
});

test('localhost and 127.0.0.1 are allowed at any port', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:8080'), true);
  assert.equal(isAllowedOrigin('http://localhost'), true);
});

test('an unrelated origin is rejected', () => {
  assert.equal(isAllowedOrigin('https://evil.example.com'), false);
  assert.equal(isAllowedOrigin(''), false);
  assert.equal(isAllowedOrigin(null), false);
  assert.equal(isAllowedOrigin(undefined), false);
});

test('valid JSON candidates are kept and confidence is clamped to 0-1', () => {
  const raw = JSON.stringify({
    candidates: [
      { id: 'I09', name: '模型自稱的名字', confidence: 1.5 },
      { id: 'I11', name: '紅棗', confidence: -0.2 },
    ],
  });
  const result = parseCandidates(raw, validIngredients);
  assert.deepEqual(result.candidates, [
    { id: 'I09', name: '枸杞子', confidence: 1 },
    { id: 'I11', name: '紅棗', confidence: 0 },
  ]);
});

test('candidates referencing an unknown id are filtered out', () => {
  const raw = JSON.stringify({
    candidates: [
      { id: 'I09', name: '枸杞子', confidence: 0.8 },
      { id: 'I99', name: '不存在', confidence: 0.9 },
    ],
  });
  const result = parseCandidates(raw, validIngredients);
  assert.deepEqual(result.candidates, [{ id: 'I09', name: '枸杞子', confidence: 0.8 }]);
});

test('malformed JSON falls back to an empty candidate list', () => {
  assert.deepEqual(parseCandidates('not json', validIngredients), { candidates: [] });
  assert.deepEqual(parseCandidates('{"candidates": "nope"}', validIngredients), { candidates: [] });
  assert.deepEqual(parseCandidates('{}', validIngredients), { candidates: [] });
});

test('candidates are capped at 3 even when more unique valid ids are returned', () => {
  const raw = JSON.stringify({
    candidates: [
      { id: 'I09', confidence: 0.9 },
      { id: 'I11', confidence: 0.5 },
      { id: 'I18', confidence: 0.4 },
      { id: 'I20', confidence: 0.3 },
    ],
  });
  const moreIngredients = [...validIngredients, { id: 'I20', name: '陳皮' }];
  const result = parseCandidates(raw, moreIngredients);
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((item) => item.id), ['I09', 'I11', 'I18']);
});

test('duplicate ids are dropped before the cap is applied', () => {
  const raw = JSON.stringify({
    candidates: [
      { id: 'I09', confidence: 0.9 },
      { id: 'I09', confidence: 0.5 },
      { id: 'I11', confidence: 0.4 },
    ],
  });
  const result = parseCandidates(raw, validIngredients);
  assert.deepEqual(result.candidates.map((item) => item.id), ['I09', 'I11']);
  assert.equal(result.candidates[0].confidence, 0.9);
});

test('non-numeric confidence values default to 0', () => {
  const raw = JSON.stringify({
    candidates: [
      { id: 'I09', confidence: 'abc' },
      { id: 'I11', confidence: null },
      { id: 'I18' },
    ],
  });
  const result = parseCandidates(raw, validIngredients);
  assert.deepEqual(result.candidates.map((item) => item.confidence), [0, 0, 0]);
});

test('a request within the limit is allowed and the counter increments', () => {
  const store = new Map();
  const first = checkRateLimit(store, '1.2.3.4', 1000, 2, 60000);
  const second = checkRateLimit(store, '1.2.3.4', 1010, 2, 60000);
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
});

test('a request beyond the limit within the same window is rejected', () => {
  const store = new Map();
  checkRateLimit(store, '1.2.3.4', 1000, 2, 60000);
  checkRateLimit(store, '1.2.3.4', 1010, 2, 60000);
  const third = checkRateLimit(store, '1.2.3.4', 1020, 2, 60000);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});

test('the counter resets once the window has elapsed', () => {
  const store = new Map();
  checkRateLimit(store, '1.2.3.4', 1000, 2, 60000);
  checkRateLimit(store, '1.2.3.4', 1010, 2, 60000);
  const afterWindow = checkRateLimit(store, '1.2.3.4', 1000 + 60000, 2, 60000);
  assert.equal(afterWindow.allowed, true);
  assert.equal(afterWindow.remaining, 1);
});

test('different IPs are tracked independently', () => {
  const store = new Map();
  checkRateLimit(store, '1.1.1.1', 1000, 1, 60000);
  const other = checkRateLimit(store, '2.2.2.2', 1000, 1, 60000);
  assert.equal(other.allowed, true);
});

test('a non-positive limit always denies the request', () => {
  const store = new Map();
  assert.deepEqual(checkRateLimit(store, '1.2.3.4', 1000, 0, 60000), { allowed: false, remaining: 0 });
  assert.deepEqual(checkRateLimit(store, '1.2.3.4', 1000, -5, 60000), { allowed: false, remaining: 0 });
  assert.equal(store.size, 0);
});

test('expired entries are swept out once the store grows past 1000 keys', () => {
  const store = new Map();
  for (let index = 0; index < 1001; index += 1) {
    checkRateLimit(store, `10.0.0.${index}`, 1000, 20, 60000);
  }
  assert.equal(store.size, 1001);
  checkRateLimit(store, 'fresh-ip', 1000 + 60000, 20, 60000);
  assert.equal(store.size, 1);
  assert.equal(store.has('fresh-ip'), true);
});
