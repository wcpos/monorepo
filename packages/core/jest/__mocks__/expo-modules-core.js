// expo-modules-core ships untranspiled TS; core tests never exercise real
// native modules — requireOptionalNativeModule resolves to "not available".
module.exports = {
	requireOptionalNativeModule: () => null,
	requireNativeModule: () => {
		throw new Error('native modules are not available in jest');
	},
};
