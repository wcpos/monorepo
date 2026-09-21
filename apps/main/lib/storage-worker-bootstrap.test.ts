/**
 * Pins the page bootstrap to the web storage engine.
 *
 * `getWebStorageWorkerPaths()` falls back to the engine's own worker path, but in a
 * real web build it never reaches that fallback: both bootstrap files below set
 * `window.opfsWorker` unconditionally, and the published web bundle rewrites that
 * value to a CDN URL. So the engine constant only actually selects the worker if
 * these files agree with it.
 *
 * Without this test the 2.0 migration could flip `WEB_STORAGE_ENGINE` and
 * `multiInstance` together — the ruling test would go green — while the page went
 * on loading the OPFS worker, running the old engine with the new engine's config.
 * Found by review on PR #2190; the runtime guard in `index.web.ts` refuses such an
 * override at boot, and this fails the build before it ships.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
	WEB_STORAGE_ENGINE,
	WEB_WORKER_BASENAME_BY_ENGINE,
} from '@wcpos/database/adapters/storage/storage-engines';

// Required for ANY new test file in apps/main: without it the expo winter runtime's
// lazy global proxies make suite collection throw "trying to require a file outside
// of the scope of the test code". See lib/sync-log-observer.test.ts.
jest.resetModules();

/** Every file that hands the page a `window.opfsWorker` value. */
const BOOTSTRAP_FILES = ['app/+html.tsx', 'public/index.html'];

const APP_ROOT = path.resolve(__dirname, '..');

describe('page bootstrap names the worker the current storage engine requires', () => {
	const requiredBasename = WEB_WORKER_BASENAME_BY_ENGINE[WEB_STORAGE_ENGINE];

	it.each(BOOTSTRAP_FILES)('%s sets window.opfsWorker to the engine’s worker', (relativePath) => {
		const source = fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
		const assignments = [...source.matchAll(/window\.opfsWorker\s*=\s*['"]([^'"]+)['"]/g)].map(
			(match) => match[1]
		);

		expect(assignments.length).toBeGreaterThan(0);
		for (const assigned of assignments) {
			expect(assigned.endsWith(requiredBasename)).toBe(true);
		}
	});

	it('no bootstrap file names a worker belonging to a different engine', () => {
		const foreign = Object.entries(WEB_WORKER_BASENAME_BY_ENGINE)
			.filter(([engine]) => engine !== WEB_STORAGE_ENGINE)
			.map(([, basename]) => basename);

		for (const relativePath of BOOTSTRAP_FILES) {
			const source = fs.readFileSync(path.join(APP_ROOT, relativePath), 'utf8');

			for (const basename of foreign) {
				expect(source).not.toContain(basename);
			}
		}
	});
});
