# LendingOS

Lending portfolio management web app.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env — add your Supabase URL and anon key

# 3. Run locally
npm run dev

# 4. Build for production
npm run build
```

## Environment variables

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_KEY` | Your Supabase anon/public key |

Set these in:
- **Local:** `.env` file (gitignored)
- **Hostinger:** hPanel → Git → Environment variables

## Pages

| File | URL |
|---|---|
| `index.html` | `/` — Main app |
| `landing.html` | `/landing.html` — Company registration |
| `verify.html` | `/verify.html` — Email verification |
| `admin.html` | `/admin.html` — Admin approval panel |

## Hostinger deployment

1. Push repo to GitHub
2. Hostinger hPanel → Git → Connect repo
3. Framework: **Vite**
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Add environment variables
7. Deploy
