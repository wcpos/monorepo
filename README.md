<div align="center">
  <h1>Core React-Native Components for <a href="https://wcpos.com">WooCommerce POS</a></h1>
  <p>
    <a href="https://badge.fury.io/js/@wcpos%2Fcore">
      <img src="https://badge.fury.io/js/@wcpos%2Fcore.svg" alt="NPM">
    </a>
    <a href="https://github.com/wcpos/core/actions/workflows/test.yml">
      <img src="https://github.com/wcpos/core/actions/workflows/test.yml/badge.svg" alt="Tests" />
    </a>
    <a href="https://github.com/wcpos/core/actions/workflows/codeql-analysis.yml">
      <img src="https://github.com/wcpos/core/actions/workflows/codeql-analysis.yml/badge.svg" alt="Hooks docs" />
    </a>
    <a href="https://wcpos.com/discord">
      <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FGCEeEVpEvX%3Fwith_counts%3Dtrue&query=%24.approximate_presence_count&logo=discord&logoColor=white&label=users%20online&color=green" alt="Discord chat" />
    </a>
  </p>
  <p>
    <a href="https://github.com/wcpos/core#-structure"><b>About</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/core#-structure"><b>Structure</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/core#-workflows"><b>Workflows</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/core#-how-to-use-it"><b>How to use it</b></a>
  </p>
</div>

## 💡 About

This repository contains the core [React-Native](https://reactnative.dev/) components used in the cross-platform WooCommerce Point-of-Sale application.

## 📁 Structure

> **Disclaimer:** The folder structure may change over time.

The folder structure is designed to segregate concerns while maintaining modularity and readability. It primarily consists of:

- **`/src`**
  - `index.tsx` - root component
  - **`/contexts`** - context providers for state management
  - **`/hooks`** - shared hooks that contain business logic and UI helpers
  - **`/screens`** - contains various screen sub-folders, each representing a 'screen'
    - `index.tsx` - route navigator component
    - **`/components`** - shared components
    - **`/screen-1-folder`** -
      - `index.tsx` - route navigator component
      - **`/components`** - shared components
      - **`/contexts`** - context providers for state management
      - **`/hooks`** - shared hooks that contain business logic and UI helpers
      - **`/sub-screen-folder`**
        - `index.tsx`
        - ...
    - **`/screen-2-folder`**
      - ...

Simplifed, we have:

- `navigator`
- `/components`
- `/contexts`
- `/hooks`
- **`/sub-folder`**
  - `navigator`
  - `/components`
  - `/contexts`
  - `/hooks`
  - **`/sub-folder`**
    - `navigator`
    - ...

## 👷 Workflows

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Yarn package manager](https://yarnpkg.com/getting-started/install)

### Clone and install dependencies

```sh
git clone https://github.com/wcpos/core.git wcpos-core
cd wcpos-core
yarn install
```

### Running tests

```sh
 yarn test
```

## 🚀 How to use it

This repository contains only the core components and will not build a complete, renderable project. To build the complete project, you should clone the [monorepo](https://github.com/wcpos/monorepo).
