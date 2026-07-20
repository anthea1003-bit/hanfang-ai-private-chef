const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
} = require('../app.js');

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

test('Safari-compatible MP4 audio is preferred when MediaRecorder supports it', () => {
  const supported = new Set(['audio/mp4', 'audio/webm']);
  const MediaRecorderCtor = {
    isTypeSupported: (mimeType) => supported.has(mimeType),
  };

  assert.equal(selectSupportedAudioMimeType(MediaRecorderCtor), 'audio/mp4');
});

test('audio recording can fall back to the browser default mime type', () => {
  assert.equal(selectSupportedAudioMimeType(null), '');
  assert.equal(selectSupportedAudioMimeType({}), '');
});

test('the audio assist payload contains only bounded cooking context and audio', () => {
  const result = buildAudioAssistPayload({
    recipeTitle: '陳皮生薑茶'.repeat(20),
    stepIndex: 2,
    stepText: '薑切薄片。'.repeat(100),
    audio: 'data:audio/mp4;base64,QUJDRA==',
  });

  assert.equal(result.recipeTitle.length, 50);
  assert.equal(result.stepIndex, 2);
  assert.equal(result.stepText.length, 300);
  assert.equal(result.audio, 'data:audio/mp4;base64,QUJDRA==');
});

test('voice errors expose actionable Safari and microphone guidance', () => {
  assert.match(getVoiceErrorMessage('NotAllowedError'), /麥克風權限/);
  assert.match(getVoiceErrorMessage('NotFoundError'), /找不到可用的麥克風/);
  assert.match(getVoiceErrorMessage('network'), /網路/);
  assert.match(getVoiceErrorMessage('unknown'), /語音錄製失敗/);
});

test('audio assist HTTP errors explain the actionable cause', () => {
  assert.match(getAudioAssistHttpErrorMessage(400), /錄音格式/);
  assert.match(getAudioAssistHttpErrorMessage(429), /一分鐘/);
  assert.match(getAudioAssistHttpErrorMessage(502), /AI/);
  assert.match(getAudioAssistHttpErrorMessage(503), /暫時無法使用/);
});

test('voice button actions preserve explicit consent after the 15-second timeout', () => {
  assert.equal(getVoiceButtonAction({}), 'start');
  assert.equal(getVoiceButtonAction({ recorderState: 'recording' }), 'stop-and-submit');
  assert.equal(getVoiceButtonAction({ hasPendingAudio: true }), 'submit-pending');
  assert.equal(getVoiceButtonAction({ hasPendingAudio: true, requestInFlight: true }), 'ignore');
});

test('stale or closed voice sessions cannot continue after permission resolves', () => {
  assert.equal(isVoiceSessionCurrent(4, 4, true), true);
  assert.equal(isVoiceSessionCurrent(5, 4, true), false);
  assert.equal(isVoiceSessionCurrent(4, 4, false), false);
});

test('a delayed old recorder callback cannot mutate a newer recording session', () => {
  const oldRecorder = {};
  const newRecorder = {};
  assert.equal(isActiveVoiceRecorder({
    activeSession: 8,
    callbackSession: 7,
    dialogOpen: true,
    currentRecorder: newRecorder,
    callbackRecorder: oldRecorder,
  }), false);
  assert.equal(isActiveVoiceRecorder({
    activeSession: 8,
    callbackSession: 8,
    dialogOpen: true,
    currentRecorder: newRecorder,
    callbackRecorder: oldRecorder,
  }), false);
  assert.equal(isActiveVoiceRecorder({
    activeSession: 8,
    callbackSession: 8,
    dialogOpen: true,
    currentRecorder: newRecorder,
    callbackRecorder: newRecorder,
  }), true);
});

test('the cook voice prefers a Taiwanese Mandarin middle-aged male option', () => {
  const voices = [
    { name: 'Grandpa（中文（台灣））', lang: 'zh-TW' },
    { name: 'Rocko（中文（台灣））', lang: 'zh-TW' },
    { name: 'Eddy（中文（台灣））', lang: 'zh-TW' },
    { name: 'Reed', lang: 'en-US' },
    { name: 'Meijia', lang: 'zh-TW' },
    { name: 'Reed（中文（台灣））', lang: 'zh-TW' },
  ];

  assert.equal(selectPreferredCookVoice(voices), voices[5]);
  assert.equal(selectPreferredCookVoice(voices.slice(0, 5)), voices[2]);
  assert.equal(selectPreferredCookVoice(voices.slice(0, 2)), voices[1]);
  assert.equal(selectPreferredCookVoice(voices.slice(0, 1)), voices[0]);
  assert.equal(selectPreferredCookVoice([{ name: '美佳', lang: 'zh_TW' }]), null);
  assert.equal(selectPreferredCookVoice([]), null);
});

