import type { CensusTotals } from '@wcpos/sync-engine';

import {
	censusFreshnessWindow,
	censusRefreshDue,
	censusWindowProgress,
	deriveCollectionRow,
	deriveEverythingElseBytes,
	deriveRows,
	estimateCollectionBytes,
	formatBytes,
	isReadyToSell,
	relativeTimeParts,
	stuckCountsByRow,
	summarizeOtherScopes,
	totalLocalRecords,
} from './database-logic';

function census(total: number, opts?: { fresh?: boolean; updatedAtMs?: number }) {
	const updatedAtMs = opts?.updatedAtMs ?? 1;
	return {
		total,
		updatedAtMs,
		freshUntilMs: updatedAtMs + 900_000,
		fresh: opts?.fresh ?? true,
	};
}

describe('database page logic', () => {
	it('shows % local only against a fresh authoritative census', () => {
		const fresh = deriveCollectionRow('products', 50, census(100));
		expect(fresh.percentLocal).toBe(50);
		expect(fresh.serverTotal).toBe(100);

		const stale = deriveCollectionRow('products', 50, census(100, { fresh: false }));
		expect(stale.percentLocal).toBeNull();
		expect(stale.serverTotal).toBeNull();

		const unknown = deriveCollectionRow('products', 50, null);
		expect(unknown.percentLocal).toBeNull();
		expect(unknown.serverTotal).toBeNull();
	});

	it('never computes a percentage for windowed orders even with a fresh census', () => {
		const orders = deriveCollectionRow('orders', 200, census(17887));
		expect(orders.windowed).toBe(true);
		expect(orders.percentLocal).toBeNull();
		// The server total itself IS shown for windowed rows — the policy text
		// explains why device ≠ server, the number stays honest.
		expect(orders.serverTotal).toBe(17887);
	});

	it('caps percentage at 100 when local exceeds a stale-but-fresh total', () => {
		const row = deriveCollectionRow('customers', 120, census(100));
		expect(row.percentLocal).toBe(100);
	});

	it('ready-to-sell is a milestone, not a full-sync gate', () => {
		const base = { connectivity: 'online' as const, gatedBy: null, bootstrapFailed: false };
		expect(isReadyToSell({ ...base, productsLocal: 1 })).toBe(true);
		// offline still sells
		expect(isReadyToSell({ ...base, connectivity: 'offline', productsLocal: 1 })).toBe(true);
		// no products yet — still preparing
		expect(isReadyToSell({ ...base, productsLocal: 0 })).toBe(false);
		// bootstrap failure / lifecycle gate block readiness
		expect(isReadyToSell({ ...base, bootstrapFailed: true, productsLocal: 5 })).toBe(false);
		expect(isReadyToSell({ ...base, gatedBy: 'bootstrap-failed', productsLocal: 5 })).toBe(false);
		expect(isReadyToSell({ ...base, gatedBy: 'lifecycle', productsLocal: 5 })).toBe(false);
		// offline is NOT a readiness blocker — a primed till sells offline
		expect(
			isReadyToSell({ ...base, connectivity: 'offline', gatedBy: 'offline', productsLocal: 5 })
		).toBe(true);
	});

	it('sums local records and formats bytes', () => {
		expect(totalLocalRecords({ a: 10, b: 5, c: NaN })).toBe(15);
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(90 * 1024 * 1024)).toBe('90 MB');
		expect(formatBytes(null)).toBeNull();
		expect(formatBytes(-1)).toBeNull();
	});

	it('derives rows in order', () => {
		const rows = deriveRows(['products', 'orders'], { products: 3, orders: 2 }, {
			products: census(3),
		} as never);
		expect(rows.map((r) => r.key)).toEqual(['products', 'orders']);
		expect(rows[0].percentLocal).toBe(100);
	});

	it('estimates collection bytes from a sample, or refuses honestly', () => {
		expect(estimateCollectionBytes(100, [1000, 2000])).toBe(150_000);
		expect(estimateCollectionBytes(0, [1000])).toBeNull();
		expect(estimateCollectionBytes(100, [])).toBeNull();
		expect(estimateCollectionBytes(100, [NaN, -5])).toBeNull();
	});

	it('derives the census freshness window from the entries themselves', () => {
		const totals = {
			products: { total: 10, updatedAtMs: 1_000, freshUntilMs: 5_000, fresh: true },
			customers: { total: 20, updatedAtMs: 3_000, freshUntilMs: 4_000, fresh: true },
			variations: null,
		} as unknown as CensusTotals;
		// Latest snapshot wins the "updated" line; the first expiry drives "next".
		expect(censusFreshnessWindow(totals)).toEqual({ updatedAtMs: 3_000, nextUpdateAtMs: 4_000 });
		expect(censusFreshnessWindow({} as CensusTotals)).toEqual({
			updatedAtMs: null,
			nextUpdateAtMs: null,
		});
	});

	it('reports a due refresh instead of counting down into the past', () => {
		// An expired entry means the 30s totals-retry lane refreshes imminently —
		// the footer says "refreshing now…" rather than "next update in ~just now".
		expect(censusRefreshDue({ nextUpdateAtMs: 1_000 }, 2_000)).toBe(true);
		expect(censusRefreshDue({ nextUpdateAtMs: 3_000 }, 2_000)).toBe(false);
		expect(censusRefreshDue({ nextUpdateAtMs: null }, 2_000)).toBe(false);
	});

	it('computes countdown progress across the freshness window', () => {
		const window = { updatedAtMs: 1_000, nextUpdateAtMs: 2_000 };
		expect(censusWindowProgress(window, 1_500)).toBe(0.5);
		expect(censusWindowProgress(window, 500)).toBe(0);
		expect(censusWindowProgress(window, 3_000)).toBe(1);
		expect(censusWindowProgress({ updatedAtMs: null, nextUpdateAtMs: null }, 1_500)).toBeNull();
		expect(censusWindowProgress({ updatedAtMs: 2_000, nextUpdateAtMs: 2_000 }, 2_000)).toBeNull();
	});

	it('buckets relative time for freshness copy', () => {
		expect(relativeTimeParts(0, 6_000)).toEqual({ unit: 'seconds', value: 6 });
		expect(relativeTimeParts(0, 130_000)).toEqual({ unit: 'minutes', value: 2 });
		expect(relativeTimeParts(0, 2 * 60 * 60_000)).toEqual({ unit: 'hours', value: 2 });
		// clock skew never yields negative ages
		expect(relativeTimeParts(10_000, 5_000)).toEqual({ unit: 'seconds', value: 0 });
	});
});

