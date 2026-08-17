import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';

describe('package exports', () => {
	it('exposes only the public and testing entrypoints', () => {
		expect(Object.keys(packageJson.exports)).toEqual(['.', './testing']);
	});

	it("keeps the production door's runtime values curated", async () => {
		const production = await import('./index');
		expect(Object.keys(production).sort()).toEqual(
			[
				'createRxdbSyncEngine',
				'engineDocumentIdFor',
				'normalizeVariationAttributes',
				'SYNC_COLLECTION_NAMES',
				'MUTATION_QUEUE_RXDB_COLLECTION',
				// The Store health panel must decide "does discard delete this record?"
				// from the SAME rule the engine enforces (#832 follow-up, R7b).
				'rejectionSuggestsServerRecord',
				// The host opens and names the cross-tab write-outcome channel (#1209)
				// — web-only, scoped per store database, moved on a scope switch — so
				// the factory and the naming rule are both part of the public door.
				'createWriteOutcomeBridge',
				'writeOutcomeChannelName',
			].sort()
		);
	});

	it("keeps the testing door's runtime values curated", async () => {
		const testing = await import('./testing');
		expect(Object.keys(testing).sort()).toEqual([
			'createEngineHarness',
			'customerBrowseWindowQueryKeyFromDimensions',
			'engineSyncCollectionCreators',
			'existenceManifestDocument',
			'existenceManifestSchema',
			'memoryEngineStorage',
			'memoryStringStore',
			'orderBrowserQueryKey',
			'productBrowseWindowQueryKeyFromDimensions',
			'remoteId',
			'schedulerTaskStateKey',
			'schedulerTaskStateSchema',
			'scriptedConnectivity',
		]);
	});
});
