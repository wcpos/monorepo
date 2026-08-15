import { forceRefreshFilterCustomer } from './force-refresh-filter-customer';

describe('forceRefreshFilterCustomer', () => {
	it('forces an engine targeted-record refresh and releases the requirement', async () => {
		const release = jest.fn();
		const require = jest.fn(() => ({ ready: Promise.resolve(), release }));
		const manager = { engine: { require } };

		await expect(
			forceRefreshFilterCustomer(manager as never, 42, 'cashier')
		).resolves.toBeUndefined();
		expect(require).toHaveBeenCalledWith({
			id: 'orders-filter:cashier:42',
			collection: 'customers',
			kind: 'targeted-records',
			wooIds: [42],
			forceRefresh: true,
		});
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('keeps fire-and-forget refresh failures handled and still releases', async () => {
		const release = jest.fn();
		const manager = {
			engine: {
				require: () => ({ ready: Promise.reject(new Error('network failed')), release }),
			},
		};

		await expect(
			forceRefreshFilterCustomer(manager as never, 7, 'customer')
		).resolves.toBeUndefined();
		expect(release).toHaveBeenCalledTimes(1);
	});
});
