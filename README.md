# Snake Game UI

## Run locally

Use Node.js 20.19 or newer. Set the public API origin in `.env`:

```sh
cp .env.example .env
# Set VITE_API_BASE_URL to the score server origin.
npm install
npm run dev
```

Open the local URL printed by Vite. Restart the dev server after changing
`.env`.

`VITE_API_BASE_URL` is compiled into browser code, so it is public configuration.
Never put Supabase keys or other secrets in a `VITE_*` variable.

Build production assets with `npm run build`.
