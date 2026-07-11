/**
 * Unit tests for the pure apply decision tree — the ONE place a routed
 * `ReplicationActions` plan is turned into concrete replication work, via thin
 * host handlers. This is the module both hosts (web scheduler, playground
 * LabController) become adapters over, so the "apply a change signal" decision
 * tree is decided once (the drift these tests lock shut: the playground used to
 * skip tax-rate updates and barcode re-derive entirely).
 *
 * The applier is PURE: no rxdb/fetch/DOM/timers — every side effect is an
 * injected handler. Each arm is pinned here (TDD): products pull/delete (+ the
 * scope-guarded shortfall surface), tax-rate refresh + tombstone delete, barcode
 * re-derive → apply / re-fetch fallback, variation deferral, escalation surface,
 * and the ADR-0005 persist-only-after-every-handler-succeeded invariant.
 */

import { describe, expect, it } from 'vitest';

import { type SyncEvent } from './telemetry';
import {
	applyReplicationActions,
	type ReplicationActionHandlers,
	type SyncedDocument,
} from './applyReplicationActions';
import { type RebuildBarcodeIndexResult } from './barcodeResolve';

import type { ReplicationActions } from './changeSignalReplication';
import type { HybridCollection, ReferenceCollection } from './hybridChangeSignal';

function actions(overrides: Partial<ReplicationActions> = {}): ReplicationActions {
	return {
		targetedPulls: [],
		deletes: [],
		reDeriveBarcode: [],
		reFetchCollections: [],
		escalations: [],
		nextState: { cursor: { sequence: 0 }, baselineDigests: new Map() },
		...overrides,
	};
}

type Recorder = {
	pulledIds: number[][];
	deletedIds: number[][];
	pulledVariationIds: number[][];
	variationDeletedIds: number[][];
	pulledCustomerIds: number[][];
	customerDeletedIds: number[][];
	taxRateDeletedIds: number[][];
	refreshCount: number;
	referenceRefreshes: ReferenceCollection[];
	loadedCollections: HybridCollection[];
	appliedBarcode: HybridCollection[];
	reFetched: HybridCollection[];
	persisted: ReplicationActions['nextState'][];
	logs: string[];
	events: SyncEvent[];
	order: string[];
};

/**
 * Behaviour knobs control only the VARIABLE parts of a handler (its return value
 * / read result / a side-channel observer); the handlers themselves always
 * record into `calls`, so overriding behaviour never silences the recorder.
 */
type FakeOptions = {
	pull?: (ids: number[]) => number | Promise<number>;
	pullVariations?: (ids: number[]) => number | Promise<number>;
	pullCustomers?: (ids: number[]) => number | Promise<number>;
	deleteCustomersResult?: (ids: number[]) => number | Promise<number>;
	deleteProductsResult?: (ids: number[]) => number | Promise<number>;
	deleteTaxRatesResult?: (ids: number[]) => number | Promise<number>;
	refresh?: () => void;
	docs?: (collection: HybridCollection) => SyncedDocument[] | Promise<SyncedDocument[]>;
	reFetchResult?: (collection: HybridCollection) => number | Promise<number>;
	onApplyBarcode?: (collection: HybridCollection, index: RebuildBarcodeIndexResult) => void;
	applyBarcodeResult?: (collection: HybridCollection) => boolean;
};

