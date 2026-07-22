# Rivarly

A social prediction market app built with React + Vite and Firebase: a social feed,
browsable prediction markets, a curated crypto news section, and user profiles.

> This codebase is chain-agnostic. Wallet, trading and AI integrations were removed;
> markets are browse-and-create only until a blockchain layer is added back.

## Features

- **Social feed** — posts with images, likes, reposts, replies
- **Markets** — browse, filter and create prediction markets (no on-chain trading yet)
- **News** — live public crypto headlines (Stellar/XLM featured) merged with admin-curated items
- **Profiles** — Firebase anonymous auth, follow/unfollow
- **Admin panel** — password-gated market and news management

## Setup

### 1. Firebase project

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com/)
2. **Authentication** → enable the *Anonymous* sign-in provider
3. **Firestore Database** → create a database, then paste [`firestore.rules`](firestore.rules) into its Rules tab
4. **Storage** → enable it, then paste [`storage.rules`](storage.rules) into its Rules tab
5. Copy the web app config from *Project Settings → General → Your apps*

### 2. Environment

Copy `.env.example` to `.env` and fill in the Firebase values:

```bash
cp .env.example .env
```

`VITE_ADMIN_PASSWORD` gates the admin panel. Every `VITE_*` variable is bundled into
the client build, so treat this as a soft gate rather than a real secret.

`VITE_CRYPTOPANIC_TOKEN` is optional. With a free token from
[cryptopanic.com](https://cryptopanic.com/developers/api/), the Hot News page pulls
live public headlines — including a dedicated Stellar (XLM) feed — and merges them with
admin-curated items. Without it, only admin-curated news shows.

### 3. Run

```bash
npm install
npm run dev      # dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

## Project structure

```
App.tsx            # routes and layout
index.tsx          # entry point
firebase.ts        # Firebase app, auth, Firestore and Storage handles
types.ts           # shared domain types
components/        # UI — feed, markets, news, profile, admin
contexts/          # Firebase, user, theme and toast providers
hooks/             # data hooks (infinite markets, countdown, modal)
services/          # Firestore/Storage access layer
utils/             # small helpers
firestore.rules    # Firestore security rules
storage.rules      # Storage security rules
```

Styling is Tailwind via the CDN script in `index.html`, with theme tokens defined as
CSS variables there and in `index.css`.

## Firestore collections

| Collection | Contents |
| --- | --- |
| `users` | Profiles keyed by Firebase uid |
| `markets` | Prediction markets |
| `feed` | Social posts, with `likes` / `reposts` / `replies` subcollections |
| `comments` | Market comments |
| `news` | News items created in the admin panel |

Some fields carry legacy names from an earlier wallet-based version — `userAddress`,
for example, now stores a Firebase uid.

## Tech stack

React 19 · TypeScript · Vite · Firebase (Auth, Firestore, Storage) ·
TanStack Query · React Router · Recharts · Tailwind CSS

## License

[MIT](LICENSE)
