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
      <img src="https://img.shields.io/discord/711884517081612298?color=%237289DA&label=WCPOS&logo=discord&logoColor=white" alt="Discord chat" />
    </a>
  </p>
  <p>
    <a href="https://github.com/wcpos/woocommerce-pos#-structure"><b>About</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/woocommerce-pos#-structure"><b>Structure</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/woocommerce-pos#-workflows"><b>Workflows</b></a>
    &ensp;&mdash;&ensp;
    <a href="https://github.com/wcpos/woocommerce-pos#-how-to-use-it"><b>How to use it</b></a>
  </p>
</div>

## 💡 About

This repository contains the core [React-Native](https://reactnative.dev/) components used in the cross-platform WooCommerce Point-of-Sale application.

## 📁 Structure

Coming soon.

## 👷 Workflows

#### Prerequisites
- [Node.js](https://nodejs.org/)
- [Yarn package manager](https://yarnpkg.com/getting-started/install)

```sh
git clone https://github.com/wcpos/core.git
```

To prepare the repository for local development you should rename `.env.example` to `.env`, this will set the local development flag to `true`.

Next you will need to install the required PHP via `composer` and JavaScript packages via `yarn`.

```sh
yarn install
```

Once you have installed the required packages you can now start development. To build the settings page, use: 

```sh
 yarn settings start
```

## 🚀 How to use it

This repository contains only the core components and will not build a complete, renderable project. To build the complete project, you should clone the [monorepo](https://github.com/wcpos/monorepo).