function fakeHandlers(opts: FakeOptions = {}): {
	handlers: ReplicationActionHandlers;
	calls: Recorder;
} {
	const calls: Recorder = {
		pulledIds: [],
		deletedIds: [],
		pulledVariationIds: [],
		variationDeletedIds: [],
		pulledCustomerIds: [],
		customerDeletedIds: [],
		taxRateDeletedIds: [],
		refreshCount: 0,
		referenceRefreshes: [],
		loadedCollections: [],
		appliedBarcode: [],
		reFetched: [],
		persisted: [],
		logs: [],
		events: [],
		order: [],
	};
	const handlers: ReplicationActionHandlers = {
		pullProducts: async (ids) => {
			calls.pulledIds.push([...ids]);
			calls.order.push('pullProducts');
			return opts.pull ? opts.pull(ids) : ids.length;
		},
		deleteProducts: async (ids) => {
			calls.deletedIds.push([...ids]);
			calls.order.push('deleteProducts');
			return opts.deleteProductsResult ? opts.deleteProductsResult(ids) : ids.length;
		},
		pullVariations: async (ids) => {
			calls.pulledVariationIds.push([...ids]);
			calls.order.push('pullVariations');
			return opts.pullVariations ? opts.pullVariations(ids) : ids.length;
		},
		deleteVariations: async (ids) => {
			calls.variationDeletedIds.push([...ids]);
			calls.order.push('deleteVariations');
			return ids.length;
		},
		pullCustomers: async (ids) => {
			calls.pulledCustomerIds.push([...ids]);
			calls.order.push('pullCustomers');
			return opts.pullCustomers ? opts.pullCustomers(ids) : ids.length;
		},
		deleteCustomers: async (ids) => {
			calls.customerDeletedIds.push([...ids]);
			calls.order.push('deleteCustomers');
			return opts.deleteCustomersResult ? opts.deleteCustomersResult(ids) : ids.length;
		},
		refreshTaxRates: async () => {
			calls.refreshCount += 1;
			calls.order.push('refreshTaxRates');
			opts.refresh?.();
		},
		refreshReferenceCollection: async (collection) => {
			calls.referenceRefreshes.push(collection);
			calls.order.push('refreshReferenceCollection');
		},
		deleteTaxRates: async (ids) => {
			calls.taxRateDeletedIds.push([...ids]);
			calls.order.push('deleteTaxRates');
			return opts.deleteTaxRatesResult ? opts.deleteTaxRatesResult(ids) : ids.length;
		},
		loadSyncedDocs: async (collection) => {
			calls.loadedCollections.push(collection);
			calls.order.push('loadSyncedDocs');
			return opts.docs ? opts.docs(collection) : [];
		},
		applyBarcodeIndex: (collection, index) => {
			calls.appliedBarcode.push(collection);
			calls.order.push('applyBarcodeIndex');
			opts.onApplyBarcode?.(collection, index);
			return opts.applyBarcodeResult ? opts.applyBarcodeResult(collection) : true;
		},
		reFetchCollection: async (collection) => {
			calls.reFetched.push(collection);
			calls.order.push('reFetchCollection');
			return opts.reFetchResult ? opts.reFetchResult(collection) : 0;
		},
		persistState: async (state) => {
			calls.persisted.push(state);
			calls.order.push('persistState');
		},
		log: (line) => calls.logs.push(line),
		observe: (event) => calls.events.push(event),
	};
	return { handlers, calls };
}

describe('applyReplicationActions — products', () => {
	it('routes product targetedPulls to pullProducts and reports the applied count', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({
				targetedPulls: [
					{ collection: 'products', ids: [11, 10] },
					{ collection: 'variations', ids: [20] },
				],
			}),
			handlers
		);

		// products only; ids deduped + sorted; variations never reach pullProducts.
		expect(calls.pulledIds).toEqual([[10, 11]]);
		expect(result.targetedProductIds).toEqual([10, 11]);
		expect(result.appliedProductCount).toBe(2);
		expect(result.targetedVariationIds).toEqual([20]);
	});

	it('surfaces a product pull that did not fully apply (scope-guarded shortfall, not silently consumed)', async () => {
		const { handlers, calls } = fakeHandlers({ pull: () => 0 });
		const result = await applyReplicationActions(
			actions({ targetedPulls: [{ collection: 'products', ids: [7] }] }),
			handlers
		);

		expect(result.appliedProductCount).toBe(0);
		expect(calls.logs.some((line) => /WARNING targeted pull applied 0\/1/.test(line))).toBe(true);
	});

	it('routes product deletes to deleteProducts and reports the applied count', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ deletes: [{ collection: 'products', ids: [50] }] }),
			handlers
		);

		expect(calls.deletedIds).toEqual([[50]]);
		expect(result.deletedProductIds).toEqual([50]);
		expect(result.appliedDeleteCount).toBe(1);
		// a product pull was NOT triggered for a delete-only outcome.
		expect(calls.pulledIds).toEqual([]);
	});

	it('surfaces a product delete that did not fully apply', async () => {
		const { handlers, calls } = fakeHandlers({ deleteProductsResult: () => 0 });
		const result = await applyReplicationActions(
			actions({ deletes: [{ collection: 'products', ids: [50] }] }),
			handlers
		);

		expect(result.appliedDeleteCount).toBe(0);
		expect(calls.logs.some((line) => /WARNING product delete applied 0\/1/.test(line))).toBe(true);
	});
});

