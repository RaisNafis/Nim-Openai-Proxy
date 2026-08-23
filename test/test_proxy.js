import http from 'http';
import { spawn } from 'child_process';
import assert from 'assert';

console.log('--- Starting Automated Proxy Tests ---');

// 1. Create a Mock Upstream Server to simulate NVIDIA NIM API
const mockPort = 3999;
const mockServer = http.createServer((req, res) => {
  if (req.url === '/v1/models' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [{ id: 'nvidia/nemotron-3.5-lightning-30b-a3b', object: 'model' }]
    }));
    return;
  }

  if (req.url === '/v1/chat/completions' && req.method === 'POST') {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      const body = JSON.parse(bodyStr);

      if (body.stream) {
        // SSE Stream response with reasoning and content
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const chunks = [
          {
            id: 'chatcmpl-1',
            object: 'chat.completion.chunk',
            choices: [{ delta: { role: 'assistant', reasoning_content: 'Thinking about GPUs...' }, index: 0, finish_reason: null }]
          },
          {
            id: 'chatcmpl-2',
            object: 'chat.completion.chunk',
            choices: [{ delta: { reasoning_content: ' In parallel cores they excel.' }, index: 0, finish_reason: null }]
          },
          {
            id: 'chatcmpl-3',
            object: 'chat.completion.chunk',
            choices: [{ delta: { content: 'Silicon shines in silicon light,\n' }, index: 0, finish_reason: null }]
          },
          {
            id: 'chatcmpl-4',
            object: 'chat.completion.chunk',
            choices: [{ delta: { content: 'Crunching numbers day and night!' }, index: 0, finish_reason: 'stop' }]
          },
        ];

        let index = 0;
        const interval = setInterval(() => {
          if (index < chunks.length) {
            res.write(`data: ${JSON.stringify(chunks[index])}\n\n`);
            index++;
          } else {
            res.write('data: [DONE]\n\n');
            res.end();
            clearInterval(interval);
          }
        }, 50);
      } else {
        // Non-stream response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-mock-nonstream',
          object: 'chat.completion',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'A non-streamed response from NVIDIA NIM proxy.',
              reasoning_content: 'Mock reasoning thought.'
            },
            finish_reason: 'stop'
          }]
        }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

await new Promise((resolve) => mockServer.listen(mockPort, resolve));
console.log(`✓ Mock NIM upstream running on port ${mockPort}`);

// 2. Start Proxy Server pointing to Mock Upstream
const proxyPort = 3005;
const proxyEnv = {
  ...process.env,
  PORT: String(proxyPort),
  HOST: '127.0.0.1',
  NVIDIA_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
  NVIDIA_API_KEY: 'test-nvapi-key',
  LOG_REQUESTS: 'true',
};

const proxyProcess = spawn('node', ['server.js'], {
  env: proxyEnv,
  stdio: 'pipe',
});

proxyProcess.stdout.on('data', d => console.log(`[Proxy Log]: ${d.toString().trim()}`));
proxyProcess.stderr.on('data', d => console.error(`[Proxy Err]: ${d.toString().trim()}`));

// Wait for proxy to start by polling health
let ready = false;
for (let i = 0; i < 20; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/health`);
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
if (!ready) {
  throw new Error('Proxy server failed to become ready in time');
}
console.log(`✓ Proxy process ready on port ${proxyPort}`);

try {
  // Test 1: Health endpoint
  console.log('\nTesting GET /health...');
  const healthRes = await fetch(`http://127.0.0.1:${proxyPort}/health`);
  assert.strictEqual(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.status, 'ok');
  console.log('✓ GET /health passed');

  // Test 2: Models endpoint
  console.log('\nTesting GET /v1/models...');
  const modelsRes = await fetch(`http://127.0.0.1:${proxyPort}/v1/models`, {
    headers: { 'Authorization': 'Bearer test-key' }
  });
  assert.strictEqual(modelsRes.status, 200);
  const modelsData = await modelsRes.json();
  assert(Array.isArray(modelsData.data));
  console.log('✓ GET /v1/models passed');

  // Test 3: Non-streaming Chat Completion
  console.log('\nTesting POST /v1/chat/completions (non-streaming)...');
  const chatNonStreamRes = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-key'
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: false
    })
  });
  assert.strictEqual(chatNonStreamRes.status, 200);
  const chatNonStreamData = await chatNonStreamRes.json();
  assert.strictEqual(chatNonStreamData.id, 'chatcmpl-mock-nonstream');
  assert.strictEqual(chatNonStreamData.choices[0].message.content, 'A non-streamed response from NVIDIA NIM proxy.');
  console.log('✓ POST /v1/chat/completions (non-stream) passed');

  // Test 4: Streaming Chat Completion with Reasoning Tokens
  console.log('\nTesting POST /v1/chat/completions (SSE streaming + reasoning)...');
  const chatStreamRes = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-key'
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      messages: [{ role: 'user', content: 'Write a limerick' }],
      extra_body: {
        chat_template_kwargs: { enable_thinking: true },
        reasoning_budget: 16384
      },
      stream: true
    })
  });

  assert.strictEqual(chatStreamRes.status, 200);
  assert.strictEqual(chatStreamRes.headers.get('content-type'), 'text/event-stream; charset=utf-8');

  let accumulatedReasoning = '';
  let accumulatedContent = '';

  const reader = chatStreamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep remainder

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const dataPart = trimmed.substring(6);
      if (dataPart === '[DONE]') continue;

      const parsed = JSON.parse(dataPart);
      const delta = parsed.choices[0].delta;
      if (delta.reasoning_content) {
        accumulatedReasoning += delta.reasoning_content;
      }
      if (delta.content) {
        accumulatedContent += delta.content;
      }
    }
  }

  assert.strictEqual(accumulatedReasoning, 'Thinking about GPUs... In parallel cores they excel.');
  assert.strictEqual(accumulatedContent, 'Silicon shines in silicon light,\nCrunching numbers day and night!');
  console.log('✓ Accumulated reasoning tokens:', accumulatedReasoning);
  console.log('✓ Accumulated response content:', accumulatedContent);
  console.log('✓ POST /v1/chat/completions (streaming + reasoning) passed');

  console.log('\n========================================');
  console.log(' ALL PROXY TESTS PASSED SUCCESSFULLY! ✓');
  console.log('========================================');
} finally {
  proxyProcess.kill();
  mockServer.close();
}
