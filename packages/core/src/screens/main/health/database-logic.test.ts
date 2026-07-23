import type { CensusTotals } from '@wcpos/query';

import {
	censusFreshnessWindow,
	censusWindowProgress,
	deriveCollectionRow,
	deriveRows,
	estimateCollectionBytes,
	formatBytes,
	isReadyToSell,
	relativeTimeParts,
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