describe('applyReplicationActions — tax rates', () => {
	it('refreshes the tax_rates collection on a tax-rate UPDATE/ADD', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ targetedPulls: [{ collection: 'tax_rates', ids: [99] }] }),
			handlers
		);

		expect(calls.refreshCount).toBe(1);
		expect(result.taxRatesRefreshed).toBe(true);
		// tax-rate UPDATE/ADD rides the full refresh, NOT the product pull lane.
		expect(calls.pulledIds).toEqual([]);
	});

	it('refreshes the tax_rates collection on a config-stale tax_rates (reFetchCollections branch), skipping the generic re-fetch', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ reFetchCollections: ['tax_rates'] }),
			handlers
		);

		expect(calls.refreshCount).toBe(1);
		expect(result.taxRatesRefreshed).toBe(true);
		// tax_rates is handled by the refresh, never by the generic reFetchCollection.
		expect(calls.reFetched).toEqual([]);
	});

	it('deletes a tax_rate tombstone locally and does NOT refresh (the upsert-only refresh never prunes)', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ deletes: [{ collection: 'tax_rates', ids: [99] }] }),
			handlers
		);

		expect(calls.taxRateDeletedIds).toEqual([[99]]);
		expect(result.taxRateDeleteIds).toEqual([99]);
		expect(result.appliedTaxRateDeleteCount).toBe(1);
		expect(result.taxRatesRefreshed).toBe(false);
		expect(calls.refreshCount).toBe(0);
		// a tax-rate tombstone is not a product delete.
		expect(calls.deletedIds).toEqual([]);
	});

	it('surfaces a tax-rate tombstone delete that did not fully apply', async () => {
		const { handlers, calls } = fakeHandlers({ deleteTaxRatesResult: () => 0 });
		const result = await applyReplicationActions(
			actions({ deletes: [{ collection: 'tax_rates', ids: [99] }] }),
			handlers
		);

		expect(result.appliedTaxRateDeleteCount).toBe(0);
		expect(calls.logs.some((line) => /WARNING tax-rate delete applied 0\/1/.test(line))).toBe(true);
	});
});

