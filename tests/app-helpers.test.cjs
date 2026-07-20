const test = require('node:test');
const assert = require('node:assert/strict');

const { computeScaledDimensions, buildCandidateViewModels } = require('../app.js');

test('an image already smaller than the max edge keeps its size', () => {
  assert.deepEqual(computeScaledDimensions(400, 300, 768), { width: 400, height: 300 });
});

test('an oversized landscape image is scaled down to the max edge', () => {
  assert.deepEqual(computeScaledDimensions(1600, 1200, 768), { width: 768, height: 576 });
});

test('an oversized portrait image scales by its longest edge', () => {
  assert.deepEqual(computeScaledDimensions(1200, 1600, 768), { width: 576, height: 768 });
});

test('invalid dimensions fall back to a zero size instead of throwing', () => {
  assert.deepEqual(computeScaledDimensions(0, 0, 768), { width: 0, height: 0 });
  assert.deepEqual(computeScaledDimensions(-10, 200, 768), { width: 0, height: 0 });
});

test('a non-positive max edge falls back to a zero size instead of throwing', () => {
  assert.deepEqual(computeScaledDimensions(800, 600, 0), { width: 0, height: 0 });
  assert.deepEqual(computeScaledDimensions(800, 600, -768), { width: 0, height: 0 });
});

const ingredients = [
  { id: 'I09', name: '枸杞子' },
  { id: 'I11', name: '紅棗' },
];

test('candidates are mapped to view models with a confidence percent', () => {
  const result = buildCandidateViewModels([{ id: 'I09', confidence: 0.73 }], ingredients);
  assert.deepEqual(result, [{ id: 'I09', name: '枸杞子', confidencePercent: 73 }]);
});

test('candidates outside the known ingredient list are dropped', () => {
  const result = buildCandidateViewModels([{ id: 'I99', confidence: 0.9 }], ingredients);
  assert.deepEqual(result, []);
});

test('an empty or missing candidate list yields an empty view model list', () => {
  assert.deepEqual(buildCandidateViewModels([], ingredients), []);
  assert.deepEqual(buildCandidateViewModels(undefined, ingredients), []);
});

test('an out-of-range confidence value is clamped to 0-1 before conversion', () => {
  const result = buildCandidateViewModels([{ id: 'I11', confidence: 5 }], ingredients);
  assert.deepEqual(result, [{ id: 'I11', name: '紅棗', confidencePercent: 100 }]);
});
