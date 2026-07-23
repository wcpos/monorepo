<div align="center">
  <h1>Monorepo for <a href="https://wcpos.com">WooCommerce POS</a></h1>
  <p>React Native + Expo cross-platform applications for taking WooCommerce orders at the Point of Sale.</p>
  <p>
    <a href="https://wcpos.expo.app/">
      <img src="https://github.com/wcpos/monorepo/actions/workflows/deploy.yml/badge.svg" alt="Web App" />
    </a>
    <a href="https://github.com/wcpos/electron/releases">
      <img src="https://github.com/wcpos/electron/actions/workflows/tag-and-release.yml/badge.svg" alt="Desktop App" />
    </a>
    <a href="https://github.com/wcpos/monorepo/actions/workflows/test.yml">
      <img src="https://github.com/wcpos/monorepo/actions/workflows/test.yml/badge.svg" alt="Tests" />
    </a>
    <a href="https://wcpos.com/discord">
      <img src="https://img.shields.io/discord/711884517081612298?color=%237289DA&label=WCPOS&logo=discord&logoColor=white" alt="Discord Chat" />
    </a>
  </p>
  <p>
    <a href="#-about"><b>About</b></a>
    &ensp;&mdash;&ensp;
    <a href="#-structure"><b>Structure</b></a>
    &ensp;&mdash;&ensp;
    <a href="#-architecture"><b>Architecture</b></a>
    &ensp;&mdash;&ensp;
    <a href="#-development"><b>Development</b></a>
    &ensp;&mdash;&ensp;
    <a href="#-workflows"><b>Workflows</b></a>
  </p>
</div>

## 💡 About

The goal of this project is a <u>free</u> and <u>extensible</u> Point of Sale application, with a payment-method-agnostic design (including first-class support for cryptocurrency).

