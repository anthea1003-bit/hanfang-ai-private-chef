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

  function selectSupportedAudioMimeType(MediaRecorderCtor) {
    if (!MediaRecorderCtor || typeof MediaRecorderCtor.isTypeSupported !== 'function') return '';
    const preferredTypes = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];
    return preferredTypes.find((mimeType) => MediaRecorderCtor.isTypeSupported(mimeType)) || '';
  }

  function buildAudioAssistPayload({ recipeTitle, stepIndex, stepText, audio }) {
    const parsedStepIndex = Number(stepIndex);
    return {
      recipeTitle: (typeof recipeTitle === 'string' ? recipeTitle : '未知').slice(0, 50),
      stepIndex: Number.isFinite(parsedStepIndex) ? parsedStepIndex : 0,
      stepText: (typeof stepText === 'string' ? stepText : '未知').slice(0, 300),
      audio: typeof audio === 'string' ? audio : '',
    };
  }

  function getVoiceErrorMessage(errorName) {
    const normalized = String(errorName || '').toLowerCase();
    if (normalized === 'notallowederror' || normalized === 'securityerror' || normalized === 'not-allowed') {
      return '沒有取得麥克風權限，請在瀏覽器網站設定中允許麥克風。';
    }
    if (normalized === 'notfounderror' || normalized === 'devicesnotfounderror') {
      return '找不到可用的麥克風，請確認聲音輸入裝置。';
    }
    if (normalized === 'notreadableerror' || normalized === 'trackstarterror') {
      return '麥克風正被其他程式使用，請關閉其他錄音程式後再試。';
    }
    if (normalized === 'network' || normalized === 'aborterror') {
      return '語音服務連線失敗，請確認網路後再試。';
    }
    return '語音錄製失敗，請再試一次。';
  }

  function getAudioAssistHttpErrorMessage(status) {
    if (status === 400 || status === 415) return '瀏覽器錄音格式無法辨識，請重新整理後再試。';
    if (status === 429) return '語音使用太頻繁，請等一分鐘後再試。';
    if (status === 502) return 'AI 語音服務目前忙碌，請稍後再試。';
    return '語音回答暫時無法使用，請再試一次。';
  }

  function getVoiceButtonAction({ recorderState, hasPendingAudio, requestInFlight }) {
    if (requestInFlight) return 'ignore';
    if (recorderState === 'recording') return 'stop-and-submit';
    if (hasPendingAudio) return 'submit-pending';
    return 'start';
  }

  function isVoiceSessionCurrent(activeSession, callbackSession, dialogOpen) {
    return Boolean(dialogOpen) && activeSession === callbackSession;
  }

  function isActiveVoiceRecorder({ activeSession, callbackSession, dialogOpen, currentRecorder, callbackRecorder }) {
    return isVoiceSessionCurrent(activeSession, callbackSession, dialogOpen)
      && Boolean(callbackRecorder)
      && currentRecorder === callbackRecorder;
  }

  function selectPreferredCookVoice(voices) {
    const taiwaneseVoices = (Array.isArray(voices) ? voices : []).filter((voice) => (
      String(voice?.lang || '').replace('_', '-').toLowerCase() === 'zh-tw'
    ));
    const preferredNames = ['Reed', 'Eddy', 'Rocko', 'Grandpa'];
    for (const preferredName of preferredNames) {
      const match = taiwaneseVoices.find((voice) => String(voice?.name || '').toLowerCase().includes(preferredName.toLowerCase()));
      if (match) return match;
    }
    return null;
  }

  function applyCookVoiceProfile(utterance, voices) {
    if (!utterance || typeof utterance !== 'object') return utterance;
    utterance.lang = 'zh-TW';
    utterance.rate = 0.92;
    utterance.pitch = 0.9;
    const preferredVoice = selectPreferredCookVoice(voices);
    if (preferredVoice) utterance.voice = preferredVoice;
    return utterance;
  }

  function waitForPreferredCookVoice(speechSynthesis, timeoutMs = 2000, signal) {
    if (!speechSynthesis || typeof speechSynthesis.getVoices !== 'function') {
      return Promise.resolve(null);
    }
    if (signal?.aborted) return Promise.resolve(null);

    const getPreferredVoice = () => {
      try {
        return selectPreferredCookVoice(speechSynthesis.getVoices());
      } catch (error) {
        return null;
      }
    };
    const immediateVoice = getPreferredVoice();
    if (immediateVoice || timeoutMs <= 0 || typeof speechSynthesis.addEventListener !== 'function') {
      return Promise.resolve(immediateVoice);
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId;
      const finish = (voice) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
        signal?.removeEventListener?.('abort', handleAbort);
        resolve(voice || null);
      };
      const handleVoicesChanged = () => {
        const voice = getPreferredVoice();
        if (voice) finish(voice);
      };
      const handleAbort = () => finish(null);

      timeoutId = setTimeout(() => finish(getPreferredVoice()), timeoutMs);
      speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      signal?.addEventListener?.('abort', handleAbort, { once: true });
      if (signal?.aborted) handleAbort();
    });
  }

  async function speakWithPreferredCookVoice({
    speechSynthesis,
    createUtterance,
    answer,
    timeoutMs = 2000,
    signal,
    isCurrent = () => true,
  }) {
    if (
      !speechSynthesis
      || typeof speechSynthesis.speak !== 'function'
      || typeof createUtterance !== 'function'
    ) return false;

    speechSynthesis.cancel?.();
    const preferredVoice = await waitForPreferredCookVoice(speechSynthesis, timeoutMs, signal);
    if (!preferredVoice || signal?.aborted || !isCurrent()) return false;

    const utterance = applyCookVoiceProfile(createUtterance(answer), [preferredVoice]);
    speechSynthesis.speak(utterance);
    return true;
  }

  return {
    computeScaledDimensions,
    buildCandidateViewModels,
    selectSupportedAudioMimeType,
    buildAudioAssistPayload,
    getVoiceErrorMessage,
    getAudioAssistHttpErrorMessage,
    getVoiceButtonAction,
    isVoiceSessionCurrent,
    isActiveVoiceRecorder,
    selectPreferredCookVoice,
    applyCookVoiceProfile,
    waitForPreferredCookVoice,
    speakWithPreferredCookVoice,
  };
});

