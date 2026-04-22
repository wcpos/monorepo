const assert = require('node:assert/strict');
const test = require('node:test');

const {
	STAR_IO10_AAR_DIRS,
	addStarIo10FlatDirRepository,
	ensureStarIo10CompatibleMinSdkVersion,
} = require('./with-printer-support');

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const sampleProjectBuildGradle = `allprojects {
  repositories {
    google()
    mavenCentral()
    maven { url 'https://www.jitpack.io' }
  }
}
`;

const sampleAppBuildGradle = `android {
    defaultConfig {
        minSdkVersion rootProject.ext.minSdkVersion
    }
}
`;

test('injects the StarIO10 flatDir repository into android/build.gradle', () => {
	const result = addStarIo10FlatDirRepository(sampleProjectBuildGradle);

	assert.match(result, /flatDir \{/);

	for (const dir of STAR_IO10_AAR_DIRS) {
		assert.match(result, new RegExp(escapeRegExp(dir)));
	}
});

test('does not duplicate the StarIO10 flatDir repository block', () => {
	const once = addStarIo10FlatDirRepository(sampleProjectBuildGradle);
	const twice = addStarIo10FlatDirRepository(once);

	assert.equal(twice, once);
});

test('raises Android minSdk to satisfy the StarIO10 native module', () => {
	const result = ensureStarIo10CompatibleMinSdkVersion(sampleAppBuildGradle);

	assert.match(result, /minSdkVersion Math\.max\(rootProject\.ext\.minSdkVersion, 29\)/);
});

test('does not duplicate the StarIO10 minSdk rewrite', () => {
	const once = ensureStarIo10CompatibleMinSdkVersion(sampleAppBuildGradle);
	const twice = ensureStarIo10CompatibleMinSdkVersion(once);

	assert.equal(twice, once);
});
