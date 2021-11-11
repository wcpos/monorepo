// crago.config.js
// see: https://github.com/sharegate/craco

const cracoBabelLoader = require("craco-babel-loader");
const fs = require("fs");
const path = require("path");

// Handle relative paths to sibling packages
const appDirectory = fs.realpathSync(process.cwd());
const resolvePackage = (relativePath) =>
  path.resolve(appDirectory, relativePath);

module.exports = {
  plugins: [
    {
      plugin: cracoBabelLoader,
      options: {
        includes: [
          // No "unexpected token" error importing components from these lerna siblings:
          resolvePackage("../../packages/common"),
          // resolvePackage("../more-components"),
          // resolvePackage("../another-components-package"),
        ],
      },
    },
  ],
};
