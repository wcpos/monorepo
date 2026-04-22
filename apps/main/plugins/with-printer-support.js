const {
	createRunOncePlugin,
	withAppBuildGradle,
	withProjectBuildGradle,
} = require('@expo/config-plugins');

const pkg = 'with-wcpos-printer-support';

const STAR_IO10_AAR_DIRS = [
	'$rootDir/../node_modules/react-native-star-io10/android/src/lib',
	'$rootDir/../../node_modules/react-native-star-io10/android/src/lib',
	'$rootDir/../../../node_modules/react-native-star-io10/android/src/lib',
];

function addStarIo10FlatDirRepository(buildGradle) {
	if (STAR_IO10_AAR_DIRS.every((dir) => buildGradle.includes(dir))) {
		return buildGradle;
	}

	const flatDirBlock = [
		'    flatDir {',
		`        dirs ${STAR_IO10_AAR_DIRS.map((dir) => `"${dir}"`).join(', ')}`,
		'    }',
	].join('\n');

	const allProjectsRepositoriesPattern = /allprojects\s*{\s*repositories\s*{/;

	if (!allProjectsRepositoriesPattern.test(buildGradle)) {
		throw new Error('Could not find allprojects.repositories in android/build.gradle');
	}

	return buildGradle.replace(
		allProjectsRepositoriesPattern,
		(match) => `${match}\n${flatDirBlock}`
	);
}

function ensureStarIo10CompatibleMinSdkVersion(appBuildGradle) {
	const requiredLine = 'minSdkVersion Math.max(rootProject.ext.minSdkVersion, 29)';

	if (appBuildGradle.includes(requiredLine)) {
		return appBuildGradle;
	}

	const existingLine = 'minSdkVersion rootProject.ext.minSdkVersion';

	if (!appBuildGradle.includes(existingLine)) {
		throw new Error('Could not find minSdkVersion in android/app/build.gradle');
	}

	return appBuildGradle.replace(existingLine, requiredLine);
}

const withPrinterSupport = (config) => {
	const withProjectBuildGradleConfig = withProjectBuildGradle(config, (config) => {
		if (config.modResults.language !== 'groovy') {
			throw new Error('with-wcpos-printer-support requires a Groovy android/build.gradle file');
		}

		config.modResults.contents = addStarIo10FlatDirRepository(config.modResults.contents);

		return config;
	});

	return withAppBuildGradle(withProjectBuildGradleConfig, (config) => {
		if (config.modResults.language !== 'groovy') {
			throw new Error('with-wcpos-printer-support requires a Groovy android/app/build.gradle file');
		}

		config.modResults.contents = ensureStarIo10CompatibleMinSdkVersion(config.modResults.contents);

		return config;
	});
};

const plugin = createRunOncePlugin(withPrinterSupport, pkg, '1.0.0');

module.exports = plugin;
module.exports.STAR_IO10_AAR_DIRS = STAR_IO10_AAR_DIRS;
module.exports.addStarIo10FlatDirRepository = addStarIo10FlatDirRepository;
module.exports.ensureStarIo10CompatibleMinSdkVersion = ensureStarIo10CompatibleMinSdkVersion;
