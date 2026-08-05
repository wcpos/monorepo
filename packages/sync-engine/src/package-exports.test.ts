import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';

describe('package exports', () => {
	it('exposes only the public and testing entrypoints', () => {
		expect(Object.keys(packageJson.exports)).toEqual(['.', './testing']);
	});

	it("keeps the production door's runtime values curated", async () => {
		const production = await import('./index');
		expect(Object.keys(production).sort()).toEqual(
			['createRxdbSyncEngine', 'SYNC_COLLECTION_NAMES', 'MUTATION_QUEUE_RXDB_COLLECTION'].sort()
		);
	});
});
