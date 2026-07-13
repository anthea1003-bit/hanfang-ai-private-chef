(function initialiseHanfangPrototype() {
  'use strict';

  const { ingredients, recipes, stores } = window.HANFANG_DATA;
  const { recommendRecipes, filterStoresByCity, getRecipeProgress, getAtlasPositionForId } = window.HanfangLogic;

  const state = {
    selectedIngredientIds: new Set(['I09', 'I11']),
    excludedAllergens: new Set(),
    maxMinutes: 45,
    city: '全部',
    activeRecipe: null,
    cookingStep: 0,
    previewUrl: null,
  };

  const ingredientGroups = document.querySelector('#ingredientGroups');
  const ingredientSearch = document.querySelector('#ingredientSearch');
  const selectedCounter = document.querySelector('#selectedCounter');
  const maxMinutes = document.querySelector('#maxMinutes');
  const timeOutput = document.querySelector('#timeOutput');
  const recipeGrid = document.querySelector('#recipeGrid');
  const recommendationSummary = document.querySelector('#recommendationSummary');
  const recipeDialog = document.querySelector('#recipeDialog');
  const recipeDialogContent = document.querySelector('#recipeDialogContent');
  const cookingDialog = document.querySelector('#cookingDialog');
  const photoInput = document.querySelector('#ingredientPhoto');
  const scanResult = document.querySelector('#scanResult');
  const scanPreview = document.querySelector('#scanPreview');
  const candidateList = document.querySelector('#candidateList');
  const cityTabs = document.querySelector('#cityTabs');
  const storeGrid = document.querySelector('#storeGrid');
  const groupOrder = ['果實花葉', '根莖種仁', '辛香', '菌菇', '海味'];

  function ingredientById(id) {
    return ingredients.find((ingredient) => ingredient.id === id);
  }

  function renderIngredients(query = '') {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-Hant');
    const visible = ingredients.filter((ingredient) => ingredient.name.toLocaleLowerCase('zh-Hant').includes(normalizedQuery));

    ingredientGroups.innerHTML = groupOrder
      .map((group) => {
        const items = visible.filter((ingredient) => ingredient.group === group);
        if (!items.length) return '';
        return `
          <section class="ingredient-group" aria-labelledby="group-${group}">
            <h3 id="group-${group}">${group}</h3>
            <div class="ingredient-list">
              ${items.map((ingredient) => `
                <button
                  class="ingredient-button"
                  type="button"
                  data-ingredient-id="${ingredient.id}"
                  aria-pressed="${state.selectedIngredientIds.has(ingredient.id)}"
                >
                  <span class="ingredient-mark" style="background-position: ${getAtlasPositionForId(ingredients, ingredient.id)}" aria-hidden="true"></span>
                  <span class="ingredient-name">${ingredient.name}</span>
                </button>
              `).join('')}
            </div>
          </section>
        `;
      })
      .join('');

    if (!visible.length) {
      ingredientGroups.innerHTML = '<p class="empty-note">目前的 20 種食材裡沒有這個品項。</p>';
    }
    selectedCounter.textContent = `已選 ${state.selectedIngredientIds.size} 項`;
  }

  function toggleIngredient(id) {
    if (state.selectedIngredientIds.has(id)) state.selectedIngredientIds.delete(id);
    else state.selectedIngredientIds.add(id);
    renderIngredients(ingredientSearch.value);
    renderRecommendations();
  }

  function renderRecommendations(scrollIntoView = false) {
    const results = recommendRecipes(recipes, {
      selectedIngredientIds: [...state.selectedIngredientIds],
      excludedAllergens: [...state.excludedAllergens],
      maxMinutes: state.maxMinutes,
    });
    const selectedCount = state.selectedIngredientIds.size;
    recommendationSummary.textContent = selectedCount
      ? `依照你已選的 ${selectedCount} 項食材，先找最接近的料理。`
      : `還沒選食材，先看看 ${state.maxMinutes} 分鐘內可完成的料理。`;

    if (!results.length) {
      recipeGrid.innerHTML = '<div class="empty-note">目前沒有符合時間與過敏原條件的食譜，試著放寬料理時間。</div>';
      return;
    }

    recipeGrid.innerHTML = results.slice(0, 3).map((recipe) => {
      const matchText = recipe.matchCount
        ? `手邊已有 ${recipe.matchCount} 項主要食材`
        : '可列入下次採買';
      return `
        <button class="recipe-card" type="button" data-recipe-id="${recipe.id}" aria-label="查看${recipe.title}食譜">
          <div class="recipe-art" style="background-position: ${getAtlasPositionForId(recipes, recipe.id)}" role="img" aria-label="${recipe.title}水彩插畫"></div>
          <div class="recipe-info">
            <div class="recipe-meta"><span>${recipe.category}</span><span>${recipe.minutes} MIN・${recipe.servings}</span></div>
            <h3>${recipe.title}</h3>
            <p>${recipe.description}</p>
            <span class="recipe-match">${matchText}</span>
            <span class="recipe-arrow" aria-hidden="true">↗</span>
          </div>
        </button>
      `;
    }).join('');

    if (scrollIntoView) {
      document.querySelector('#recommendations').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function openRecipe(recipeId) {
    const recipe = recipes.find((item) => item.id === recipeId);
    if (!recipe) return;
    state.activeRecipe = recipe;
    recipeDialogContent.innerHTML = `
      <section class="recipe-detail-hero tone-${recipe.tone}">
        <p class="eyebrow"><span></span>${recipe.category.toUpperCase()}・${recipe.id}</p>
        <h2 id="dialogRecipeTitle">${recipe.title}</h2>
        <p>${recipe.description}</p>
        <div class="detail-meta"><span>約 ${recipe.minutes} 分鐘</span><span>${recipe.servings}</span></div>
      </section>
      <div class="recipe-detail-body">
        <section>
          <h3>準備食材</h3>
          <ul>${recipe.ingredients.map((item) => `<li>${item}</li>`).join('')}</ul>
        </section>
        <section>
          <h3>料理步驟</h3>
          <ol>${recipe.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
          <button class="button button-primary start-cooking" type="button" data-start-cooking>開始陪煮 <span>→</span></button>
        </section>
      </div>
    `;
    recipeDialog.showModal();
  }

  function renderCookingStep() {
    if (!state.activeRecipe) return;
    const progress = getRecipeProgress(state.cookingStep, state.activeRecipe.steps.length);
    state.cookingStep = progress.current;
    document.querySelector('#cookingTitle').textContent = state.activeRecipe.title;
    document.querySelector('#cookingProgressBar').style.width = `${progress.percent}%`;
    document.querySelector('#cookingProgressText').textContent = `步驟 ${progress.current + 1} / ${state.activeRecipe.steps.length}`;
    document.querySelector('#cookingStepNumber').textContent = String(progress.current + 1).padStart(2, '0');
    document.querySelector('#cookingStepText').textContent = state.activeRecipe.steps[progress.current];
    document.querySelector('#previousStep').disabled = progress.current === 0;
    const nextButton = document.querySelector('#nextStep');
    nextButton.textContent = progress.current === state.activeRecipe.steps.length - 1 ? '✓' : '→';
    document.querySelector('#liveStatus').textContent = '';
  }

  function startCooking() {
    state.cookingStep = 0;
    recipeDialog.close();
    renderCookingStep();
    cookingDialog.showModal();
  }

  function deterministicCandidates(fileName) {
    const ids = ['I09', 'I11', 'I08', 'I02', 'I15', 'I17', 'I16', 'I01', 'I10', 'I18'];
    const seed = [...fileName].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return [0, 3, 7].map((offset) => ingredientById(ids[(seed + offset) % ids.length]));
  }

  function showPhotoCandidates(file) {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    scanPreview.src = state.previewUrl;
    scanResult.hidden = false;
    candidateList.innerHTML = deterministicCandidates(file.name).map((ingredient) => `
      <button class="candidate-button" type="button" data-candidate-id="${ingredient.id}">＋ ${ingredient.name}</button>
    `).join('');
  }

  function renderStores() {
    const cities = ['全部', '台北市', '台中市', '高雄市'];
    cityTabs.innerHTML = cities.map((city) => `
      <button class="city-tab" type="button" role="tab" data-city="${city}" aria-selected="${state.city === city}">${city}</button>
    `).join('');

    const visibleStores = filterStoresByCity(stores, state.city);
    storeGrid.innerHTML = visibleStores.map((store) => {
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
      return `
        <article class="store-card">
          <span class="store-pin" aria-hidden="true">⌖</span>
          <div>
            <h3>${store.name}</h3>
            <p>${store.city}${store.district}・${store.type}<br />${store.address}</p>
            <span class="availability">可能有售・請先確認</span>
          </div>
          <a class="map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer">地圖導航 ↗</a>
        </article>
      `;
    }).join('');
  }

  ingredientGroups.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ingredient-id]');
    if (button) toggleIngredient(button.dataset.ingredientId);
  });

  ingredientSearch.addEventListener('input', () => renderIngredients(ingredientSearch.value));

  document.querySelectorAll('input[name="allergen"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.excludedAllergens.add(checkbox.value);
      else state.excludedAllergens.delete(checkbox.value);
      renderRecommendations();
    });
  });

  maxMinutes.addEventListener('input', () => {
    state.maxMinutes = Number(maxMinutes.value);
    timeOutput.textContent = `${state.maxMinutes} 分鐘`;
    renderRecommendations();
  });

  document.querySelector('#recommendButton').addEventListener('click', () => renderRecommendations(true));

  recipeGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-recipe-id]');
    if (card) openRecipe(card.dataset.recipeId);
  });

  recipeDialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-dialog]')) recipeDialog.close();
    if (event.target.closest('[data-start-cooking]')) startCooking();
  });

  document.querySelector('[data-close-cooking]').addEventListener('click', () => cookingDialog.close());

  document.querySelector('#previousStep').addEventListener('click', () => {
    state.cookingStep -= 1;
    renderCookingStep();
  });

  document.querySelector('#nextStep').addEventListener('click', () => {
    if (!state.activeRecipe) return;
    if (state.cookingStep < state.activeRecipe.steps.length - 1) {
      state.cookingStep += 1;
      renderCookingStep();
    } else {
      document.querySelector('#liveStatus').textContent = '完成了。記得先放涼、確認熟度，再和家人一起享用。';
    }
  });

  document.querySelector('#voiceButton').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const listening = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(listening));
    button.querySelector('span').textContent = listening ? '正在聽…' : '按住說話';
    document.querySelector('#liveStatus').textContent = listening
      ? '語音功能目前為介面試玩，尚未連接辨識服務。'
      : '已停止試玩語音。';
  });

  photoInput.addEventListener('change', () => {
    const [file] = photoInput.files || [];
    if (file) showPhotoCandidates(file);
  });

  candidateList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-candidate-id]');
    if (!button) return;
    state.selectedIngredientIds.add(button.dataset.candidateId);
    button.textContent = '已加入';
    button.disabled = true;
    renderIngredients(ingredientSearch.value);
    renderRecommendations();
  });

  cityTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-city]');
    if (!tab) return;
    state.city = tab.dataset.city;
    renderStores();
  });

  document.querySelectorAll('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }));
  });

  window.addEventListener('beforeunload', () => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  });

  renderIngredients();
  renderRecommendations();
  renderStores();
})();