This monorepo contains all the code for the **client applications** — a single React Native + Expo codebase that ships to web, desktop and mobile. It currently uses [WooCommerce](https://woocommerce.com) as its backend, so to run it against a store you also need the [WooCommerce POS plugin for WordPress](https://github.com/wcpos/woocommerce-pos), which provides the REST API and authentication.

| Target | Built from | Distributed as |
| --- | --- | --- |
| 🌐 Web | `apps/main` | [wcpos.expo.app](https://wcpos.expo.app) (EAS Hosting) |
| 🖥 Desktop | `apps/electron` (wraps the `apps/main` web build) | Windows / macOS / Linux installers |
| 📱 Mobile | `apps/main` | iOS & Android (EAS Build) |
| 🧩 In-WordPress | `apps/web` | JS bundle on jsDelivr, loaded by the WP plugin |

## 📁 Structure

The repo is a [pnpm](https://pnpm.io) workspace orchestrated with [Turborepo](https://turbo.build/). Code is split into `apps/*` (deployable applications) and `packages/*` (shared libraries).

### Apps

| Path | Package | Description |
| --- | --- | --- |
| [`apps/main`](./apps/main) | `@wcpos/main` | The Expo app (expo-router) — the source of truth for web, iOS and Android. |
| [`apps/electron`](https://github.com/wcpos/electron) | `@wcpos/app-electron` | Electron desktop wrapper for Windows/macOS/Linux. *(git submodule)* |
| [`apps/web`](https://github.com/wcpos/web-bundle) | `@wcpos/web-bundle` | Builds the web JS bundle shipped via jsDelivr for the WordPress plugin. *(git submodule)* |
| [`apps/template-studio`](./apps/template-studio) | `@wcpos/template-studio` | A Vite harness for previewing and print-testing receipt templates. |

### Packages

| Path | Package | Description |
| --- | --- | --- |
| [`packages/core`](./packages/core) | `@wcpos/core` | Core POS screens and navigation. |
| [`packages/components`](./packages/components) | `@wcpos/components` | Shared UI components (Tailwind/uniwind, FontAwesome icons). |
| [`packages/database`](./packages/database) | `@wcpos/database` | Local-first data layer built on RxDB. |
| [`packages/query`](./packages/query) | `@wcpos/query` | Querying and WooCommerce sync/replication. |
| [`packages/hooks`](./packages/hooks) | `@wcpos/hooks` | Shared React hooks. |
| [`packages/utils`](./packages/utils) | `@wcpos/utils` | Shared utilities. |
| [`packages/printer`](./packages/printer) | `@wcpos/printer` | ESC/POS printer encoding and transport. |
| [`packages/receipt-renderer`](./packages/receipt-renderer) | `@wcpos/receipt-renderer` | Receipt rendering (HTML + thermal templates). |
| [`packages/virtual-printer`](./packages/virtual-printer) | `@wcpos/virtual-printer` | Dev tool: a virtual TCP printer for testing. |
| [`packages/eslint`](./packages/eslint) | `@wcpos/eslint-config` | Shared ESLint configuration. |

> Submodules: `apps/electron` and `apps/web`. `pnpm install` initialises `apps/web` automatically; initialise/refresh `apps/electron` with `pnpm submodules:update` when working on the desktop app.

## 🏗 Architecture

One Expo codebase renders the POS everywhere; the difference between platforms is mostly the **data layer**, which adapts RxDB to each platform's best storage engine:

| Platform | Storage engine |
| --- | --- |
| Web | OPFS (Origin Private File System), in a worker — migrating from IndexedDB |
| Desktop (Electron) | Filesystem-node storage in the main process, reached over IPC; legacy SQLite-over-IPC is used for migrations |
| Native (iOS/Android) | SQLite via `expo-sqlite` |

Querying and replication against the WooCommerce REST API live in `@wcpos/query`; printing (ESC/POS encoding, transports and receipt rendering) lives in `@wcpos/printer` and `@wcpos/receipt-renderer`. See the [Client Architecture](https://github.com/wcpos/wiki/blob/main/architecture/client.md) wiki page for a deeper dive.

## 👩‍💻 Development

**Prerequisites**

- [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io) (pinned via `packageManager`)
- For native builds: the [Expo / React Native](https://docs.expo.dev/get-started/set-up-your-environment/) toolchain (Xcode, Android Studio)
- Access tokens for the licensed dependencies **RxDB Premium** and **Uniwind Pro** (CI injects these as secrets)

**Setup**

```bash
git clone --recursive https://github.com/wcpos/monorepo.git
cd monorepo
pnpm install          # also initialises the apps/web submodule
```

**Run the app**

```bash
pnpm start            # clean Metro dev server for apps/main (web + native clients)
pnpm dev:electron     # the desktop app (Expo dev server + Electron)

# native dev clients
pnpm --filter @wcpos/main ios
pnpm --filter @wcpos/main android
```

**Useful scripts**

| Script | Description |
| --- | --- |
| `pnpm start` | Clean-state Metro launcher for `apps/main` |
| `pnpm dev` / `pnpm dev:main` / `pnpm dev:electron` | Turborepo dev tasks |
| `pnpm build` / `pnpm build:main` | Production builds |
| `pnpm test` | Run package + app unit tests |
| `pnpm lint` / `pnpm lint:fix` | Lint via Turborepo |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm extract:translations` | Extract source strings for translation |
| `pnpm submodules:update` | Pull latest `apps/electron` / `apps/web` |

## 👷 Workflows

CI/CD lives in [`.github/workflows/`](./.github/workflows):

- **[`deploy.yml`](./.github/workflows/deploy.yml)** — exports the `apps/main` web build and deploys it to EAS Hosting ([wcpos.expo.app](https://wcpos.expo.app)); PRs get preview deployments. Runs sharded Playwright E2E against the deployment.
- **[`build.yml`](./.github/workflows/build.yml)** — EAS Build for native iOS/Android apps (manually dispatched), with optional store submission.
- **[`test.yml`](./.github/workflows/test.yml)** — lint, type-check and unit tests with a coverage ratchet, gating every PR.
- **[`publish-web-bundle.yml`](./.github/workflows/publish-web-bundle.yml)** — builds `apps/web` and publishes the bundle to the [`web-bundle`](https://github.com/wcpos/web-bundle) repo for jsDelivr.
- **[`bump-submodules.yml`](./.github/workflows/bump-submodules.yml)** — daily auto-bump of the `apps/electron` submodule.

## 📚 Documentation

- Architecture, product and operations docs live in the [WCPOS wiki](https://github.com/wcpos/wiki) — read it fresh from the repo (it changes daily; start with `INDEX.md` at its root).
- User-facing documentation is at [docs.wcpos.com](https://docs.wcpos.com).

## 🔗 Links

- 🌐 Website — [wcpos.com](https://wcpos.com)
- 🖥 Desktop client — [github.com/wcpos/electron](https://github.com/wcpos/electron)
- 🔌 WordPress plugin — [github.com/wcpos/woocommerce-pos](https://github.com/wcpos/woocommerce-pos)
- 💬 Discord — [wcpos.com/discord](https://wcpos.com/discord)

## 📄 License

This repository is licensed under [MIT](./LICENSE). Individual workspace packages may also declare a license in their own manifest; those that do use [MIT](https://opensource.org/licenses/MIT). Manifests that omit a license field inherit the repository license.
