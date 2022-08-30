// Learn more https://docs.expo.io/guides/customizing-metro

// Add support for svg files: https://github.com/react-native-svg/react-native-svg#use-with-svg-files

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '../..');

module.exports = (async () => {
	const config = await getDefaultConfig(__dirname);

	const {
		resolver: { sourceExts, assetExts },
	} = config;

	config.watchFolders = [workspaceRoot];
	config.resolver.disableHierarchicalLookup = true;
	config.resolver.nodeModulesPaths = [
		path.resolve(projectRoot, 'node_modules'),
		path.resolve(workspaceRoot, 'node_modules'),
	];

	return config;
})();
