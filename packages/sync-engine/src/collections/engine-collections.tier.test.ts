/**
 * Slice 5a: the persisted scheduler/coverage tier collections are part of the
 * engine's per-scope recipe — opened through the PUBLIC handle, versioned
 * schemas migration-wired, and byte-compatible with the web host's
 * createDatabase recipe (an adopted host must open its existing data
 * unchanged).
 */

import { describe, expect, it } from 'vitest';
// Premium stays host-side (ADR 0018) — the test harness is the host. The
// recipe is now 22 collections per scope, past the open-core 13 cap.
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createRxdbSyncEngine, type StoreScopeIdentity } from '../create-rxdb-sync-engine';
import { memoryEngineStorage } from '../testing';
import { engineCollectionCreators } from './engine-collections';

setPremiumFlag();

const SITE = 'https://lab.example.test';
let uniqueStore = 0;

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 7, cashierId: `tier-${uniqueStore}` };
}

const TIER_COLLECTIONS = [
	'schedulerTaskStates',
	'coverageRecords',
	'coverageLanes',
	'coverageCompactionLeases',
	'coverageCompactionFailures',
	'queryTotalCacheEntries',
	'queryTotalRequestStates',
	'existenceManifest',
	'existenceManifestCustomers',
	'existenceManifestOrders',
] as const;

describe('engine scope recipe: the scheduler/coverage tier (slice 5a)', () => {
	it('declares every tier collection with migration strategies for every versioned schema', () => {
		const creators = engineCollectionCreators();
		for (const name of TIER_COLLECTIONS) {
			expect(creators[name], name).toBeDefined();
			const version = (creators[name]!.schema as { version: number }).version;
			if (version > 0) {
				expect(
					creators[name]!.migrationStrategies,
					`${name} v${version} needs migrationStrategies`
				).toBeDefined();
			}
		}
	});

	it('opens the tier collections on a scope database through the public handle', async () => {
		const engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`, wpJsonRoot: `${SITE}/wp-json` },
				storage: memoryEngineStorage(),
			},
			freshIdentity()
		);
		await engine.ready;
		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		for (const name of TIER_COLLECTIONS) {
			expect(scope.database.collections[name], name).toBeDefined();
		}
		await engine.dispose();
	});
});
