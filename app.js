(function exposeHanfangAppHelpers(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HanfangAppHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHanfangAppHelpers() {
  function computeScaledDimensions(width, height, maxEdge = 768) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    const edge = Number(maxEdge) || 0;
    if (w <= 0 || h <= 0 || edge <= 0) return { width: 0, height: 0 };
    const longestEdge = Math.max(w, h);
    if (longestEdge <= edge) return { width: Math.round(w), height: Math.round(h) };
    const scale = edge / longestEdge;
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  }

  function buildCandidateViewModels(candidates, ingredients) {
    const byId = new Map((ingredients || []).map((item) => [item.id, item]));
    return (candidates || [])
      .filter((candidate) => candidate && byId.has(candidate.id))
      .map((candidate) => {
        const ingredient = byId.get(candidate.id);
        const confidenceNumber = Number(candidate.confidence);
        const confidence = Number.isFinite(confidenceNumber) ? Math.max(0, Math.min(1, confidenceNumber)) : 0;
        return { id: ingredient.id, name: ingredient.name, confidencePercent: Math.round(confidence * 100) };
      });
  }

  return { computeScaledDimensions, buildCandidateViewModels };
});

const { computeScaledDimensions, buildCandidateViewModels } =
  (typeof globalThis !== 'undefined' ? globalThis : this).HanfangAppHelpers;

