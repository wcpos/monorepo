/**
 * Unit tests for the pure outcome → replication-action router. The router has
 * NO rxdb/fetch/DOM; it only re-shapes a HybridPollOutcome into the
 * collection-grouped action plan the host's pull loop executes. Each branch of
 * the spec is pinned here (TDD): routine change, drill-down ids, delete
 * tombstone, stale-with-fields → reDerive, stale-without → reFetch, escalation
 * surfaced not pulled, multi-collection grouping, empty outcome.
 */

import { describe, expect, it } from 'vitest';

import { planReplicationActions } from './changeSignalReplication';

import type {
	BaselineDigests,
	HybridChange,
	HybridPollOutcome,
	HybridRepairTarget,
	SequenceCursor,
} from './hybridChangeSignal';

function baseOutcome(overrides: Partial<HybridPollOutcome> = {}): HybridPollOutcome {
	const baselineDigests: BaselineDigests = new Map();
	const cursor: SequenceCursor = { sequence: 7 };
	return {
		changes: [],
		cursor,
		sweepRan: false,
		sweepIncomplete: false,
		integrityMismatches: [],
		idsToPull: [],
		escalatedIds: [],
		baselineDigests,
		...overrides,
	};
}

function change(
	id: number,
	collection: HybridChange['collection'],
	type = 'product.updated'
): HybridChange {
	return { id, collection, type, source: 'sequence-log' };
}

function repair(
	id: number,
	collection: HybridRepairTarget['collection'],
	status: HybridRepairTarget['status'] = 'changed',
	detector: HybridRepairTarget['detector'] = 'hash-checksum'
): HybridRepairTarget {
	return { id, collection, status, detector };
}

describe('planReplicationActions — routine TIER 1 changes', () => {
	it('routes non-delete changes into targetedPulls grouped by collection', () => {
		const actions = planReplicationActions(
			baseOutcome({
				changes: [change(10, 'products'), change(11, 'products'), change(20, 'variations')],
			})
		);

		expect(actions.targetedPulls).toEqual([
			{ collection: 'products', ids: [10, 11] },
			{ collection: 'variations', ids: [20] },
		]);
		expect(actions.deletes).toEqual([]);
	});

	it('dedupes ids within a collection', () => {
		const actions = planReplicationActions(
			baseOutcome({ changes: [change(10, 'products'), change(10, 'products', 'product.created')] })
		);
		expect(actions.targetedPulls).toEqual([{ collection: 'products', ids: [10] }]);
	});
});

describe('planReplicationActions — drill-down ids', () => {
	it('routes idsToPull (status !== deleted) into targetedPulls', () => {
		const actions = planReplicationActions(
			baseOutcome({
				idsToPull: [repair(30, 'products', 'changed'), repair(31, 'products', 'missing_stored')],
			})
		);
		expect(actions.targetedPulls).toEqual([{ collection: 'products', ids: [30, 31] }]);
		expect(actions.deletes).toEqual([]);
	});

	it('merges TIER 1 changes and drill-down ids in one collection group, deduped', () => {
		const actions = planReplicationActions(
			baseOutcome({
				changes: [change(40, 'products')],
				idsToPull: [repair(40, 'products', 'changed'), repair(41, 'products', 'changed')],
			})
		);
		expect(actions.targetedPulls).toEqual([{ collection: 'products', ids: [40, 41] }]);
	});
});

describe('planReplicationActions — delete tombstones', () => {
	it('routes delete-type changes into deletes, NOT targetedPulls', () => {
		const actions = planReplicationActions(
			baseOutcome({
				changes: [
					change(50, 'products', 'product.deleted'),
					change(51, 'products', 'product.trashed'),
				],
			})
		);
		expect(actions.deletes).toEqual([{ collection: 'products', ids: [50, 51] }]);
		expect(actions.targetedPulls).toEqual([]);
	});

	it('routes drill-down ids with status deleted into deletes', () => {
		const actions = planReplicationActions(
			baseOutcome({ idsToPull: [repair(60, 'tax_rates', 'deleted', 'range-checksum')] })
		);
		expect(actions.deletes).toEqual([{ collection: 'tax_rates', ids: [60] }]);
		expect(actions.targetedPulls).toEqual([]);
	});

	it('a delete excludes the same id from targetedPulls when both appear', () => {
		const actions = planReplicationActions(
			baseOutcome({
				changes: [
					change(70, 'products', 'product.updated'),
					change(70, 'products', 'product.deleted'),
				],
			})
		);
		expect(actions.deletes).toEqual([{ collection: 'products', ids: [70] }]);
		expect(actions.targetedPulls).toEqual([]);
	});

	it('does NOT treat untrash/undelete/restore as a delete (a restore brings a record back)', () => {
		// The verb merely CONTAINS trash/delete — but it is a restore. It must route
		// to a targeted pull (fetch the restored record), never to a local delete.
		const actions = planReplicationActions(
			baseOutcome({
				changes: [
					change(80, 'products', 'product.untrashed'),
					change(81, 'products', 'product.undeleted'),
					change(82, 'products', 'product.restored'),
				],
			})
		);
		expect(actions.deletes).toEqual([]);
		expect(actions.targetedPulls).toEqual([{ collection: 'products', ids: [80, 81, 82] }]);
	});
});