describe('stuckCountsByRow', () => {
	it('maps telemetry names to row keys and counts per collection', () => {
		expect(
			stuckCountsByRow([
				{ collection: 'products' },
				{ collection: 'products' },
				{ collection: 'tax_rates' },
				{ collection: 'mystery' },
			])
		).toEqual({ products: 2, taxRates: 1 });
	});
});

describe('deriveEverythingElseBytes', () => {
	it('reconciles the storage estimate against known rows and other stores', () => {
		expect(deriveEverythingElseBytes(100, [10, null, 20, undefined], 30)).toBe(40);
	});

	it('floors at zero and requires an estimate', () => {
		expect(deriveEverythingElseBytes(10, [50], null)).toBe(0);
		expect(deriveEverythingElseBytes(null, [50], 10)).toBeNull();
	});
});

describe('summarizeOtherScopes', () => {
	const active = 'pos_v6_abcdefabcdef_s578_c12';
	const entry = (db: string, bytes: number) => ({
		name: `rxdb-${db.replace(/\//g, '__')}`,
		bytes,
	});

	it('classifies other stores, other cashiers of the active store, and the active scope', () => {
		const summary = summarizeOtherScopes(
			[
				entry('pos_v6_abcdefabcdef_s578_c12', 100), // active scope — excluded entirely
				entry('pos_v6_abcdefabcdef_s578_c99', 40), // same store, other cashier — tracked separately
				entry('pos_v6_abcdefabcdef_s600_c12', 25),
				entry('pos_v6_abcdefabcdef_s600_c99', 25), // same other store, second cashier
				entry('pos_v6_feedfeedfeed_s578_c12', 10), // other SITE, same store id — counts
				entry('userdb_v6', 999), // not a scope db — ignored
			],
			active
		);
		expect(summary.storeCount).toBe(2);
		expect(summary.bytes).toBe(60);
		// Inactive cashier bytes must not be reported as "Everything else" —
		// they're tracked so the reconciliation can subtract them.
		expect(summary.sameStoreOtherCashierBytes).toBe(40);
	});

	it('treats a null active name as "everything is other"', () => {
		const summary = summarizeOtherScopes([entry('pos_v6_abcdefabcdef_s578_c12', 100)], null);
		expect(summary).toEqual({ storeCount: 1, bytes: 100, sameStoreOtherCashierBytes: 0 });
	});

	it('ignores non-rxdb entries', () => {
		expect(
			summarizeOtherScopes([{ name: 'pos_v6_abcdefabcdef_s578_c12', bytes: 5 }], null)
		).toEqual({ storeCount: 0, bytes: 0, sameStoreOtherCashierBytes: 0 });
	});
});
