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
});
