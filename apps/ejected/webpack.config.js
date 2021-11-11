const createExpoWebpackConfigAsync = require("@expo/webpack-config");
const path = require("path");

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: {
        dangerouslyAddModulePathsToTranspile: [
          "@wcpos/common",
          // path.resolve("../../packages/common/src"),
        ],
      },
    },
    argv
  );
  console.log(config);

  return config;
};
