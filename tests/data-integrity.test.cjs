const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);

const { ingredients, recipes, stores } = context.window.HANFANG_DATA;

test('seed content contains exactly 20 unique ingredients and recipes', () => {
  assert.equal(ingredients.length, 20);
  assert.equal(recipes.length, 20);
  assert.equal(new Set(ingredients.map((item) => item.id)).size, 20);
  assert.equal(new Set(recipes.map((item) => item.id)).size, 20);
});

test('every recipe references only known ingredient ids', () => {
  const validIngredientIds = new Set(ingredients.map((item) => item.id));
  for (const recipe of recipes) {
    for (const ingredientId of recipe.ingredientIds) {
      assert.equal(validIngredientIds.has(ingredientId), true, `${recipe.id} references ${ingredientId}`);
    }
  }
});

test('recipe copy avoids the prototype forbidden health claims', () => {
  const forbiddenClaims = /治療|改善失眠|降血脂|消水腫|補氣|活血|祛濕|排毒/;
  for (const recipe of recipes) {
    const copy = [recipe.title, recipe.description, ...recipe.steps].join(' ');
    assert.equal(forbiddenClaims.test(copy), false, `${recipe.id} contains a forbidden claim`);
  }
});

test('all prototype purchase points remain possible availability only', () => {
  assert.equal(stores.length > 0, true);
  assert.equal(stores.every((store) => store.availability === 'possible'), true);
});
