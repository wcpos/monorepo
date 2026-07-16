import {
	deriveCollectionRow,
	deriveRows,
	formatBytes,
	isReadyToSell,
	totalLocalRecords,
} from './database-logic';

describe('database page logic', () => {
	it('shows % local only against a fresh authoritative census', () => {
		const fresh = deriveCollectionRow('products', 50, {
			total: 100,
			updatedAtMs: 1,
			fresh: true,
		});
		expect(fresh.percentLocal).toBe(50);
		expect(fresh.serverTotal).toBe(100);

		const stale = deriveCollectionRow('products', 50, { total: 100, updatedAtMs: 1, fresh: false });
		expect(stale.percentLocal).toBeNull();
		expect(stale.serverTotal).toBeNull();

		const unknown = deriveCollectionRow('products', 50, null);
		expect(unknown.percentLocal).toBeNull();
		expect(unknown.serverTotal).toBeNull();
	});

	it('never computes a percentage for windowed orders even with a fresh census', () => {
		const orders = deriveCollectionRow('orders', 200, {
			total: 17887,
			updatedAtMs: 1,
			fresh: true,
		});
		expect(orders.windowed).toBe(true);
		expect(orders.percentLocal).toBeNull();
	});

	it('caps percentage at 100 when local exceeds a stale-but-fresh total', () => {
		const row = deriveCollectionRow('customers', 120, { total: 100, updatedAtMs: 1, fresh: true });
		expect(row.percentLocal).toBe(100);
	});

	it('ready-to-sell is a milestone, not a full-sync gate', () => {
		const base = { connectivity: 'online' as const, gatedBy: null, bootstrapFailed: false };
		expect(isReadyToSell({ ...base, productsLocal: 1 })).toBe(true);
		// offline still sells
		expect(isReadyToSell({ ...base, connectivity: 'offline', productsLocal: 1 })).toBe(true);
		// no products yet — still preparing
		expect(isReadyToSell({ ...base, productsLocal: 0 })).toBe(false);
		// bootstrap failure / any engine gate block readiness
		expect(isReadyToSell({ ...base, bootstrapFailed: true, productsLocal: 5 })).toBe(false);
		expect(isReadyToSell({ ...base, gatedBy: 'lifecycle', productsLocal: 5 })).toBe(false);
		expect(isReadyToSell({ ...base, gatedBy: 'first-window', productsLocal: 5 })).toBe(false);
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
			products: { total: 3, updatedAtMs: 1, fresh: true },
		} as never);
		expect(rows.map((r) => r.key)).toEqual(['products', 'orders']);
		expect(rows[0].percentLocal).toBe(100);
	});
});
