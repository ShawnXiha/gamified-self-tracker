# Gamified Self-Tracker

A local-first PWA habit tracker that makes self-improvement lightweight, visible, and rewarding. No accounts, no backend — all data lives in your browser.

## Features

- **One-tap check-in** — binary Complete/Missed per habit per day. No friction.
- **XP & Leveling** — earn XP for every check-in, level up with quadratic progression
- **Streaks** — track consecutive days, visualized with a streak flame
- **Streak Freezes** — automatic safety net. Start with 2, earn more on level-up and 7-day milestones. Capped at 5.
- **Weekly Summary** — every Monday, see your consistency rate, lifetime days, longest streak, and freezes remaining
- **04:00 AM day boundary** — no midnight panic. Your "day" ends at 4 AM.
- **Offline-first PWA** — install on your phone, works without internet
- **Zero backend** — all data stored in IndexedDB via Dexie

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
cd packages/ui
npm run dev
```

Open http://localhost:5173 in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install all workspace dependencies |
| `npm test` | Run all tests (domain + storage + ui) |
| `npm run build` | Build all packages for production |
| `cd packages/ui && npm run dev` | Start Vite dev server |
| `cd packages/ui && npm run build` | Build UI for deployment to `dist/` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 18, TypeScript, Tailwind CSS 4, Vite 8 |
| State | Dexie (IndexedDB) + React hooks |
| Domain | Pure TypeScript (zero framework deps) |
| PWA | vite-plugin-pwa, Workbox service worker |
| Testing | Vitest, Testing Library, fake-indexeddb |
| Deployment | Vercel |

## Architecture

Monorepo with three packages, built from the inside out:

```
packages/
├── domain/      Pure business logic — date engine, scoring, streak evaluation
├── storage/     IndexedDB persistence via Dexie + React hooks
└── ui/          React SPA + PWA
```

Data flow: `domain → storage → ui`. Domain has no UI dependencies. Storage depends on domain. UI depends on both.

See [docs/architecture.md](docs/architecture.md) for details.

## Project Philosophy

From [docs/constitution.md](docs/constitution.md):

- **Local-first** — no accounts, no servers, your data stays on your device
- **Positive reinforcement only** — XP is additive, no negative scores
- **Low friction** — one tap per habit, binary completion
- **Forgiving** — streak freezes protect you from life's interruptions
- **Abstract gamification** — numbers, emoji, and progress bars, not characters or sprites

## Guides

- [User Guide](docs/user-guide.md) — how to use the app day-to-day
- [Developer Guide](docs/developer-guide.md) — architecture, setup, contributing

## License

MIT
