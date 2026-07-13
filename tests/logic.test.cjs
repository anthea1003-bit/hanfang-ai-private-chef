const test = require('node:test');
const assert = require('node:assert/strict');

const {
  recommendRecipes,
  filterStoresByCity,
  getRecipeProgress,
  getAtlasPositionForId,
} = require('../logic.js');

const recipes = [
  {
    id: 'R01',
    title: '枸杞紅棗茶',
    ingredientIds: ['I09', 'I11'],
    allergens: [],
    minutes: 15,
  },
  {
    id: 'R19',
    title: '小茴香八角滷豆干',
    ingredientIds: ['I06', 'I07'],
    allergens: ['soy'],
    minutes: 30,
  },
  {
    id: 'R20',
    title: '花椒薑絲蒸魚',
    ingredientIds: ['I04', 'I13'],
    allergens: ['fish'],
    minutes: 20,
  },
];

test('selected pantry ingredients rank a matching approved recipe first', () => {
  const results = recommendRecipes(recipes, {
    selectedIngredientIds: ['I09', 'I11'],
    excludedAllergens: [],
    maxMinutes: 30,
  });

  assert.equal(results[0].id, 'R01');
  assert.equal(results[0].matchCount, 2);
});

test('recipes containing a selected allergen are removed', () => {
  const results = recommendRecipes(recipes, {
    selectedIngredientIds: ['I06', 'I07'],
    excludedAllergens: ['soy'],
    maxMinutes: 60,
  });

  assert.equal(results.some((recipe) => recipe.id === 'R19'), false);
});

test('recipes over the chosen cooking time are removed', () => {
  const results = recommendRecipes(recipes, {
    selectedIngredientIds: ['I06', 'I07'],
    excludedAllergens: [],
    maxMinutes: 20,
  });

  assert.equal(results.some((recipe) => recipe.id === 'R19'), false);
});

test('nearby stores remain labelled as possible availability', () => {
  const stores = [
    { id: 'S01', city: '台北市', availability: 'possible' },
    { id: 'S02', city: '台中市', availability: 'possible' },
  ];

  const results = filterStoresByCity(stores, '台北市');
  assert.deepEqual(results.map((store) => store.id), ['S01']);
  assert.equal(results[0].availability, 'possible');
});

test('cooking progress is clamped to the valid step range', () => {
  assert.deepEqual(getRecipeProgress(-1, 4), { current: 0, percent: 25 });
  assert.deepEqual(getRecipeProgress(3, 4), { current: 3, percent: 100 });
  assert.deepEqual(getRecipeProgress(9, 4), { current: 3, percent: 100 });
});

test('ranked recipe copies retain their original atlas position by stable id', () => {
  const results = recommendRecipes(recipes, {
    selectedIngredientIds: ['I04', 'I13'],
    excludedAllergens: [],
    maxMinutes: 60,
  });

  assert.notEqual(results[0], recipes[2]);
  assert.equal(results[0].id, 'R20');
  assert.equal(getAtlasPositionForId(recipes, results[0].id), '50% 0%');
});

test('atlas position rejects an unknown item instead of rendering a blank tile', () => {
  assert.throws(() => getAtlasPositionForId(recipes, 'R99'), /Unknown atlas item/);
});

test('a 5 by 4 atlas maps its first and last tiles to opposite corners', () => {
  const atlasItems = Array.from({ length: 20 }, (_, index) => ({
    id: `A${String(index + 1).padStart(2, '0')}`,
  }));

  assert.equal(getAtlasPositionForId(atlasItems, 'A01'), '0% 0%');
  assert.equal(getAtlasPositionForId(atlasItems, 'A20'), '100% 100%');
});
