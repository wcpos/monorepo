# WCPOS — Architecture

> Last updated: 2026-03-24

## Ecosystem Overview

WCPOS is a distributed system spanning multiple repos and services:

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Client Apps                               │
│  monorepo-v2 (React Native + Expo + Electron)                   │
│  iOS / Android / Web / Desktop                                   │
└──────────┬──────────────────────────┬───────────────────────────┘
           │ WooCommerce REST API     │ WCPOS Services
           ↓                          ↓
┌─────────────────────┐   ┌──────────────────────────────────────┐
│  WordPress + WC     │   │  wcpos-infra (Hetzner/Coolify)       │
│  ┌───────────────┐  │   │  ┌─────────────────────────────────┐ │
│  │woocommerce-pos│  │   │  │ updates.wcpos.com — app updates │ │
│  │  (free)       │  │   │  │ license.wcpos.com — Keygen CE   │ │
│  ├───────────────┤  │   │  │ store-api.wcpos.com — MedusaJS  │ │
│  │woocommerce-   │  │   │  │ notifications.wcpos.com — Novu  │ │
│  │  pos-pro      │  │   │  │ btcpay.wcpos.com — BTC payments │ │
│  └───────────────┘  │   │  └─────────────────────────────────┘ │
└─────────────────────┘   │  PostgreSQL / Redis / MariaDB        │
                          │  Grafana / Loki / Uptime Kuma        │
                          └──────────────────────────────────────┘
```

**Key relationships:**
- **Client ↔ WordPress**: All product/order/customer data flows through WooCommerce REST API
- **Client ↔ Updates Server**: App updates (Electron), Pro plugin updates, license validation (proxies to Keygen)
- **Client ↔ Novu**: Push notifications, in-app messaging
- **MedusaJS → Keygen**: License creation on purchase
- **Free ↔ Pro plugin**: Pro includes free as a Composer dependency, extends via hooks/filters
- **wcpos.com**: Next.js on Vercel — marketing site + admin dashboard

## Client Architecture (monorepo-v2)

### Structure

React Native + Expo monorepo. pnpm workspaces + Turbo for task orchestration.

```text
apps/
  main/          — Expo managed app (iOS, Android, Web via EAS)
  electron/      — Desktop app (Windows, macOS, Linux)
  web/           — Web bundle distribution (served via jsDelivr, embedded in WordPress)
packages/
  core/          — Screens, navigation, context providers
  database/      — RxDB schemas and platform-specific adapters
  query/         — Data querying, replication, sync state management
  components/    — UI library (60+ components, Uniwind + RN Primitives)
  hooks/         — useHttpClient (Axios), useKeyboard, useNetInfo
  printer/       — Receipt printer encoding and transport
  utils/         — Logging, platform detection
  eslint/, tsconfig/, babel/  — Shared configs
```

### Data Flow

```text
WooCommerce REST API
       ↓ (Axios)
Query & Replication Layer (packages/query)
  CollectionReplicationState — polls every 5 min, full audit every hour
    (see pollingInterval & fullFetchInterval in collection-replication-state.ts)
  QueryReplicationState      — pulls filtered subsets while component is mounted
    (see pollingTime in query-replication-state.ts)
  SyncStateManager           — batches 1000 records, yields to event loop
    (see batchSize in sync-state.ts)
       ↓
RxDB Local Database (packages/database)
  Store DB (per store)  — products, orders, customers, tax rates, etc.
  Fast DB (per store)   — sync metadata only
  User DB (global)      — users, sites, credentials
  Temporary DB          — in-memory cart before save
       ↓ (platform adapters)
  Web: IndexedDB (worker thread)
  Native: SQLite (expo-sqlite)
  Desktop: SQLite (better-sqlite3)
```

### App Startup (3-phase hydration)

1. Load user DB → check for stored session
2. Load store DB + fast DB → initialize queries
3. Load translations → render app

Context hierarchy: `AppStateProvider` → `ThemeProvider` → `TranslationProvider` → `NovuProvider` → `QueryProvider`

### Screen Pattern

Each screen follows:
1. `index.tsx` — Suspense wrapper, creates query via `useQuery()`, wraps with error boundary
2. Main component — uses query object, renders `DataTable` (TanStack React Table)
3. `cells/` — column cell renderers
4. `contexts/` — screen-specific state (UI settings, tax rates)

### Key Patterns

- **Observable-driven**: All async state via RxJS subjects, integrated with React via `observable-hooks`
- **Greedy vs lazy sync**: Critical data (products, orders) syncs immediately; secondary data syncs on demand
- **Platform adapters**: `.web.ts`, `.electron.ts`, `.ts` (default) for platform-specific code
- **Replication pausing**: Queries pause replication when component unmounts
- **Query Manager**: Singleton registry of all active queries and replications

### Key Dependencies

- RxDB 16.x — local reactive database (see `packages/database/package.json`)
- RxJS 7.x — observable state (see `packages/core/package.json`)
- Expo 55 — cross-platform framework (see `apps/main/package.json`)
- TanStack React Table 8.x — data tables (see `packages/core/package.json`)
- Uniwind — CSS-in-JS styling
- Axios — HTTP with replication backoff
- i18next — internationalization
