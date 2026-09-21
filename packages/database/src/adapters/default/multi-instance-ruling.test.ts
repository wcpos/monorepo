/**
 * Pins RxDB `multiInstance` to the STORAGE ENGINE, not to a value.
 *
 * `multiInstance` is a consequence of the engine, and the two have always been
 * changed together whether or not anyone said so. Every previous version of this
 * test pinned the literal `true`, and a literal can be argued with — the flag has
 * been re-proposed as `false` five times (#1043/#1045, #1910, and twice more in
 * September 2026). A coupling cannot be argued with: break it and the failure
 * names the other half you forgot to change.
 *
 * Two eras, both live in this file (see the Decision section of ./README.md):
 *
 * - `opfs-filesystem` (today) → web `true`. Ruling 2026-08-06 (#1057). Every tab
 *   opens its own storage over the same files; `true` keeps followers coherent
 *   and gives RxDB one leader for cleanup/recovery. `false` here is the proven
 *   data-loss path of #1049.
 * - `sqlite-sahpool` (2.0, #2146) → web `false`. The pool VFS holds exclusive
 *   OPFS handles for the origin, so a second tab cannot open storage at all.
 *
 * If this test fails you are either re-litigating a closed ruling, or you changed
 * the engine and left the flag behind. Read ./README.md before changing either.
 */

import {
	REQUIRED_MULTI_INSTANCE_ELECTRON,
	REQUIRED_MULTI_INSTANCE_NATIVE,
	REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE,
	WEB_STORAGE_ENGINE,
	WEB_WORKER_PATH_BY_ENGINE,
	type WebStorageEngine,
} from '../storage/storage-engines';

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

describe('multiInstance is pinned to the storage engine (#1057 2026-08-06, #2146 2026-09-21)', () => {
	it('web matches what its CURRENT engine requires', async () => {
		const { defaultConfig } = await import('./index.web');

		expect(defaultConfig.multiInstance).toBe(
			REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE[WEB_STORAGE_ENGINE]
		);
	});

	it('every web engine declares the multiInstance it requires', () => {
		const engines = Object.keys(WEB_WORKER_PATH_BY_ENGINE) as WebStorageEngine[];

		expect(engines.length).toBeGreaterThan(0);
		for (const engine of engines) {
			expect(REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE).toHaveProperty(engine);
			expect(typeof REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE[engine]).toBe('boolean');
		}
	});

	it('the two web eras disagree — the coupling is real, not decorative', () => {
		expect(REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE['opfs-filesystem']).toBe(true);
		expect(REQUIRED_WEB_MULTI_INSTANCE_BY_ENGINE['sqlite-sahpool']).toBe(false);
	});

	it('electron is false — one main-process storage behind IPC, in every era', async () => {
		const { defaultConfig } = await import('./index.electron');

		expect(defaultConfig.multiInstance).toBe(REQUIRED_MULTI_INSTANCE_ELECTRON);
		expect(REQUIRED_MULTI_INSTANCE_ELECTRON).toBe(false);
	});

	it('native is false — one storage per app process, in every era', async () => {
		const { defaultConfig } = await import('./index');

		expect(defaultConfig.multiInstance).toBe(REQUIRED_MULTI_INSTANCE_NATIVE);
		expect(REQUIRED_MULTI_INSTANCE_NATIVE).toBe(false);
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
