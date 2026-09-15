// This pins the OTA lane's contract; flipping any of these silently returns
// mobile to store-build-only delivery.
jest.resetModules();

const appConfig = require('../app.config').default({ config: {} });
const eas = require('../eas.json');
const packageJson = require('../package.json');

describe('mobile OTA configuration', () => {
	it('uses the native fingerprint as the runtime version', () => {
		expect(appConfig.runtimeVersion).toEqual({ policy: 'fingerprint' });
	});

	it('fetches updates from the existing EAS project', () => {
		expect(appConfig.updates?.url).toBe(`https://u.expo.dev/${appConfig.extra.eas.projectId}`);
	});

	it('checks on load without delaying POS startup', () => {
		expect(appConfig.updates?.checkAutomatically).toBe('ON_LOAD');
		expect(appConfig.updates?.fallbackToCacheTimeout).toBe(0);
	});

	it('routes release builds to their channels but leaves dev clients on Metro', () => {
		expect(eas.build.production.channel).toBe('production');
		expect(eas.build.adhoc.channel).toBe('adhoc');
		expect(eas.build.development).not.toHaveProperty('channel');
	});

	it('includes the native updater dependency', () => {
		expect(packageJson.dependencies).toHaveProperty('expo-updates');
	});
});
