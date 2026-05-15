import { isWcposPluginCompatible } from './use-app-info';

jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: {
		version: '1.9.0',
		platformVersion: '1.9.0',
		buildNumber: '1.9.0',
		platform: 'web',
		userAgent: 'WCPOS/1.9.0 (web)',
	},
}));

jest.mock('../contexts/app-state', () => ({ AppStateContext: undefined }));

describe('isWcposPluginCompatible', () => {
	it('accepts supported 1.8.x plugins when the app version is newer', () => {
		expect(isWcposPluginCompatible('1.8.11')).toBe(true);
	});

	it('rejects plugins before the auth-compatible minimum', () => {
		expect(isWcposPluginCompatible('1.7.9')).toBe(false);
	});

	it('rejects missing or invalid plugin versions', () => {
		expect(isWcposPluginCompatible(undefined)).toBe(false);
		expect(isWcposPluginCompatible('not-a-version')).toBe(false);
	});
});
