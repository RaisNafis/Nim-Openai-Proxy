# NIM OpenAI Proxy 🚀

Proxy server ringan berbasis **Node.js + Express** yang meneruskan request **OpenAI API-compatible** ke **NVIDIA NIM** (`https://integrate.api.nvidia.com/v1`). Satu file, tanpa konfigurasi rumit — langsung jalan.

## ✨ Fitur

- ⚡ **Streaming SSE penuh** — chunk diteruskan real-time tanpa buffering, dengan header `text/event-stream` yang benar.
- 🧠 **Reasoning tokens** — mendukung `reasoning_content` pada delta stream untuk model penalaran seperti `deepseek-r1`, `nemotron`, dll.
- 🔌 **Kompatibel OpenAI SDK** — bekerja dengan OpenAI SDK resmi (Python/Node/Go), Open WebUI, LobeChat, Chatbox, Cline, dan aplikasi lain.
- 🔑 **API key fleksibel** — ambil dari header `Authorization: Bearer nvapi-...` milik client, atau fallback otomatis ke `NVIDIA_API_KEY` di `.env`.
- 📦 **Dukungan `extra_body`** — field `extra_body` (gaya Python SDK) digabungkan otomatis ke root payload.
- 🌐 **CORS siap pakai** — bisa dipanggil langsung dari frontend web.
- 🛣️ **Alias endpoint** — dengan atau tanpa prefix `/v1` sama-sama didukung.

---

## 📁 Struktur Proyek

```
nvidia_nim_proxy/
├── server.js            # Seluruh logika proxy (Express)
├── test/
│   ├── test_proxy.js    # Test suite otomatis (mock upstream)
│   ├── test_client.py   # Client uji via Python OpenAI SDK
│   └── test_client.js   # Client uji via Node.js OpenAI SDK
├── .env.example         # Template environment
├── start.bat            # Launcher cepat (Windows)
├── test_curl.bat        # Tes cepat via cURL (Windows)
└── package.json
```

---

## 🚀 Memulai

### 1. Instalasi

```bash
npm install
```

### 2. Konfigurasi `.env`

Salin template lalu isi API key Anda:

```bash
cp .env.example .env
```

```env
PORT=3000
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_API_KEY=nvapi-your-key-here
```

> Dapatkan API key gratis di [build.nvidia.com](https://build.nvidia.com/).
>
> **Catatan**: Jika `NVIDIA_API_KEY` sudah diisi di `.env`, client tidak wajib mengirim header `Authorization` (otomatis di-fallback).

### 3. Jalankan Server

```bash
npm start        # mode normal
npm run dev      # auto-reload saat development
```

Atau di Windows, klik dua kali `start.bat`.

Server aktif di `http://localhost:3000`.

---

## 🔌 Endpoints

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/` atau `/health` | Health check |
| `GET` | `/models` / `/v1/models` | Daftar model dari NVIDIA NIM |
| `POST` | `/chat/completions` / `/v1/chat/completions` | Chat completions (streaming & non-streaming) |

Semua endpoint juga merespons tanpa prefix `/v1`.

---

## 💻 Contoh Penggunaan

### cURL (Streaming)

```bash
curl -N http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NVIDIA_API_KEY" \
  -d '{
    "model": "deepseek-ai/deepseek-r1",
    "messages": [{"role": "user", "content": "Halo apa kabar?"}],
    "stream": true
  }'
```

### Python (OpenAI SDK) dengan Reasoning

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key=os.environ.get("NVIDIA_API_KEY", "nvapi-your-key-here")
)

completion = client.chat.completions.create(
    model="deepseek-ai/deepseek-r1",
    messages=[{"role": "user", "content": "Write a limerick about GPU computing."}],
    extra_body={"chat_template_kwargs": {"enable_thinking": True}},
    stream=True,
)

for chunk in completion:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    if getattr(delta, "reasoning_content", None):
        print(delta.reasoning_content, end="", flush=True)
    if delta.content:
        print(delta.content, end="", flush=True)
```

### Node.js (OpenAI SDK)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: process.env.NVIDIA_API_KEY || 'nvapi-your-key-here',
});

const stream = await client.chat.completions.create({
  model: 'deepseek-ai/deepseek-r1',
  messages: [{ role: 'user', content: 'Explain quantum computing briefly.' }],
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  if (delta?.reasoning_content) process.stdout.write(delta.reasoning_content);
  if (delta?.content) process.stdout.write(delta.content);
}
```

---

## 🌐 Integrasi Aplikasi Pihak Ketiga

Untuk Open WebUI, LobeChat, Chatbox, dll:

| Parameter | Nilai |
|---|---|
| **API Base URL** | `http://localhost:3000/v1` (atau `http://<IP_SERVER>:3000/v1`) |
| **API Key** | `nvapi-...` (atau sembarang string jika key sudah diset di `.env`) |

---

## 🤖 Model

Gunakan ID model resmi dari [katalog NVIDIA NIM](https://build.nvidia.com/). Contoh populer:

| Model ID | Tipe |
|---|---|
| `deepseek-ai/deepseek-r1` | Reasoning / Thinking |
| `deepseek-ai/deepseek-v3` | General / Chat |
| `meta/llama-3.3-70b-instruct` | General / Chat |
| `nvidia/llama-3.1-nemotron-70b-instruct` | General / Chat |
| `qwen/qwen2.5-coder-32b-instruct` | Coding |

---

## 🧪 Testing

Test suite otomatis menjalankan mock upstream NVIDIA NIM lalu memverifikasi health check, daftar model, respons non-streaming, serta streaming SSE lengkap dengan reasoning tokens:

```bash
npm test
```

Client uji tambahan:

```bash
node test/test_client.js     # Node.js OpenAI SDK
python test/test_client.py   # Python OpenAI SDK
```

---

## 📄 Lisensi

MIT