describe('applyReplicationActions — barcode re-derive', () => {
	it('re-derives + applies the barcode index locally when the active field is present', async () => {
		const docs: SyncedDocument[] = [
			{ id: 'woo-product:1', payload: { sku: 'A', global_unique_id: 'g1' } },
			{ id: 'woo-product:2', payload: { sku: 'B', global_unique_id: 'g2' } },
		];
		const { handlers, calls } = fakeHandlers({ docs: () => docs });
		const result = await applyReplicationActions(
			actions({
				reDeriveBarcode: [{ collection: 'products', activeFields: ['global_unique_id'] }],
			}),
			handlers
		);

		expect(calls.loadedCollections).toEqual(['products']);
		expect(calls.appliedBarcode).toEqual(['products']);
		expect(calls.reFetched).toEqual([]);
		expect(result.reDerived).toEqual([{ collection: 'products', rederived: true }]);
	});

	it('passes the rebuilt index (built by the active field) to applyBarcodeIndex', async () => {
		const docs: SyncedDocument[] = [{ id: 'woo-product:1', payload: { global_unique_id: 'g1' } }];
		const applied: { collection: HybridCollection; codes: string[] }[] = [];
		const { handlers } = fakeHandlers({
			docs: () => docs,
			onApplyBarcode: (collection, index) => {
				applied.push({ collection, codes: [...index.index.keys()] });
			},
		});

		await applyReplicationActions(
			actions({
				reDeriveBarcode: [{ collection: 'products', activeFields: ['global_unique_id'] }],
			}),
			handlers
		);

		expect(applied).toEqual([{ collection: 'products', codes: ['g1'] }]);
	});

	it('falls back to a re-fetch when the active field was never synced (stale collection)', async () => {
		const docs: SyncedDocument[] = [{ id: 'woo-product:1', payload: { sku: 'A' } }];
		const { handlers, calls } = fakeHandlers({
			docs: () => docs,
			reFetchResult: () => 1,
		});
		const result = await applyReplicationActions(
			actions({
				reDeriveBarcode: [{ collection: 'products', activeFields: ['global_unique_id'] }],
			}),
			handlers
		);

		expect(calls.appliedBarcode).toEqual([]);
		expect(calls.reFetched).toEqual(['products']);
		expect(result.reDerived).toEqual([{ collection: 'products', rederived: false }]);
	});

	it('surfaces a barcode re-derive the host DECLINED to apply (e.g. a scope-guard drop), not a false success', async () => {
		const docs: SyncedDocument[] = [{ id: 'woo-product:1', payload: { global_unique_id: 'g1' } }];
		const { handlers, calls } = fakeHandlers({ docs: () => docs, applyBarcodeResult: () => false });
		const result = await applyReplicationActions(
			actions({
				reDeriveBarcode: [{ collection: 'products', activeFields: ['global_unique_id'] }],
			}),
			handlers
		);

		// The rebuild succeeded (NOT stale → no re-fetch), but the host declined the
		// write → reported as not re-derived + a WARNING, never a false success.
		expect(calls.reFetched).toEqual([]);
		expect(result.reDerived).toEqual([{ collection: 'products', rederived: false }]);
		expect(
			calls.logs.some((line) => /WARNING products barcode re-derive not applied/.test(line))
		).toBe(true);
	});
});

describe('applyReplicationActions — re-fetch collections without a barcode field', () => {
	it('re-fetches a stale products collection that reported no barcode field', async () => {
		const { handlers, calls } = fakeHandlers({ reFetchResult: () => 3 });
		await applyReplicationActions(actions({ reFetchCollections: ['products'] }), handlers);
		expect(calls.reFetched).toEqual(['products']);
	});
});