const {
  computeScaledDimensions,
  buildCandidateViewModels,
  selectSupportedAudioMimeType,
  buildAudioAssistPayload,
  getVoiceErrorMessage,
  getAudioAssistHttpErrorMessage,
  getVoiceButtonAction,
  isVoiceSessionCurrent,
  isActiveVoiceRecorder,
  selectPreferredCookVoice,
  applyCookVoiceProfile,
  waitForPreferredCookVoice,
  speakWithPreferredCookVoice,
} =
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
  let cookSpeechController = null;

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
  const voiceButton = document.querySelector('#voiceButton');
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
      const spoken = await speakCookAssistAnswer(answer);
      if (!spoken && cookingDialog.open) {
        liveStatus.textContent += '\n（Safari 尚未載入台灣男聲，已停止女聲替代；請再問一次。）';
      }
    } catch (error) {
      liveStatus.textContent = '網路不太穩，請再問一次。';
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('audio_read_failed'));
      reader.readAsDataURL(blob);
    });
  }

  function cancelCookAssistSpeech() {
    cookSpeechController?.abort();
    cookSpeechController = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  async function speakCookAssistAnswer(answer, isCurrent = () => cookingDialog.open) {
    if (!('speechSynthesis' in window)) return false;
    cancelCookAssistSpeech();
    const controller = new AbortController();
    cookSpeechController = controller;
    try {
      return await speakWithPreferredCookVoice({
        speechSynthesis: window.speechSynthesis,
        createUtterance: (text) => new SpeechSynthesisUtterance(text),
        answer,
        signal: controller.signal,
        isCurrent,
      });
    } finally {
      if (cookSpeechController === controller) cookSpeechController = null;
    }
  }

  async function askCookAssistAudio(audio, sessionToken) {
    const liveStatus = document.querySelector('#liveStatus');
    if (!state.activeRecipe || !isCurrentVoiceSession(sessionToken)) {
      liveStatus.textContent = '請先開始陪煮再發問。';
      setVoiceButtonState('idle');
      return;
    }

    voiceRequestInFlight = true;
    setVoiceButtonState('processing');
    liveStatus.textContent = '正在辨識並整理你的問題…';
    const controller = new AbortController();
    voiceRequestController = controller;
    try {
      const timeoutId = setTimeout(() => controller.abort(), 35000);
      let response;
      try {
        response = await fetch(`${API_BASE}/api/cook-assist-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildAudioAssistPayload({
            recipeTitle: state.activeRecipe.title,
            stepIndex: state.cookingStep,
            stepText: state.activeRecipe.steps[state.cookingStep],
            audio,
          })),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!isCurrentVoiceSession(sessionToken)) return;
      if (!response.ok) {
        const responseError = new Error(`audio_assist_${response.status}`);
        responseError.status = response.status;
        throw responseError;
      }
      const payload = await response.json();
      if (!isCurrentVoiceSession(sessionToken)) return;
      const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : '';
      const answer = typeof payload.answer === 'string' && payload.answer.trim()
        ? payload.answer.trim()
        : '沒有聽清楚，請再說一次。';
      liveStatus.textContent = transcript ? `你問：${transcript}\n${answer}` : answer;
      if (transcript) {
        const spoken = await speakCookAssistAnswer(answer, () => isCurrentVoiceSession(sessionToken));
        if (!spoken && isCurrentVoiceSession(sessionToken)) {
          liveStatus.textContent += '\n（Safari 尚未載入台灣男聲，已停止女聲替代；請再問一次。）';
        }
      }
    } catch (error) {
      if (!isCurrentVoiceSession(sessionToken)) return;
      liveStatus.textContent = error?.name === 'AbortError'
        ? '語音回答逾時，請再試一次。'
        : getAudioAssistHttpErrorMessage(error?.status);
    } finally {
      if (voiceRequestController === controller) {
        voiceRequestController = null;
        voiceRequestInFlight = false;
        if (isCurrentVoiceSession(sessionToken)) setVoiceButtonState('idle');
      }
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
    cancelVoiceRecording();
    cancelCookAssistSpeech();
    cookingDialog.close();
  });

  cookingDialog.addEventListener('cancel', cancelVoiceRecording);
  cookingDialog.addEventListener('close', () => {
    cancelVoiceRecording();
    cancelCookAssistSpeech();
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

  const MAX_RECORDING_MS = 15000;
  const MAX_AUDIO_BYTES = 1500000;
  let mediaRecorder = null;
  let mediaStream = null;
  let pendingAudioBlob = null;
  let recordingTimer = null;
  let discardRecordedAudio = false;
  let submitRecordedAudio = false;
  let voiceRequestInFlight = false;
  let voiceRequestController = null;
  let voiceSession = 0;

  function setVoiceButtonState(phase) {
    const copy = {
      idle: ['點一下開始說話', '再點一下送出・錄音不保存'],
      requesting: ['正在開啟麥克風…', '請在瀏覽器選擇允許'],
      recording: ['送出問題', '錄音中・最長 15 秒'],
      stopping: ['正在停止錄音…', '錄音尚未傳送'],
      ready: ['送出問題', '已停止・點擊才會傳送'],
      processing: ['正在辨識…', '請稍候'],
    }[phase] || ['點一下開始說話', '再點一下送出・錄音不保存'];
    voiceButton.setAttribute('aria-pressed', String(phase === 'recording'));
    voiceButton.querySelector('span').textContent = copy[0];
    voiceButton.querySelector('small').textContent = copy[1];
    voiceButton.disabled = phase === 'requesting' || phase === 'stopping' || phase === 'processing';
  }

  function isCurrentVoiceSession(sessionToken) {
    return isVoiceSessionCurrent(voiceSession, sessionToken, cookingDialog.open);
  }

  function stopVoiceStream(stream) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function releaseVoiceStream(stream = mediaStream) {
    stopVoiceStream(stream);
    if (mediaStream === stream) mediaStream = null;
  }

  function cancelVoiceRecording() {
    voiceSession += 1;
    discardRecordedAudio = true;
    submitRecordedAudio = false;
    pendingAudioBlob = null;
    voiceRequestController?.abort();
    voiceRequestController = null;
    voiceRequestInFlight = false;
    clearTimeout(recordingTimer);
    recordingTimer = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (error) {
        // no-op: recorder may already be stopping
      }
    }
    releaseVoiceStream();
    setVoiceButtonState('idle');
  }

  function stopVoiceRecording({ submit }) {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    discardRecordedAudio = false;
    submitRecordedAudio = Boolean(submit);
    clearTimeout(recordingTimer);
    recordingTimer = null;
    setVoiceButtonState(submit ? 'processing' : 'stopping');
    document.querySelector('#liveStatus').textContent = submit
      ? '正在準備語音…'
      : '已到 15 秒，正在停止錄音；尚未傳送。';
    mediaRecorder.stop();
  }

  async function submitPendingVoiceAudio(sessionToken) {
    const liveStatus = document.querySelector('#liveStatus');
    const audioBlob = pendingAudioBlob;
    pendingAudioBlob = null;
    if (!audioBlob || !isCurrentVoiceSession(sessionToken)) {
      setVoiceButtonState('idle');
      return;
    }
    setVoiceButtonState('processing');
    liveStatus.textContent = '正在準備語音…';
    try {
      const audio = await blobToDataUrl(audioBlob);
      if (isCurrentVoiceSession(sessionToken)) await askCookAssistAudio(audio, sessionToken);
    } catch (error) {
      if (!isCurrentVoiceSession(sessionToken)) return;
      liveStatus.textContent = '無法讀取錄音，請再試一次。';
      setVoiceButtonState('idle');
    }
  }

  async function startVoiceRecording() {
    const liveStatus = document.querySelector('#liveStatus');
    if (!API_BASE) {
      liveStatus.textContent = '語音服務尚未連接。';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') {
      liveStatus.textContent = '這個瀏覽器不支援錄音，請改用最新版 Safari 或 Chrome。';
      return;
    }

    const sessionToken = voiceSession + 1;
    voiceSession = sessionToken;
    pendingAudioBlob = null;
    setVoiceButtonState('requesting');
    liveStatus.textContent = '正在請求麥克風權限…';
    try {
      const requestedStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (!isCurrentVoiceSession(sessionToken)) {
        requestedStream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStream = requestedStream;
      const mimeType = selectSupportedAudioMimeType(window.MediaRecorder);
      mediaRecorder = mimeType
        ? new window.MediaRecorder(mediaStream, { mimeType })
        : new window.MediaRecorder(mediaStream);
      const activeRecorder = mediaRecorder;
      const recorderChunks = [];
      discardRecordedAudio = false;
      submitRecordedAudio = false;

      activeRecorder.ondataavailable = (event) => {
        if (isActiveVoiceRecorder({
          activeSession: voiceSession,
          callbackSession: sessionToken,
          dialogOpen: cookingDialog.open,
          currentRecorder: mediaRecorder,
          callbackRecorder: activeRecorder,
        }) && event.data?.size) recorderChunks.push(event.data);
      };
      activeRecorder.onerror = (event) => {
        if (!isActiveVoiceRecorder({
          activeSession: voiceSession,
          callbackSession: sessionToken,
          dialogOpen: cookingDialog.open,
          currentRecorder: mediaRecorder,
          callbackRecorder: activeRecorder,
        })) return;
        discardRecordedAudio = true;
        liveStatus.textContent = getVoiceErrorMessage(event?.error?.name || event?.name);
        releaseVoiceStream(requestedStream);
        setVoiceButtonState('idle');
      };
      activeRecorder.onstop = async () => {
        const ownsActiveRecorder = isActiveVoiceRecorder({
          activeSession: voiceSession,
          callbackSession: sessionToken,
          dialogOpen: cookingDialog.open,
          currentRecorder: mediaRecorder,
          callbackRecorder: activeRecorder,
        });
        if (!ownsActiveRecorder) {
          stopVoiceStream(requestedStream);
          return;
        }
        clearTimeout(recordingTimer);
        recordingTimer = null;
        const shouldDiscard = discardRecordedAudio;
        const chunks = recorderChunks.splice(0);
        mediaRecorder = null;
        releaseVoiceStream(requestedStream);
        if (shouldDiscard) return;

        const audioBlob = new Blob(chunks, { type: activeRecorder.mimeType || mimeType || 'audio/mp4' });
        if (!audioBlob.size) {
          liveStatus.textContent = '沒有收到錄音，請再試一次。';
          setVoiceButtonState('idle');
          return;
        }
        if (audioBlob.size > MAX_AUDIO_BYTES) {
          liveStatus.textContent = '錄音太長，請用 15 秒內說完問題。';
          setVoiceButtonState('idle');
          return;
        }

        pendingAudioBlob = audioBlob;
        if (submitRecordedAudio) {
          await submitPendingVoiceAudio(sessionToken);
        } else {
          setVoiceButtonState('ready');
          liveStatus.textContent = '錄音已停止且尚未傳送；點「送出問題」才會送出。';
        }
      };

      activeRecorder.start();
      setVoiceButtonState('recording');
      liveStatus.textContent = '正在錄音；說完後再點一次送出。';
      recordingTimer = setTimeout(() => stopVoiceRecording({ submit: false }), MAX_RECORDING_MS);
    } catch (error) {
      if (!isCurrentVoiceSession(sessionToken)) return;
      releaseVoiceStream();
      mediaRecorder = null;
      liveStatus.textContent = getVoiceErrorMessage(error?.name);
      setVoiceButtonState('idle');
    }
  }

  voiceButton.addEventListener('click', () => {
    const action = getVoiceButtonAction({
      recorderState: mediaRecorder?.state,
      hasPendingAudio: Boolean(pendingAudioBlob),
      requestInFlight: voiceRequestInFlight,
    });
    if (action === 'stop-and-submit') stopVoiceRecording({ submit: true });
    else if (action === 'submit-pending') submitPendingVoiceAudio(voiceSession);
    else if (action === 'start') startVoiceRecording();
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
    cancelVoiceRecording();
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  });

  updateScanCopy();
  renderIngredients();
  renderRecommendations();
  renderStores();
  })();
}
