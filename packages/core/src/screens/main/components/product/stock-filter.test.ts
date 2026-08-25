import { matchesStockStatusFilter } from './stock-filter';

describe('matchesStockStatusFilter', () => {
	it('admits every record when no filter is set', () => {
		for (const payload of [
			{ manage_stock: true, stock_quantity: 0, stock_status: 'outofstock' },
			{ manage_stock: false, stock_status: 'instock' },
			{},
		]) {
			expect(matchesStockStatusFilter(payload, undefined)).toBe(true);
			expect(matchesStockStatusFilter(payload, '')).toBe(true);
		}
	});

	it('matches the status WooCommerce would report for the record', () => {
		expect(
			matchesStockStatusFilter({ manage_stock: false, stock_status: 'outofstock' }, 'outofstock')
		).toBe(true);
		expect(
			matchesStockStatusFilter({ manage_stock: false, stock_status: 'outofstock' }, 'instock')
		).toBe(false);
		expect(
			matchesStockStatusFilter(
				{ manage_stock: true, stock_quantity: 0, backorders: 'notify' },
				'onbackorder'
			)
		).toBe(true);
	});

	it('treats a payload with no stock word at all as in stock, like WooCommerce does', () => {
		expect(matchesStockStatusFilter({}, 'instock')).toBe(true);
		expect(matchesStockStatusFilter({}, 'outofstock')).toBe(false);
	});

	it('follows a local quantity edit before the server echoes the status back', () => {
		// The cashier has just typed 5 into a variation the server still calls out of stock.
		const edited = { manage_stock: true, stock_quantity: 5, stock_status: 'outofstock' };

		expect(matchesStockStatusFilter(edited, 'instock')).toBe(true);
		expect(matchesStockStatusFilter(edited, 'outofstock')).toBe(false);
	});

	it("keeps a plugin's own status verbatim rather than rounding it to a built-in one", () => {
		const lowStock = { manage_stock: true, stock_quantity: 2, stock_status: 'lowstock' };

		expect(matchesStockStatusFilter(lowStock, 'lowstock')).toBe(true);
		expect(matchesStockStatusFilter(lowStock, 'instock')).toBe(false);
	});
});
