const { withAndroidManifest } = require('expo/config-plugins');
// The lab driver is HTTP on the local network, never an internet service.
module.exports = (config) =>
	withAndroidManifest(config, (mod) => {
		mod.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
		return mod;
	});
