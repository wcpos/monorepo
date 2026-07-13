import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';

describe('package exports', () => {
	it('exposes only the public and testing entrypoints', () => {
		expect(Object.keys(packageJson.exports)).toEqual(['.', './testing']);
	});

	it("keeps createRxdbSyncEngine as the production door's only runtime value", async () => {
		const production = await import('./index');
		expect(Object.keys(production)).toEqual(['createRxdbSyncEngine']);
	});
});
