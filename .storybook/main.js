const path = require('path');
const webpack = require('webpack');

module.exports = {
	core: {
    builder: 'webpack5',
	},
	
	stories: ['src/**/*.stories.tsx'],

	addons: [
		'@storybook/preset-create-react-app',
		'@storybook/addon-essentials',
		'@storybook/addon-actions',
		'@storybook/addon-react-native-web'
	],

	framework: '@storybook/react',

	typescript: {
		// @TODO remove this https://github.com/styleguidist/react-docgen-typescript/issues/356
		// reactDocgen: 'none',
	},

	babel: async (options) => ({
    // Update your babel configuration here
    ...options,
  }),

	webpackFinal: async (config, { configType }) => {
    // Make whatever fine-grained changes you need
    // Return the altered config
		console.log(config);
		console.log(config.module.rules[2].oneOf[9].type);
    return config;
	},
};
