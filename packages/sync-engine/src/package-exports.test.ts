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
				'normalizeVariationAttributes',
				// The variation projector, exported so @wcpos/query's parity test can pin
				// the map face against it — the drift tripwire #1308 gave products/orders.
				'promotedVariationColumns',
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
				// The app's engine fetcher hydrates census/query-total responses
				// through the same body-envelope seam the engine uses internally
				// (B9, hostile-headers program) — one unwrap rule, two seams.
				'hydrateResponse',
				// Which write events END a mutation: the engine emits them and
				// @wcpos/query's awaitWriteOutcome settles on them, so the set is
				// exported rather than mirrored. A mirrored copy that missed a new
				// terminal type would hang every waiter on it.
				'TERMINAL_WRITE_EVENT_TYPES',
				// The health counters must exclude the queue rows the write-drain lane
				// holds by design while a cart is open — decided by the ENGINE's rule,
				// never by a copy of it in the UI (#1546).
				'heldOpenCartMutations',
				'OPEN_CART_ORDER_STATUS',
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
