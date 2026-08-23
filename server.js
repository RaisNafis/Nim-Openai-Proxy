import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;
const NVIDIA_BASE_URL = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Tangani format JSON yang rusak
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: { message: `Format JSON tidak valid: ${err.message}` } });
  }
  next(err);
});

// Helper: Ambil API Key dari header Authorization atau fallback ke .env
function getApiKey(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) {
    const key = auth.slice(7).trim();
    if (key && !key.toLowerCase().includes('key-here') && !key.toLowerCase().includes('tidak-perlu')) {
      return key;
    }
  }
  return NVIDIA_API_KEY;
}

// Health check
app.get(['/', '/health'], (req, res) => {
  res.json({ status: 'ok', proxy: 'NVIDIA NIM OpenAI Proxy' });
});

// Endpoint Models
app.get(['/models', '/v1/models'], async (req, res) => {
  const apiKey = getApiKey(req);
  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Chat Completions (Direct Passthrough)
app.post(['/chat/completions', '/v1/chat/completions'], async (req, res) => {
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: { message: 'NVIDIA API Key belum diisi di .env atau header Authorization.' } });
  }

  // Ambil payload murni dari client (apapun model dan parameternya)
  const payload = { ...req.body };

  // Jika client mengirim extra_body (seperti openai sdk python), gabungkan ke root
  if (payload.extra_body && typeof payload.extra_body === 'object') {
    const { extra_body, ...rest } = payload;
    Object.assign(payload, extra_body, rest);
  }

  const isStream = Boolean(payload.stream);
  console.log(`[Proxy] -> ${payload.model || 'default'} | stream: ${isStream}`);

  try {
    const upstreamRes = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstreamRes.ok) {
      const err = await upstreamRes.text();
      return res.status(upstreamRes.status).send(err);
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = upstreamRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      const data = await upstreamRes.json();
      res.json(data);
    }
  } catch (error) {
    console.error(`[Error] ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
});

app.listen(PORT, () => {
  console.log(`> NVIDIA NIM Proxy ready on http://localhost:${PORT}`);
});
