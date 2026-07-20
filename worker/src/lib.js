(function exposeHanfangWorkerLib(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HanfangWorkerLib = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHanfangWorkerLib() {
  const ALLOWED_STATIC_ORIGIN = 'https://anthea1003-bit.github.io';
  const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/mp4',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
  ]);

  function isAllowedOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    return origin === ALLOWED_STATIC_ORIGIN || LOCAL_ORIGIN_PATTERN.test(origin);
  }

  function parseCandidates(rawText, validIngredients) {
    const nameById = new Map((validIngredients || []).map((item) => [item.id, item.name]));

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      return { candidates: [] };
    }

    if (!parsed || !Array.isArray(parsed.candidates)) {
      return { candidates: [] };
    }

    const seen = new Set();
    const candidates = [];
    for (const item of parsed.candidates) {
      if (!item || typeof item.id !== 'string' || !nameById.has(item.id)) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);

      const confidenceNumber = Number(item.confidence);
      const confidence = Number.isFinite(confidenceNumber) ? Math.max(0, Math.min(1, confidenceNumber)) : 0;

      candidates.push({ id: item.id, name: nameById.get(item.id), confidence });
      if (candidates.length >= 3) break;
    }

    return { candidates };
  }

  function checkRateLimit(store, ip, now, limit = 20, windowMs = 60000) {
    if (!(limit > 0)) {
      return { allowed: false, remaining: 0 };
    }

    // Simple sweep so the Map does not grow unbounded with one entry per IP.
    if (store.size > 1000) {
      for (const [staleKey, entry] of store) {
        if (now - entry.windowStart >= windowMs) store.delete(staleKey);
      }
    }

    const key = ip || 'unknown';
    const existing = store.get(key);

    if (!existing || now - existing.windowStart >= windowMs) {
      store.delete(key);
      store.set(key, { windowStart: now, count: 1 });
      return { allowed: true, remaining: limit - 1 };
    }

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    existing.count += 1;
    store.set(key, existing);
    return { allowed: true, remaining: limit - existing.count };
  }

  function parseAudioDataUrl(audio, maxBase64Length = 2000000) {
    if (typeof audio !== 'string') return { ok: false, error: 'bad_request' };
    const match = audio.match(/^data:(audio\/[a-zA-Z0-9.+-]+)(?:;\s*codecs\s*=\s*[^;]+)?;base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return { ok: false, error: 'bad_request' };

    const [, rawMimeType, base64Data] = match;
    const mimeType = rawMimeType.toLowerCase();
    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
      return { ok: false, error: 'unsupported_media_type' };
    }
    if (base64Data.length > maxBase64Length) {
      return { ok: false, error: 'payload_too_large' };
    }
    if (!base64Data || base64Data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
      return { ok: false, error: 'bad_request' };
    }
    return { ok: true, mimeType, base64Data };
  }

  function parseAudioAssistResult(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      return { transcript: '', answer: '沒有聽清楚，請再說一次。' };
    }

    const transcript = (typeof parsed?.transcript === 'string' ? parsed.transcript.trim() : '').slice(0, 200);
    const answer = (typeof parsed?.answer === 'string' ? parsed.answer.trim() : '').slice(0, 300);
    if (!transcript || !answer) return { transcript: '', answer: '沒有聽清楚，請再說一次。' };
    return { transcript, answer };
  }

  return {
    isAllowedOrigin,
    parseCandidates,
    checkRateLimit,
    parseAudioDataUrl,
    parseAudioAssistResult,
  };
});
