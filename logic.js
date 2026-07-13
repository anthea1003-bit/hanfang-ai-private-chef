(function exposeHanfangLogic(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HanfangLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHanfangLogic() {
  function recommendRecipes(recipes, options = {}) {
    const selected = new Set(options.selectedIngredientIds || []);
    const excluded = new Set(options.excludedAllergens || []);
    const maxMinutes = Number(options.maxMinutes || Infinity);

    return recipes
      .filter((recipe) => Number(recipe.minutes) <= maxMinutes)
      .filter((recipe) => !(recipe.allergens || []).some((allergen) => excluded.has(allergen)))
      .map((recipe) => {
        const matchCount = (recipe.ingredientIds || []).filter((id) => selected.has(id)).length;
        const missingCount = Math.max((recipe.ingredientIds || []).length - matchCount, 0);
        return {
          ...recipe,
          matchCount,
          missingCount,
          score: matchCount * 10 - missingCount - Number(recipe.minutes) / 100,
        };
      })
      .sort((a, b) => b.score - a.score || a.minutes - b.minutes || a.id.localeCompare(b.id));
  }

  function filterStoresByCity(stores, city) {
    if (!city || city === '全部') return stores.slice();
    return stores.filter((store) => store.city === city);
  }

  function getRecipeProgress(stepIndex, totalSteps) {
    const safeTotal = Math.max(Number(totalSteps) || 1, 1);
    const current = Math.min(Math.max(Number(stepIndex) || 0, 0), safeTotal - 1);
    return {
      current,
      percent: Math.round(((current + 1) / safeTotal) * 100),
    };
  }

  function getAtlasPositionForId(items, id) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Unknown atlas item: ${id}`);
    const column = index % 5;
    const row = Math.floor(index / 5);
    return `${column * 25}% ${row * (100 / 3)}%`;
  }

  return { recommendRecipes, filterStoresByCity, getRecipeProgress, getAtlasPositionForId };
});
