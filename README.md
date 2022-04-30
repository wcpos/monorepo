<div align="center">
  <h1>Monorepo for <a href="https://wcpos.com">WooCommerce POS</a></h1>
  <p>React Native cross-platform applications for taking WooCommerce orders at the Point of Sale.</p>
  <p>
    <a href="https://wcpos.github.io/managed-expo/">
      <img src="https://github.com/wcpos/managed-expo/actions/workflows/build-web-app.yml/badge.svg" alt="Web App" />
    </a>
    <a href="https://github.com/wcpos/electron/releases">
      <img src="https://github.com/wcpos/electron/actions/workflows/tag-and-release.yml/badge.svg" alt="Desktop App" />
    </a>
    <a href="https://github.com/wcpos/managed-expo">
      <img src="https://github.com/wcpos/managed-expo/actions/workflows/standalone.yml/badge.svg" alt="Native Apps" />
    </a>
  </p>
  <p>
    <a href="https://github.com/wcpos/monorepo#-structure"><b>About</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/monorepo#-structure"><b>Structure</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/monorepo#-workflows"><b>Workflows</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/monorepo#-how-to-use-it"><b>How to use it</b></a>
  </p>
</div>

## 💡 About

The goal of this project is to develop a <u>free</u> and <u>extensible</u> Point of Sale application with first support for collecting payment via cryptocurrency.

Currently the application requires [WooCommerce](https://woocommerce.com) to provide the backend database, but it should not necessarily be limited to WooCommerce.

This monorepo contains all the code necessary to build the client applications. To use with WooCommerce you will need to also install the [WooCommerce POS plugin for WordPress](https://github.com/wcpos/woocommerce-pos).

## 📁 Structure

- [`apps`](./apps) - Expo apps that only use packages and aren't aware of other apps.
- [`packages`](./packages) - Node packages that may use external and/or local packages.

### Apps

- [`apps/managed`](./apps/managed) - Expo managed app builds for Web, iOS and Android.
- [`apps/electron`](./apps/managed) - Builds app for Windows, MacOS and Linux.

### Packages

- [`packages/core`](./packages/core) - Core screens and navigation.
- [`packages/components`](./packages/components) - Shared UI components, see [playground](https://wcpos.github.io/components/).
- [`packages/form`](./packages/form) - React Native JSONSchema Form, see [playground](https://wcpos.github.io/react-native-jsonschema-form/).
- [`packages/database`](./packages/database) - Local database (IndexedDB for Web and Desktop, SQLite for Native).
- [`packages/theme`](./packages/theme) - Theme library.
- [`packages/hooks`](./packages/hooks) - Shared hooks.
- [`packages/utils`](./packages/utils) - Shared utils.
- [`packages/babel`](./packages/babel) - Babel configuration for Expo.
- [`packages/eslint`](./packages/eslint) - ESLint configuration for Expo.
- [`packages/tsconfig`](./packages/tsconfig) - TypeScript configuration.

## 👷 Workflows

Coming soon.

## 🚀 How to use it

Coming soon.