describe('applyReplicationActions — variations pull + delete via the variation lane', () => {
	it('pulls variation targetedPulls and deletes variation tombstones through the variation handlers', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({
				targetedPulls: [{ collection: 'variations', ids: [21, 20] }],
				deletes: [{ collection: 'variations', ids: [22] }],
			}),
			handlers
		);

		// Pulls go through pullVariations (deduped + sorted); deletes through deleteVariations.
		expect(result.targetedVariationIds).toEqual([20, 21]);
		expect(result.appliedVariationCount).toBe(2);
		expect(calls.pulledVariationIds).toEqual([[20, 21]]);
		expect(result.variationDeleteIds).toEqual([22]);
		expect(result.appliedVariationDeleteCount).toBe(1);
		expect(calls.variationDeletedIds).toEqual([[22]]);
		// Variations never touch the PRODUCT handlers.
		expect(calls.pulledIds).toEqual([]);
		expect(calls.deletedIds).toEqual([]);
	});

	it('pulls customer targetedPulls and deletes customer tombstones through the customer handlers', async () => {
		const { handlers, calls } = fakeHandlers({ deleteCustomersResult: () => 1 });
		const result = await applyReplicationActions(
			actions({
				targetedPulls: [{ collection: 'customers', ids: [305, 300] }],
				deletes: [{ collection: 'customers', ids: [311] }],
			}),
			handlers
		);

		// Pulls go through pullCustomers (deduped + sorted); deletes through deleteCustomers.
		expect(result.targetedCustomerIds).toEqual([300, 305]);
		expect(result.appliedCustomerCount).toBe(2);
		expect(calls.pulledCustomerIds).toEqual([[300, 305]]);
		expect(result.customerDeleteIds).toEqual([311]);
		expect(result.appliedCustomerDeleteCount).toBe(1);
		expect(calls.customerDeletedIds).toEqual([[311]]);
		// Customers never touch the PRODUCT / VARIATION handlers.
		expect(calls.pulledIds).toEqual([]);
		expect(calls.pulledVariationIds).toEqual([]);
	});

	it('surfaces a short customer pull (fewer applied than requested) via a WARN log', async () => {
		const { handlers, calls } = fakeHandlers({ pullCustomers: () => 1 });
		const result = await applyReplicationActions(
			actions({ targetedPulls: [{ collection: 'customers', ids: [300, 301] }] }),
			handlers
		);

		expect(result.appliedCustomerCount).toBe(1); // 1 of 2 applied — a shortfall
		expect(
			calls.logs.some((line) => line.includes('WARNING targeted customer pull applied 1/2'))
		).toBe(true);
	});

	it('refreshes a reference collection on a CREATE/UPDATE (targetedPulls) via the single greedy lane', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ targetedPulls: [{ collection: 'coupons', ids: [70] }] }),
			handlers
		);

		expect(result.refreshedReferenceCollections).toEqual(['coupons']);
		expect(calls.referenceRefreshes).toEqual(['coupons']);
		// Reference collections never ride the per-id product/customer pull lanes.
		expect(calls.pulledIds).toEqual([]);
		expect(calls.pulledCustomerIds).toEqual([]);
	});

	it('refreshes a reference collection on a DELETE too — the prunable greedy pull removes it (no separate delete arm)', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ deletes: [{ collection: 'brands', ids: [81] }] }),
			handlers
		);

		expect(result.refreshedReferenceCollections).toEqual(['brands']);
		expect(calls.referenceRefreshes).toEqual(['brands']);
	});

	it('refreshes EACH changed reference collection once, in a stable order', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({
				targetedPulls: [
					{ collection: 'tags', ids: [7] },
					{ collection: 'categories', ids: [8] },
				],
				deletes: [{ collection: 'coupons', ids: [9] }],
			}),
			handlers
		);

		// Stable REFERENCE_COLLECTIONS order: categories, brands, tags, coupons (brands absent).
		expect(result.refreshedReferenceCollections).toEqual(['categories', 'tags', 'coupons']);
		expect(calls.referenceRefreshes).toEqual(['categories', 'tags', 'coupons']);
	});

	it('does NOT refresh any reference collection when none changed', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ targetedPulls: [{ collection: 'products', ids: [10] }] }),
			handlers
		);

		expect(result.refreshedReferenceCollections).toEqual([]);
		expect(calls.referenceRefreshes).toEqual([]);
	});
});

describe('applyReplicationActions — escalations are surfaced, never pulled', () => {
	it('logs escalations and does not seed a pull for them', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({
				escalations: [
					{ id: 80, collection: 'products', status: 'changed', detector: 'hash-checksum' },
				],
			}),
			handlers
		);

		expect(result.escalations).toHaveLength(1);
		expect(calls.pulledIds).toEqual([]);
		expect(calls.logs.some((line) => /escalat/i.test(line) && line.includes('80'))).toBe(true);
	});
});

