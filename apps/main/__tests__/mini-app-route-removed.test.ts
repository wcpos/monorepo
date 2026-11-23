import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

const appRoot = join(__dirname, '..');

function source(path: string): string {
	return readFileSync(join(appRoot, path), 'utf8');
}

function routeFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? routeFiles(path) : [relative(appRoot, path)];
	});
}

describe('mini-app route removal (#3749)', () => {
	it('leaves no route file for /settings/mini-app/<id> on web or by deep link', () => {
		// expo-router builds its route list from the files under app/, so with no file the
		// web path and the deep link have nothing to resolve to.
		expect(routeFiles(join(appRoot, 'app')).filter((path) => path.includes('mini-app'))).toEqual(
			[]
		);
	});

	it('registers no mini-app screen in the settings stack', () => {
		const layout = source('app/(app)/(drawer)/settings/_layout.tsx');
		expect(layout).not.toContain('(modals)/mini-app/[id]');
	});

	it('exports no MiniAppHost from the lazy rest chunk', () => {
		expect(source('../../packages/core/src/screens/main/rest/index.tsx')).not.toContain(
			'MiniAppHost'
		);
	});
});
