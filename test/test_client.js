/**
 * Node.js Client Example for NVIDIA NIM Proxy (Stream + Reasoning)
 */
const BASE_URL = process.env.PROXY_URL || 'http://localhost:3000/v1';
const API_KEY = process.env.NVIDIA_API_KEY || 'nvapi-your-key-here';

async function main() {
  console.log(`Connecting to ${BASE_URL}...`);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      messages: [{ role: 'user', content: 'Write a limerick about the wonders of GPU computing.' }],
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      chat_template_kwargs: { enable_thinking: true },
      reasoning_budget: 16384,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Request failed with status ${response.status}:`, err);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let printedReasoningHeader = false;
  let printedContentHeader = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep trailing incomplete chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.substring(6);
      if (dataStr === '[DONE]') continue;

      try {
        const json = JSON.parse(dataStr);
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.reasoning_content) {
          if (!printedReasoningHeader) {
            console.log('=== THINKING / REASONING ===');
            printedReasoningHeader = true;
          }
          process.stdout.write(delta.reasoning_content);
        }

        if (delta.content) {
          if (!printedContentHeader) {
            console.log('\n\n=== FINAL RESPONSE ===');
            printedContentHeader = true;
          }
          process.stdout.write(delta.content);
        }
      } catch (err) {
        // Skip malformed SSE lines
      }
    }
  }

  console.log('\n\n=== FINISHED ===');
}

main().catch(console.error);
