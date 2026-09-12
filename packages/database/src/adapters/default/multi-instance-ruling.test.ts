/**
 * Pins RxDB `multiInstance` per platform adapter.
 *
 * Web is `true` BY RULING (2026-08-06, #1057 — closes #1045/#1055): cashiers open
 * the same store in several tabs, one tab holds the write lease, and `true` is
 * what gives the other tabs a coherent read view and RxDB a single leader for
 * cleanup/recovery. Two adversarial passes (#1049) showed `false` on web lets two
 * tabs repair the same OPFS file and corrupt each other.
 *
 * Electron and native are `false`: each has exactly one storage per process.
 *
 * If this test fails you are about to re-litigate a closed ruling. Read
 * the Decision section of ./README.md before changing either side.
 */

const rawStorage = { name: 'raw-storage' };
const errorHandledStorage = { name: 'error-handled-storage' };
const validatedStorage = { name: 'validated-storage' };

jest.mock('../storage', () => ({ getNativeNewStorage: () => rawStorage }));
jest.mock('../storage/index.web', () => ({ getWebNewStorage: () => rawStorage }));
jest.mock('../storage/index.electron', () => ({ getElectronNewStorage: () => rawStorage }));
jest.mock('../../plugins/wrapped-error-handler-storage', () => ({
	wrappedErrorHandlerStorage: () => errorHandledStorage,
}));
jest.mock('rxdb/plugins/validate-z-schema', () => ({
	wrappedValidateZSchemaStorage: () => validatedStorage,
}));

describe('multiInstance per platform adapter (ruling 2026-08-06, #1057)', () => {
	it('web is true — multi-tab is first-class; one leader recovers, followers stay coherent', async () => {
		const { defaultConfig } = await import('./index.web');
		expect(defaultConfig.multiInstance).toBe(true);
	});

	it('electron is false — one main-process storage behind IPC', async () => {
		const { defaultConfig } = await import('./index.electron');
		expect(defaultConfig.multiInstance).toBe(false);
	});

	it('native is false — one storage per app process', async () => {
		const { defaultConfig } = await import('./index');
		expect(defaultConfig.multiInstance).toBe(false);
	});

	it('every adapter states the flag explicitly rather than inheriting rxdb’s default', async () => {
		const adapters = await Promise.all([
			import('./index.web'),
			import('./index.electron'),
			import('./index'),
		]);
		for (const adapter of adapters) {
			expect(adapter.defaultConfig).toHaveProperty('multiInstance');
		}
	});
});
