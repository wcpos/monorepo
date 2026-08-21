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
		rebaseline: false,
		sweepRan: false,
		sweepIncomplete: false,
		integrityMismatches: [],
		idsToPull: [],
		escalatedIds: [],
		clearedEscalations: [],
		escalationLedger: [],
		baselineDigests,
		...overrides,
	};
}

function change(id: number, collection: HybridChange['collection'], deleted = false): HybridChange {
	return { id, collection, deleted, source: 'sequence-log' };
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
			baseOutcome({ changes: [change(10, 'products'), change(10, 'products')] })
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
	it('routes deleted changes into deletes, NOT targetedPulls', () => {
		const actions = planReplicationActions(
			baseOutcome({
				changes: [change(50, 'products', true), change(51, 'products', true)],
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
				changes: [change(70, 'products'), change(70, 'products', true)],
			})
		);
		expect(actions.deletes).toEqual([{ collection: 'products', ids: [70] }]);
		expect(actions.targetedPulls).toEqual([]);
	});
});

describe('planReplicationActions — config staleness split', () => {
	it('a stale collection WITH configBarcodeFields routes to a full re-fetch for re-materialization', () => {
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
		expect(actions.reDeriveBarcode).toEqual([]);
		expect(actions.reFetchCollections).toEqual(['products']);
	});

	it('a stale collection WITHOUT configBarcodeFields is tolerated without clearing local barcodes', () => {
		const actions = planReplicationActions(baseOutcome({ staleCollections: ['variations'] }));
		expect(actions.reFetchCollections).toEqual([]);
		expect(actions.reDeriveBarcode).toEqual([]);
	});

	it('an empty barcode field list leaves the collection untouched', () => {
		const actions = planReplicationActions(
			baseOutcome({
				staleCollections: ['products'],
				configBarcodeFields: { products: [], variations: [], tax_rates: [] },
			})
		);
		expect(actions.reFetchCollections).toEqual([]);
		expect(actions.reDeriveBarcode).toEqual([]);
	});

	it('splits mixed stale collections by field presence', () => {
		const actions = planReplicationActions(
			baseOutcome({
				staleCollections: ['products', 'tax_rates'],
				configBarcodeFields: { products: ['sku'], variations: [], tax_rates: [] },
			})
		);
		expect(actions.reDeriveBarcode).toEqual([]);
		expect(actions.reFetchCollections).toEqual(['products', 'tax_rates']);
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

	it('threads escalation clears and the retained ledger verbatim', () => {
		const cleared = [repair(80, 'products')];
		const retained = [repair(81, 'variations')];
		const actions = planReplicationActions(
			baseOutcome({ clearedEscalations: cleared, escalationLedger: retained })
		);

		expect(actions.escalationClears).toEqual(cleared);
		expect(actions.nextState.escalations).toEqual(retained);
	});
});

describe('planReplicationActions — multi-collection grouping', () => {
	it('groups and dedupes across collections from both changes and drill-down', () => {
		const actions = planReplicationActions(
			baseOutcome({
				changes: [change(1, 'products'), change(2, 'variations'), change(3, 'tax_rates')],
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
	it('carries cursor, baselineDigests, configBaseline, and epoch straight through', () => {
		const baselineDigests: BaselineDigests = new Map([
			['hash-checksum:0', { detector: 'hash-checksum', count: 1, digest: '99', match: true }],
		]);
		const cursor: SequenceCursor = { sequence: 42 };
		const configBaseline = { products: 'abc' };
		const actions = planReplicationActions(
			baseOutcome({ cursor, baselineDigests, configBaseline, epoch: 'epoch-A' })
		);
		expect(actions.nextState.cursor).toEqual(cursor);
		expect(actions.nextState.baselineDigests).toBe(baselineDigests);
		expect(actions.nextState.configBaseline).toEqual(configBaseline);
		expect(actions.nextState.epoch).toBe('epoch-A');
	});

	it('omits configBaseline when the outcome had none', () => {
		const actions = planReplicationActions(baseOutcome());
		expect(actions.nextState.configBaseline).toBeUndefined();
	});
});

describe('planReplicationActions — rebaseline', () => {
	it('refreshes every hybrid collection without planning targeted pulls or deletes', () => {
		const actions = planReplicationActions(baseOutcome({ rebaseline: true }));

		expect(actions.rebaselineCollections).toEqual([
			'products',
			'variations',
			'customers',
			'tax_rates',
			'categories',
			'brands',
			'tags',
			'coupons',
		]);
		expect(actions.targetedPulls).toEqual([]);
		expect(actions.deletes).toEqual([]);
	});

	it('plans no rebaseline collections for existing outcomes', () => {
		expect(planReplicationActions(baseOutcome()).rebaselineCollections).toEqual([]);
	});
});

describe('planReplicationActions — empty outcome', () => {
	it('produces empty actions for an empty poll outcome', () => {
		const actions = planReplicationActions(baseOutcome());
		expect(actions.targetedPulls).toEqual([]);
		expect(actions.deletes).toEqual([]);
		expect(actions.reDeriveBarcode).toEqual([]);
		expect(actions.reFetchCollections).toEqual([]);
		expect(actions.rebaselineCollections).toEqual([]);
		expect(actions.escalations).toEqual([]);
	});
});