describe('applyReplicationActions — persist-only-after-every-handler-succeeded (ADR 0005)', () => {
	it('persists the advanced nextState exactly once after a successful tick', async () => {
		const nextState = {
			cursor: { sequence: 42 },
			baselineDigests: new Map(),
			configBaseline: { products: 'abc' },
		};
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(
			actions({ targetedPulls: [{ collection: 'products', ids: [10] }], nextState }),
			handlers
		);

		expect(calls.persisted).toEqual([nextState]);
		expect(result.persisted).toBe(true);
	});

	it('does NOT persist when the FIRST handler throws (early abort skips the commit)', async () => {
		const boom = new Error('pull failed');
		const { handlers, calls } = fakeHandlers({
			pull: () => {
				throw boom;
			},
		});

		await expect(
			applyReplicationActions(
				actions({ targetedPulls: [{ collection: 'products', ids: [10] }] }),
				handlers
			)
		).rejects.toThrow('pull failed');

		expect(calls.persisted).toEqual([]);
	});

	it('does NOT persist when a LATE handler throws — proving persistState runs strictly LAST', async () => {
		// refreshTaxRates runs AFTER the product pull (and the delete arms). A
		// throw there must still skip persist — pinning that persist is last, not
		// merely that an early abort skips it.
		const { handlers, calls } = fakeHandlers({
			refresh: () => {
				throw new Error('refresh failed');
			},
		});

		await expect(
			applyReplicationActions(
				actions({
					targetedPulls: [
						{ collection: 'products', ids: [10] },
						{ collection: 'tax_rates', ids: [99] },
					],
				}),
				handlers
			)
		).rejects.toThrow('refresh failed');

		// The earlier product pull DID run (so the throw was genuinely from a later
		// handler), yet the cursor was NOT committed.
		expect(calls.pulledIds).toEqual([[10]]);
		expect(calls.persisted).toEqual([]);
	});

	it('drives a fully-loaded mixed plan through one tick — every arm fires, fields do not cross', async () => {
		const docs: SyncedDocument[] = [{ id: 'woo-product:10', payload: { global_unique_id: 'g10' } }];
		const { handlers, calls } = fakeHandlers({ docs: () => docs });
		const result = await applyReplicationActions(
			actions({
				targetedPulls: [
					{ collection: 'products', ids: [10] },
					{ collection: 'variations', ids: [20] },
					{ collection: 'tax_rates', ids: [99] },
				],
				deletes: [
					{ collection: 'products', ids: [50] },
					{ collection: 'tax_rates', ids: [98] },
				],
				reDeriveBarcode: [{ collection: 'products', activeFields: ['global_unique_id'] }],
				reFetchCollections: ['variations'],
				escalations: [
					{ id: 80, collection: 'products', status: 'changed', detector: 'hash-checksum' },
				],
			}),
			handlers
		);

		// Every arm fired exactly once, on the right ids/collection.
		expect(calls.pulledIds).toEqual([[10]]);
		expect(calls.deletedIds).toEqual([[50]]);
		expect(calls.taxRateDeletedIds).toEqual([[98]]);
		expect(calls.refreshCount).toBe(1);
		expect(calls.appliedBarcode).toEqual(['products']);
		expect(calls.reFetched).toEqual(['variations']);
		expect(calls.persisted).toHaveLength(1);

		// Result fields are independent — none leaked into another arm's slot.
		expect(result.targetedProductIds).toEqual([10]);
		expect(result.appliedProductCount).toBe(1);
		expect(result.deletedProductIds).toEqual([50]);
		expect(result.appliedDeleteCount).toBe(1);
		expect(result.taxRateDeleteIds).toEqual([98]);
		expect(result.appliedTaxRateDeleteCount).toBe(1);
		expect(result.taxRatesRefreshed).toBe(true);
		expect(result.reDerived).toEqual([{ collection: 'products', rederived: true }]);
		expect(result.targetedVariationIds).toEqual([20]);
		expect(result.escalations).toHaveLength(1);
		expect(result.persisted).toBe(true);
	});

	it('applies the barcode index BEFORE persisting (so the config baseline never advances ahead of the index)', async () => {
		const docs: SyncedDocument[] = [{ id: 'woo-product:1', payload: { global_unique_id: 'g1' } }];
		const { handlers, calls } = fakeHandlers({ docs: () => docs });
		await applyReplicationActions(
			actions({
				reDeriveBarcode: [{ collection: 'products', activeFields: ['global_unique_id'] }],
			}),
			handlers
		);

		expect(calls.order.indexOf('applyBarcodeIndex')).toBeLessThan(
			calls.order.indexOf('persistState')
		);
	});

	it('persists even on an empty outcome and does no other handler work', async () => {
		const { handlers, calls } = fakeHandlers();
		const result = await applyReplicationActions(actions(), handlers);

		expect(calls.pulledIds).toEqual([]);
		expect(calls.deletedIds).toEqual([]);
		expect(calls.refreshCount).toBe(0);
		expect(calls.reFetched).toEqual([]);
		expect(calls.persisted).toHaveLength(1);
		expect(result.persisted).toBe(true);
	});
});