test('the gentle male cook voice profile is calm and slightly lower pitched', () => {
  const preferredVoice = { name: 'Eddy', lang: 'zh-TW' };
  const utterance = {};

  assert.equal(applyCookVoiceProfile(utterance, [preferredVoice]), utterance);
  assert.equal(utterance.lang, 'zh-TW');
  assert.equal(utterance.voice, preferredVoice);
  assert.equal(utterance.rate, 0.92);
  assert.equal(utterance.pitch, 0.9);
});

test('the gentle male cook voice profile remains usable before Safari loads voices', () => {
  const utterance = {};

  assert.equal(applyCookVoiceProfile(utterance, []), utterance);
  assert.equal(utterance.lang, 'zh-TW');
  assert.equal(utterance.rate, 0.92);
  assert.equal(utterance.pitch, 0.9);
  assert.equal('voice' in utterance, false);
});

test('Safari waits for voiceschanged instead of falling back to its default female voice', async () => {
  const preferredVoice = { name: 'Reed（中文（台灣））', lang: 'zh-TW' };
  const synthesis = {
    voices: [],
    listener: null,
    getVoices() {
      return this.voices;
    },
    addEventListener(eventName, listener) {
      assert.equal(eventName, 'voiceschanged');
      this.listener = listener;
    },
    removeEventListener(eventName, listener) {
      assert.equal(eventName, 'voiceschanged');
      if (this.listener === listener) this.listener = null;
    },
  };

  const pendingVoice = waitForPreferredCookVoice(synthesis, 100);
  synthesis.voices = [{ name: '美佳', lang: 'zh-TW' }, preferredVoice];
  synthesis.listener();

  assert.equal(await pendingVoice, preferredVoice);
  assert.equal(synthesis.listener, null);
});

test('Safari never substitutes a Taiwanese female voice when no preferred male voice loads', async () => {
  const synthesis = {
    getVoices: () => [{ name: '美佳', lang: 'zh-TW' }],
    addEventListener() {},
    removeEventListener() {},
  };

  assert.equal(await waitForPreferredCookVoice(synthesis, 0), null);
});

test('Safari cleans up the voiceschanged listener after a positive timeout', async () => {
  const synthesis = {
    listener: null,
    getVoices: () => [{ name: '美佳', lang: 'zh-TW' }],
    addEventListener(eventName, listener) {
      this.listener = listener;
    },
    removeEventListener(eventName, listener) {
      if (this.listener === listener) this.listener = null;
    },
  };

  assert.equal(await waitForPreferredCookVoice(synthesis, 5), null);
  assert.equal(synthesis.listener, null);
});

test('closing the cooking dialog while Safari waits prevents delayed speech', async () => {
  const preferredVoice = { name: 'Reed（中文（台灣））', lang: 'zh-TW' };
  let dialogOpen = true;
  let spokenUtterance = null;
  const synthesis = {
    voices: [],
    listener: null,
    getVoices() {
      return this.voices;
    },
    cancel() {},
    speak(utterance) {
      spokenUtterance = utterance;
    },
    addEventListener(eventName, listener) {
      this.listener = listener;
    },
    removeEventListener(eventName, listener) {
      if (this.listener === listener) this.listener = null;
    },
  };

  const pendingSpeech = speakWithPreferredCookVoice({
    speechSynthesis: synthesis,
    createUtterance: (text) => ({ text }),
    answer: '慢慢來，先轉小火。',
    timeoutMs: 100,
    isCurrent: () => dialogOpen,
  });
  dialogOpen = false;
  synthesis.voices = [preferredVoice];
  synthesis.listener();

  assert.equal(await pendingSpeech, false);
  assert.equal(spokenUtterance, null);
});

test('aborting a pending male voice request removes its listener', async () => {
  const controller = new AbortController();
  const synthesis = {
    listener: null,
    getVoices: () => [],
    addEventListener(eventName, listener) {
      this.listener = listener;
    },
    removeEventListener(eventName, listener) {
      if (this.listener === listener) this.listener = null;
    },
  };

  const pendingVoice = waitForPreferredCookVoice(synthesis, 100, controller.signal);
  controller.abort();

  assert.equal(synthesis.listener, null);
  assert.equal(await pendingVoice, null);
});

test('the deployed app script is cache-busted so Safari receives voice fixes immediately', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  assert.match(html, /<script src="app\.js\?v=[^"]+"><\/script>/);
});
