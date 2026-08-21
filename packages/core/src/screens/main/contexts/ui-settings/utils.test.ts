import { mergeWithInitalValues } from './utils';

describe('mergeWithInitalValues', () => {
	it('appends missing pos-cart columns for existing settings state', async () => {
		const currentState = {
			columns: [
				{ key: 'quantity', show: true, display: [{ key: 'split', show: false }] },
				{ key: 'name', show: true, flex: 3, display: [{ key: 'sku', show: false }] },
				{ key: 'sku', show: false },
				{ key: 'price', show: true, align: 'right', display: [{ key: 'on_sale', show: true }] },
				{ key: 'regular_price', show: false, align: 'right' },
				{ key: 'subtotal', show: false, align: 'right', display: [{ key: 'tax', show: false }] },
				{
					key: 'total',
					show: true,
					align: 'right',
					display: [
						{ key: 'tax', show: false },
						{ key: 'on_sale', show: true },
					],
				},
				{ key: 'actions', width: 60, hideLabel: true, show: true },
			],
		};

		const state = {
			get: () => currentState,
			set: jest.fn(async (key, updater) => {
				currentState[key as keyof typeof currentState] = updater(
					currentState[key as keyof typeof currentState]
				);
			}),
		};

		await mergeWithInitalValues('pos-cart', state as never);

		expect(currentState.columns).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: 'image',
					show: false,
				}),
			])
		);
	});

	it('does not write state when columns are already semantically equal', async () => {
		const currentState = {
			sortBy: 'id',
			sortDirection: 'asc',
			autoShowReceipt: true,
			autoPrintReceipt: false,
			receiptOutputType: 'html',
			openCashDrawer: false,
			quickDiscounts: [5, 10, 15, 20],
			columns: [
				{
					show: true,
					align: 'center',
					key: 'quantity',
					display: [{ show: false, key: 'split' }],
				},
				{
					hideLabel: true,
					width: 56,
					show: false,
					key: 'image',
				},
				{
					display: [{ show: false, key: 'sku' }],
					flex: 3,
					show: true,
					key: 'name',
				},
				{ show: false, key: 'sku' },
				{
					display: [{ show: true, key: 'on_sale' }],
					align: 'right',
					show: true,
					key: 'price',
				},
				{ align: 'right', show: false, key: 'regular_price' },
				{
					display: [{ show: false, key: 'tax' }],
					align: 'right',
					show: false,
					key: 'subtotal',
				},
				{
					display: [
						{ show: false, key: 'tax' },
						{ show: true, key: 'on_sale' },
					],
					align: 'right',
					show: true,
					key: 'total',
				},
				{
					show: true,
					hideLabel: true,
					width: 60,
					key: 'actions',
				},
			],
		};

		const state = {
			get: () => currentState,
			set: jest.fn(async () => undefined),
		};

		await mergeWithInitalValues('pos-cart', state as never);

		expect(state.set).not.toHaveBeenCalled();
	});

	it('heals stale capability flags from initial settings while keeping user preferences (#1347)', async () => {
		// An upgraded install: the persisted coupons columns were seeded before
		// `code` became sortable, so they still carry `disableSort: true` — and the
		// user has hidden the column and moved it after `amount`. The merge must
		// take `disableSort` (a capability flag) from the initial settings and keep
		// `show` + order (the preferences).
		const currentState = {
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			columns: [
				{ key: 'amount', show: true, align: 'right', disableSort: true },
				{ key: 'code', show: false, flex: 2, disableSort: true },
			],
		};

		const state = {
			get: () => currentState,
			set: jest.fn(async (key, updater) => {
				currentState[key as keyof typeof currentState] = updater(
					currentState[key as keyof typeof currentState]
				);
			}),
		};

		await mergeWithInitalValues('coupons', state as never);

		const code = currentState.columns.find((column) => column.key === 'code');
		expect(code).toEqual({ key: 'code', show: false, flex: 2 });
		expect(code).not.toHaveProperty('disableSort');
		// Order and the still-disabled sibling's capability flag are untouched.
		expect(currentState.columns[0]).toEqual(
			expect.objectContaining({ key: 'amount', show: true, disableSort: true })
		);
	});

	it('passes through persisted columns the initial settings do not declare', async () => {
		const currentState = {
			columns: [{ key: 'pro_only_column', show: true, disableSort: true }],
		};

		const state = {
			get: () => currentState,
			set: jest.fn(async (key, updater) => {
				currentState[key as keyof typeof currentState] = updater(
					currentState[key as keyof typeof currentState]
				);
			}),
		};

		await mergeWithInitalValues('coupons', state as never);

		expect(currentState.columns.find((column) => column.key === 'pro_only_column')).toEqual({
			key: 'pro_only_column',
			show: true,
			disableSort: true,
		});
	});
});
