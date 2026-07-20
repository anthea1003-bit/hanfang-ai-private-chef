const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ingredient atlas stays below 800 KB for fast Safari reloads', () => {
  const atlasPath = path.join(__dirname, '../assets/ingredient-atlas-gpt-image2.png');
  const { size } = fs.statSync(atlasPath);
  assert.ok(size < 800000, `ingredient atlas is ${size} bytes`);
});
