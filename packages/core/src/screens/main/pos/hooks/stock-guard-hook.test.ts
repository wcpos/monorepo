import { type ActionEventInput, createActionContext } from '../../../../extensions/actions';
import { stockGuardOnAdd, stockGuardOnUpdate } from './stock-guard-hook';

const readCatalog = jest.fn();
const log = jest.fn();
const next = jest.fn();
const ctx = createActionContext({ log, t: (key) => key, readCatalog, preventOverselling: true });
const e: ActionEventInput<'cart.line.add'> = {
	event: 'cart.line.add',
	orderId: 'order',
	actor: { userId: 7, registerId: null, sessionId: null },
	source: 'user',
	payload: {
		type: 'line_items',
		line: { product_id: 1, quantity: 2, name: 'Item' },
		lineItems: [],
	},
};
beforeEach(() => {
	jest.clearAllMocks();
	next.mockResolvedValue('saved');
	readCatalog.mockResolvedValue({
		manage_stock: true,
		stock_quantity: 10,
		backorders: 'no',
		name: 'Item',
	});
});
it('allows a stocked product', async () => {
	expect(await stockGuardOnAdd(ctx, e, next)).toBe('saved');
	expect(next).toHaveBeenCalledWith(e);
	expect(log).not.toHaveBeenCalled();
});
it('refuses insufficient stock with the existing toast key and params', async () => {
	readCatalog.mockResolvedValue({ manage_stock: true, stock_quantity: 1, backorders: 'no' });
	expect(await stockGuardOnAdd(ctx, e, next)).toEqual({
		deny: {
			reasonKey: 'pos_cart.only_n_available',
			params: { quantity: 1, name: 'Item' },
			presented: true,
			detail: { productId: 1, variationId: 0, available: 1 },
		},
	});
	expect(next).not.toHaveBeenCalled();
	expect(log).toHaveBeenCalledWith('warn', 'Stock check found insufficient inventory', {
		category: ['wcpos', 'pos', 'cart', 'stock'],
		showToast: true,
		toast: { title: 'pos_cart.only_n_available' },
		context: { productId: 1, variationId: 0, available: 1 },
	});
});
it('refuses unknown stock with the existing out-of-stock toast', async () => {
	readCatalog.mockResolvedValue(null);
	expect(await stockGuardOnAdd(ctx, e, next)).toMatchObject({
		deny: { reasonKey: 'pos_products.out_of_stock', params: { name: 'Item' } },
	});
	expect(next).not.toHaveBeenCalled();
	expect(log).toHaveBeenCalledWith('warn', 'Product is out of stock', {
		category: ['wcpos', 'pos', 'cart', 'stock'],
		showToast: true,
		toast: { title: 'pos_products.out_of_stock' },
		context: { productId: 1, variationId: 0, reason: 'missing_stock_record' },
	});
});
it('warns about a backorder only after next resolves', async () => {
	readCatalog.mockResolvedValue({ manage_stock: true, stock_quantity: 1, backorders: 'notify' });
	expect(await stockGuardOnAdd(ctx, e, next)).toBe('saved');
	expect(log).toHaveBeenCalledWith('warn', 'Product will be backordered', {
		category: ['wcpos', 'pos', 'cart', 'stock'],
		toast: { title: 'pos_cart.will_be_backordered' },
		showToast: true,
	});
	expect(log.mock.invocationCallOrder[0]).toBeGreaterThan(next.mock.invocationCallOrder[0]);
});
it('passes misc products straight through', async () => {
	await stockGuardOnAdd(ctx, { ...e, payload: { ...e.payload, line: { product_id: 0 } } }, next);
	expect(readCatalog).not.toHaveBeenCalled();
	expect(next).toHaveBeenCalledTimes(1);
});
it('passes straight through with preventOverselling false', async () => {
	await stockGuardOnAdd({ ...ctx, store: { preventOverselling: false } }, e, next);
	expect(readCatalog).not.toHaveBeenCalled();
	expect(next).toHaveBeenCalledTimes(1);
});
it('passes fee lines straight through', async () => {
	await stockGuardOnAdd(ctx, { ...e, payload: { ...e.payload, type: 'fee_lines' } }, next);
	expect(readCatalog).not.toHaveBeenCalled();
	expect(next).toHaveBeenCalledTimes(1);
});
it.each([{ quantity: 1 }, { quantity: 2 }, { name: 'New' }])(
	'does not evaluate updates without a quantity increase: %j',
	async (changes) => {
		await stockGuardOnUpdate(
			ctx,
			{
				...e,
				event: 'cart.line.update',
				payload: { lineUuid: 'line', line: e.payload.line, lineItems: [], changes, options: {} },
			},
			next
		);
		expect(readCatalog).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledTimes(1);
	}
);
it('honours skipStockGuard for a quantity increase', async () => {
	await stockGuardOnUpdate(
		ctx,
		{
			...e,
			event: 'cart.line.update',
			payload: {
				lineUuid: 'line',
				line: e.payload.line,
				lineItems: [],
				changes: { quantity: 20 },
				options: { skipStockGuard: true },
			},
		},
		next
	);
	expect(readCatalog).not.toHaveBeenCalled();
	expect(next).toHaveBeenCalledTimes(1);
});
it('evaluates a quantity increase excluding the target line from the stock total', async () => {
	readCatalog.mockResolvedValue({ manage_stock: true, stock_quantity: 3, backorders: 'no' });
	const line = { ...e.payload.line, meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line' }] };
	expect(
		await stockGuardOnUpdate(
			ctx,
			{
				...e,
				event: 'cart.line.update',
				payload: {
					lineUuid: 'line',
					line,
					lineItems: [line],
					changes: { quantity: 3 },
					options: {},
				},
			},
			next
		)
	).toBe('saved');
	expect(readCatalog).toHaveBeenCalledWith('product', 1);
});
