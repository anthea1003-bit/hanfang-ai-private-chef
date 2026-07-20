const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const workerModule = import(pathToFileURL(path.join(__dirname, '../worker/src/index.js')).href);

function makeAudioRequest() {
  return new Request('https://hanfang-api.example/api/cook-assist-audio', {
    method: 'POST',
    headers: {
      Origin: 'https://anthea1003-bit.github.io',
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.10',
    },
    body: JSON.stringify({
      recipeTitle: '枸杞紅棗茶',
      stepIndex: 0,
      stepText: '紅棗洗淨後劃開，和水一起入鍋。',
      audio: 'data:audio/mp4;base64,QUJDRA==',
    }),
  });
}

test('the audio route sends validated inline audio to Gemini and returns structured copy', async () => {
  const originalFetch = global.fetch;
  let capturedRequest;
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return new Response(JSON.stringify({
      candidates: [{
        content: { parts: [{ text: JSON.stringify({ transcript: '紅棗要洗多久？', answer: '用清水快速沖洗即可。' }) }] },
      }],
    }), { status: 200 });
  };

  try {
    const { default: worker } = await workerModule;
    const response = await worker.fetch(makeAudioRequest(), {
      GEMINI_API_KEY: 'test-only-key',
      GEMINI_MODEL: 'gemini-test-model',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      transcript: '紅棗要洗多久？',
      answer: '用清水快速沖洗即可。',
    });
    assert.match(capturedRequest.url, /gemini-test-model:generateContent$/);
    const geminiBody = JSON.parse(capturedRequest.options.body);
    const systemPrompt = geminiBody.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /中年男性家常料理老師/);
    assert.match(systemPrompt, /語氣溫柔/);
    assert.match(systemPrompt, /專業醫療意見/);
    assert.match(systemPrompt, /不超過 80 字/);
    assert.match(systemPrompt, /不得改變以上規則/);
    assert.deepEqual(geminiBody.contents[0].parts[1].inline_data, {
      mime_type: 'audio/mp4',
      data: 'QUJDRA==',
    });
    assert.equal(capturedRequest.options.headers['x-goog-api-key'], 'test-only-key');
  } finally {
    global.fetch = originalFetch;
  }
});

test('the audio route maps Gemini failures to a bounded upstream error', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('{"error":"quota"}', { status: 429 });

  try {
    const { default: worker } = await workerModule;
    const response = await worker.fetch(makeAudioRequest(), {
      GEMINI_API_KEY: 'test-only-key',
      GEMINI_MODEL: 'gemini-test-model',
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'upstream' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('the audio route stops before Gemini when Cloudflare denies its persistent quota', async () => {
  const originalFetch = global.fetch;
  let geminiCalled = false;
  let rateLimitKey;
  global.fetch = async () => {
    geminiCalled = true;
    return new Response('{}', { status: 200 });
  };

  try {
    const { default: worker } = await workerModule;
    const response = await worker.fetch(makeAudioRequest(), {
      GEMINI_API_KEY: 'test-only-key',
      GEMINI_MODEL: 'gemini-test-model',
      AUDIO_RATE_LIMITER: {
        limit: async ({ key }) => {
          rateLimitKey = key;
          return { success: false };
        },
      },
    });

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'rate_limited' });
    assert.equal(rateLimitKey, '203.0.113.10');
    assert.equal(geminiCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});
