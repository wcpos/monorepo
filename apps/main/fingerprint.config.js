const { SourceSkips } = require('@expo/fingerprint');

// Every patch release changes the app version, but OTA updates must match the
// installed binary's runtime version. Keep version fields out of that hash.
module.exports = {
	sourceSkips: SourceSkips.ExpoConfigVersions,
};