describe('planReplicationActions — config staleness split', () => {
	it('a stale collection WITH configBarcodeFields routes to reDeriveBarcode', () => {
		const actions = planReplicationActions(
			baseOutcome({
				staleCollections: ['products'],
				configBarcodeFields: {
					products: ['sku', 'global_unique_id'],
					variations: [],
					tax_rates: [],
				},
			})
		);
		expect(actions.reDeriveBarcode).toEqual([
			{ collection: 'products', activeFields: ['sku', 'global_unique_id'] },
		]);
		expect(actions.reFetchCollections).toEqual([]);
	});

	it('a stale collection WITHOUT configBarcodeFields routes to reFetchCollections', () => {
		const actions = planReplicationActions(baseOutcome({ staleCollections: ['variations'] }));
		expect(actions.reFetchCollections).toEqual(['variations']);
		expect(actions.reDeriveBarcode).toEqual([]);
	});

	it('an empty barcode field list for the stale collection routes to reFetch (not reDerive)', () => {
		const actions = planReplicationActions(
			baseOutcome({
				staleCollections: ['products'],
				configBarcodeFields: { products: [], variations: [], tax_rates: [] },
			})
		);
		expect(actions.reFetchCollections).toEqual(['products']);
		expect(actions.reDeriveBarcode).toEqual([]);
	});

	it('splits mixed stale collections by field presence', () => {
		const actions = planReplicationActions(
			baseOutcome({
				staleCollections: ['products', 'tax_rates'],
				configBarcodeFields: { products: ['sku'], variations: [], tax_rates: [] },
			})
		);
		expect(actions.reDeriveBarcode).toEqual([{ collection: 'products', activeFields: ['sku'] }]);
		expect(actions.reFetchCollections).toEqual(['tax_rates']);
	});
});

describe('planReplicationActions — escalations are surfaced, never pulled', () => {
	it('escalatedIds pass through verbatim and do NOT become targetedPulls', () => {
		const escalated = [repair(80, 'products', 'changed'), repair(81, 'variations', 'changed')];
		const actions = planReplicationActions(baseOutcome({ escalatedIds: escalated }));
		expect(actions.escalations).toEqual(escalated);
		expect(actions.targetedPulls).toEqual([]);
		expect(actions.deletes).toEqual([]);
	});
});

describe('planReplicationActions — multi-collection grouping', () => {
	it('groups and dedupes across collections from both changes and drill-down', () => {
		const actions = planReplicationActions(
			baseOutcome({
				changes: [
					change(1, 'products'),
					change(2, 'variations'),
					change(3, 'tax_rates', 'tax_rate.updated'),
				],
				idsToPull: [
					repair(2, 'variations'),
					repair(4, 'products'),
					repair(5, 'tax_rates', 'changed', 'range-checksum'),
				],
			})
		);
		expect(actions.targetedPulls).toEqual([
			{ collection: 'products', ids: [1, 4] },
			{ collection: 'variations', ids: [2] },
			{ collection: 'tax_rates', ids: [3, 5] },
		]);
	});
});

describe('planReplicationActions — nextState threads through', () => {
	it('carries cursor, baselineDigests, and configBaseline straight through', () => {
		const baselineDigests: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 1, digest: '99', match: true }],
		]);
		const cursor: SequenceCursor = { sequence: 42 };
		const configBaseline = { products: 'abc' };
		const actions = planReplicationActions(
			baseOutcome({ cursor, baselineDigests, configBaseline })
		);
		expect(actions.nextState.cursor).toEqual(cursor);
		expect(actions.nextState.baselineDigests).toBe(baselineDigests);
		expect(actions.nextState.configBaseline).toEqual(configBaseline);
	});

	it('omits configBaseline when the outcome had none', () => {
		const actions = planReplicationActions(baseOutcome());
		expect(actions.nextState.configBaseline).toBeUndefined();
	});
});

describe('planReplicationActions — empty outcome', () => {
	it('produces empty actions for an empty poll outcome', () => {
		const actions = planReplicationActions(baseOutcome());
		expect(actions.targetedPulls).toEqual([]);
		expect(actions.deletes).toEqual([]);
		expect(actions.reDeriveBarcode).toEqual([]);
		expect(actions.reFetchCollections).toEqual([]);
		expect(actions.escalations).toEqual([]);
	});
});
