# SERAI / SCANNER

Product reality check app. React + Vite frontend, Cloudflare Worker proxy for Anthropic API.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Environment

Create `.env.local` (not committed) with your Worker URL:

```
VITE_WORKER_URL=https://your-worker.your-subdomain.workers.dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import the GitHub repo
3. Framework preset: **Vite** (auto-detected)
4. Add environment variable: `VITE_WORKER_URL` = your Cloudflare Worker URL
5. Deploy

## Cloudflare Worker (API proxy)

The Worker holds the Anthropic API key. Code lives separately in `worker/index.js`.

## Stack

- Vite + React 18
- Cloudflare Worker (proxy for Anthropic API)
- Vercel (hosting)