if (typeof window !== 'undefined' && window.HANFANG_DATA && window.HanfangLogic) {
  (function initialiseHanfangPrototype() {
  'use strict';

  const API_BASE = window.HANFANG_API_BASE || '';
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
  const scanPrivacyNote = document.querySelector('#scanPrivacyNote');
  const candidateLabel = document.querySelector('#candidateLabel');
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

  function updateScanCopy() {
    if (!scanPrivacyNote) return;
    scanPrivacyNote.textContent = API_BASE
      ? '照片只會產生候選，不會替你判定能不能吃；照片會傳送到 AI 辨識，不會保存。'
      : '照片只會產生候選，不會替你判定能不能吃；影像留在這個瀏覽器預覽，不會上傳。';
  }

  function renderCandidateButtons(items) {
    if (!items.length) {
      candidateList.innerHTML = '<p class="empty-note">認不出來，請手動選擇。</p>';
      return;
    }
    candidateList.innerHTML = items.map((item) => `
      <button class="candidate-button" type="button" data-candidate-id="${item.id}">＋ ${item.name}${
        item.confidencePercent === undefined ? '' : `（${item.confidencePercent}%）`
      }</button>
    `).join('');
  }

  function renderDeterministicFallback(fileName, label) {
    if (candidateLabel) candidateLabel.textContent = label;
    const items = deterministicCandidates(fileName).map((ingredient) => ({ id: ingredient.id, name: ingredient.name }));
    renderCandidateButtons(items);
  }

  function compressImageToDataUrl(file, maxEdge = 768, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const { width, height } = computeScaledDimensions(image.naturalWidth, image.naturalHeight, maxEdge);
        const canvas = document.createElement('canvas');
        canvas.width = width || image.naturalWidth;
        canvas.height = height || image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('image_load_failed'));
      };
      image.src = objectUrl;
    });
  }

  let scanSequence = 0;

  async function showPhotoCandidates(file) {
    // Increasing sequence number: if a newer photo was picked while this one
    // was still identifying, the stale result is dropped instead of rendered.
    const sequence = ++scanSequence;

    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    scanPreview.src = state.previewUrl;
    scanResult.hidden = false;

    if (!API_BASE) {
      renderDeterministicFallback(file.name, '模擬辨識候選');
      return;
    }

    if (candidateLabel) candidateLabel.textContent = '辨識中…';
    candidateList.innerHTML = '<p class="empty-note">正在辨識，請稍候…</p>';

    try {
      const dataUrl = await compressImageToDataUrl(file);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      let response;
      try {
        response = await fetch(`${API_BASE}/api/identify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (sequence !== scanSequence) return;
      if (!response.ok) throw new Error('identify_failed');
      const payload = await response.json();
      if (sequence !== scanSequence) return;
      const viewModels = buildCandidateViewModels(payload.candidates, ingredients);
      if (!viewModels.length) {
        if (candidateLabel) candidateLabel.textContent = '辨識候選';
        candidateList.innerHTML = '<p class="empty-note">認不出來，請手動選擇。</p>';
        return;
      }
      if (candidateLabel) candidateLabel.textContent = '辨識候選（信心度）';
      renderCandidateButtons(viewModels);
    } catch (error) {
      if (sequence !== scanSequence) return;
      renderDeterministicFallback(file.name, '模擬候選');
    }
  }

  async function askCookAssist(question) {
    const liveStatus = document.querySelector('#liveStatus');
    if (!state.activeRecipe) {
      liveStatus.textContent = '請先開始陪煮再發問。';
      return;
    }
    liveStatus.textContent = `你問：${question}（思考中…）`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      let response;
      try {
        response = await fetch(`${API_BASE}/api/cook-assist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipeTitle: state.activeRecipe.title,
            stepIndex: state.cookingStep,
            stepText: state.activeRecipe.steps[state.cookingStep],
            question,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!response.ok) throw new Error('cook_assist_failed');
      const payload = await response.json();
      const answer = payload.answer || '目前沒有回覆，請再試一次。';
      liveStatus.textContent = answer;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(answer);
        utterance.lang = 'zh-TW';
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      liveStatus.textContent = '網路不太穩，請再問一次。';
    }
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

  document.querySelector('[data-close-cooking]').addEventListener('click', () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    cookingDialog.close();
  });

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

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let isListening = false;
  let discardVoiceResult = false;

  function supportsVoiceAssist() {
    return Boolean(SpeechRecognitionCtor) && Boolean(API_BASE);
  }

  function stopListening(button, options = {}) {
    isListening = false;
    if (options.userCancelled) discardVoiceResult = true;
    if (recognizer) {
      try {
        // abort() drops audio already captured; stop() would still fire
        // onresult and send a request the user just cancelled.
        if (options.userCancelled && typeof recognizer.abort === 'function') recognizer.abort();
        else recognizer.stop();
      } catch (error) {
        // no-op: recognizer may already be stopped
      }
    }
    button.setAttribute('aria-pressed', 'false');
    button.querySelector('span').textContent = '按住說話';
  }

  function startListening(button) {
    recognizer = new SpeechRecognitionCtor();
    recognizer.lang = 'zh-TW';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    isListening = true;
    discardVoiceResult = false;
    button.setAttribute('aria-pressed', 'true');
    button.querySelector('span').textContent = '正在聽…';
    document.querySelector('#liveStatus').textContent = '請說出你的問題…';

    recognizer.onresult = (event) => {
      if (discardVoiceResult) return;
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      document.querySelector('#liveStatus').textContent = `你問：${transcript}`;
      stopListening(button);
      if (transcript.trim()) askCookAssist(transcript.trim());
    };

    recognizer.onerror = (event) => {
      stopListening(button);
      if (event.error === 'aborted') {
        document.querySelector('#liveStatus').textContent = '已停止聆聽。';
        return;
      }
      document.querySelector('#liveStatus').textContent = event.error === 'not-allowed' || event.error === 'permission-denied'
        ? '沒有取得麥克風權限，請確認瀏覽器設定。'
        : '語音辨識失敗，請再試一次。';
    };

    recognizer.onend = () => {
      if (isListening) stopListening(button);
    };

    try {
      recognizer.start();
    } catch (error) {
      stopListening(button);
      document.querySelector('#liveStatus').textContent = '無法啟動語音辨識，請再試一次。';
    }
  }

  document.querySelector('#voiceButton').addEventListener('click', (event) => {
    const button = event.currentTarget;

    if (supportsVoiceAssist()) {
      if (isListening) {
        stopListening(button, { userCancelled: true });
        document.querySelector('#liveStatus').textContent = '已停止聆聽。';
      } else {
        startListening(button);
      }
      return;
    }

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

  updateScanCopy();
  renderIngredients();
  renderRecommendations();
  renderStores();
  })();
}