describe('applyReplicationActions — telemetry (observe seam)', () => {
	const ofType = (events: SyncEvent[], type: string) => events.filter((e) => e.type === type);

	it('emits apply.pull / apply.delete per collection with { requested, applied }', async () => {
		const { handlers, calls } = fakeHandlers();
		await applyReplicationActions(
			actions({
				targetedPulls: [
					{ collection: 'products', ids: [10, 11] },
					{ collection: 'variations', ids: [20] },
				],
				deletes: [
					{ collection: 'products', ids: [50] },
					{ collection: 'tax_rates', ids: [5] },
					{ collection: 'variations', ids: [21] },
				],
			}),
			handlers
		);

		expect(ofType(calls.events, 'apply.pull')).toEqual([
			{
				type: 'apply.pull',
				level: 'info',
				collection: 'products',
				fields: { requested: 2, applied: 2 },
			},
			{
				type: 'apply.pull',
				level: 'info',
				collection: 'variations',
				fields: { requested: 1, applied: 1 },
			},
		]);
		expect(ofType(calls.events, 'apply.delete')).toEqual([
			{
				type: 'apply.delete',
				level: 'info',
				collection: 'products',
				fields: { requested: 1, applied: 1 },
			},
			{
				type: 'apply.delete',
				level: 'info',
				collection: 'tax_rates',
				fields: { requested: 1, applied: 1 },
			},
			{
				type: 'apply.delete',
				level: 'info',
				collection: 'variations',
				fields: { requested: 1, applied: 1 },
			},
		]);
	});

	it('emits a warn-level event on a shortfall (applied < requested)', async () => {
		const { handlers, calls } = fakeHandlers({ pull: () => 0 });
		await applyReplicationActions(
			actions({ targetedPulls: [{ collection: 'products', ids: [7] }] }),
			handlers
		);
		expect(ofType(calls.events, 'apply.pull')).toEqual([
			{
				type: 'apply.pull',
				level: 'warn',
				collection: 'products',
				fields: { requested: 1, applied: 0 },
			},
		]);
	});

	it('emits apply.refresh for a tax-rate refresh and apply.escalation (warn) for stuck records', async () => {
		const { handlers, calls } = fakeHandlers();
		await applyReplicationActions(
			actions({
				reFetchCollections: ['tax_rates'], // routes to refreshTaxRates (step 4)
				escalations: [
					{ id: 80, collection: 'products', status: 'changed', detector: 'hash-checksum' },
				],
			}),
			handlers
		);
		expect(ofType(calls.events, 'apply.refresh')).toEqual([
			{ type: 'apply.refresh', level: 'info', collection: 'tax_rates' },
		]);
		expect(ofType(calls.events, 'apply.escalation')).toEqual([
			{
				type: 'apply.escalation',
				level: 'warn',
				collection: 'products',
				fields: { id: 80, status: 'changed', detector: 'hash-checksum' },
			},
		]);
	});

	it('is a no-op when no observe handler is wired (optional seam)', async () => {
		const { handlers, calls } = fakeHandlers();
		const noObserve: ReplicationActionHandlers = { ...handlers, observe: undefined };
		await expect(
			applyReplicationActions(
				actions({ targetedPulls: [{ collection: 'products', ids: [1] }] }),
				noObserve
			)
		).resolves.toBeDefined();
		expect(calls.events).toEqual([]);
	});

	it('a throwing observer is best-effort — it never breaks apply or skips persistState', async () => {
		const { handlers, calls } = fakeHandlers();
		const throwing: ReplicationActionHandlers = {
			...handlers,
			observe: () => {
				throw new Error('telemetry sink down');
			},
		};
		await expect(
			applyReplicationActions(
				actions({ targetedPulls: [{ collection: 'products', ids: [1] }] }),
				throwing
			)
		).resolves.toBeDefined();
		expect(calls.pulledIds).toEqual([[1]]); // the apply still ran
		expect(calls.persisted).toHaveLength(1); // and the commit still happened
	});
});
