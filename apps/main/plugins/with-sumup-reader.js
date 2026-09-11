const {
	createRunOncePlugin,
	withAndroidManifest,
	withInfoPlist,
	withProjectBuildGradle,
} = require('@expo/config-plugins');

function mergePermissions(manifest) {
	const permissions = (manifest.manifest['uses-permission'] ??= []);
	for (const name of [
		'BLUETOOTH',
		'BLUETOOTH_ADMIN',
		'BLUETOOTH_SCAN',
		'BLUETOOTH_CONNECT',
		'ACCESS_FINE_LOCATION',
		'ACCESS_COARSE_LOCATION',
	]) {
		const fullName = `android.permission.${name}`;
		let entry = permissions.find((permission) => permission.$['android:name'] === fullName);
		if (!entry) {
			entry = { $: { 'android:name': fullName } };
			permissions.push(entry);
		}
		if (name === 'BLUETOOTH' || name === 'BLUETOOTH_ADMIN') entry.$['android:maxSdkVersion'] = '30';
	}
	return manifest;
}
function addMavenRepository(contents) {
	const pattern = /allprojects\s*{\s*repositories\s*{/;
	const block = pattern.exec(contents);
	if (!block) throw new Error('Could not find allprojects.repositories in android/build.gradle');
	const start = block.index + block[0].length;
	let end = start;
	let depth = 1;
	while (end < contents.length && depth > 0) {
		if (contents[end] === '{') depth++;
		if (contents[end] === '}') depth--;
		end++;
	}
	if (contents.slice(start, end).includes('https://maven.sumup.com/releases')) return contents;
	return contents.replace(
		pattern,
		(match) => `${match}\n    maven { url 'https://maven.sumup.com/releases' }`
	);
}
function mergeInfoPlist(plist) {
	if (typeof plist.NSLocationWhenInUseUsageDescription !== 'string')
		plist.NSLocationWhenInUseUsageDescription =
			'WCPOS needs your location to connect card readers and accept card payments.';
	if (typeof plist.NSBluetoothAlwaysUsageDescription !== 'string')
		plist.NSBluetoothAlwaysUsageDescription =
			'WCPOS uses Bluetooth to connect card readers and accept payments.';
	return plist;
}
function withSumUpReader(config) {
	config = withAndroidManifest(config, (mod) => {
		mergePermissions(mod.modResults);
		return mod;
	});
	config = withInfoPlist(config, (mod) => {
		mergeInfoPlist(mod.modResults);
		return mod;
	});
	return withProjectBuildGradle(config, (mod) => {
		if (mod.modResults.language !== 'groovy')
			throw new Error('with-sumup-reader requires a Groovy android/build.gradle');
		mod.modResults.contents = addMavenRepository(mod.modResults.contents);
		return mod;
	});
}
module.exports = createRunOncePlugin(withSumUpReader, 'with-sumup-reader', '0.1.0');
module.exports.mergePermissions = mergePermissions;
module.exports.addMavenRepository = addMavenRepository;
module.exports.mergeInfoPlist = mergeInfoPlist;
