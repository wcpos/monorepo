const path = require('path');
const webpack = require('webpack');

module.exports = {
	stories: ['../../../packages/common/src/**/*.stories.tsx'],

	addons: [
		'@storybook/preset-create-react-app',
		'@storybook/addon-essentials',
		'@storybook/addon-actions',
		'storybook-addon-mock/register'
	],

	typescript: {
		// @TODO remove this https://github.com/styleguidist/react-docgen-typescript/issues/356
		// reactDocgen: 'none',
	},

	webpackFinal: async (config) => {
		// const fs = require('fs');
		// fs.writeFile('test.txt', JSON.stringify(config, null, ' '), function (err, data) {
		// 	if (err) {
		// 		return console.log(err);
		// 	}
		// 	console.log(data);
		// });
		// console.log(config.module.rules[3].oneOf[2]);
		/** @TODO create less fragile way to remove svg from default config */
		config.module.rules[2] = {
			test: /\.(ico|jpg|jpeg|png|gif|eot|otf|webp|ttf|woff|woff2|cur|ani|pdf)(\?.*)?$/,
			loader: '/Users/kilbot/Projects/wcpos-client/node_modules/file-loader/dist/cjs.js',
			query: { name: 'static/media/[name].[hash:8].[ext]' },
		};

		config.module.rules.push({
			test: /\.(ts|tsx)$/,
			loader: 'babel-loader',
			options: {
				presets: ['module:metro-react-native-babel-preset'],
				plugins: [
					'react-native-reanimated/plugin',
				]
			},
		});

		config.module.rules.push({
			test: /\.js$/,
			include: [
				path.resolve(__dirname, '../../../node_modules/react-native-reanimated/'),
				path.resolve(__dirname, '../../../node_modules/react-native-gesture-handler/'),
				path.resolve(__dirname, '../../../node_modules/@unimodules/'),
				path.resolve(__dirname, '../../../node_modules/expo-modules-core/'),
			],
			use: {
				loader: 'babel-loader',
				options: {
					cacheDirectory: false,
					presets: [
						['module:metro-react-native-babel-preset', { disableImportExportTransform: true }],
					],
					plugins: [
						'react-native-reanimated/plugin',
					]
				},
			},
		});

		config.module.rules.push({
			test: /\.svg$/,
			exclude: /node_modules/,
			use: [{ loader: '@svgr/webpack' }],
		});

		//
		config.resolve.alias = config.resolve.alias || {};
		config.resolve.alias['react-native'] = 'react-native-web'; // added by create-react-app config
		config.resolve.alias['react-native-linear-gradient'] = 'react-native-web-linear-gradient';

		// resolve .web.js before .js
		// required for react-native-svg
		config.resolve.extensions = [
			'.web.js',
			'.js',
			'.web.jsx',
			'.jsx',
			'.web.ts',
			'.ts',
			'.web.tsx',
			'.tsx',
			'.json',
			'.svg',
		];

		// https://github.com/formium/formik/issues/1607
		config.plugins.push(
			new webpack.DefinePlugin({
				'__DEV__': process.env.NODE_ENV === 'development'
			})
		);

		// winston logging to file
		config.node = config.node || {};
		config.node.fs = 'empty';

		return config;
	},
};
