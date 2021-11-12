// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '../..');

const config = getDefaultConfig(__dirname);

config.watchFolders = [workspaceRoot, './.storybook'];
config.resolver.nodeModulesPath = [
	path.resolve(projectRoot, 'node_modules'),
	path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.resolverMainFields = ['sbmodern', ...config.resolver.resolverMainFields];
config.transformer.getTransformOptions = async () => ({
	transform: {
		experimentalImportSupport: false,
		inlineRequires: false,
	},
});

module.exports = config;
