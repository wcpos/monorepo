import { readResidentOrder } from '../../src/record-readers';

import type { QueryManager } from '../../src/mutations/resident';

describe('readResidentOrder', () => {
	it('waits for a cold scope to open before reading the resident order', async () => {
		const order = { uuid: 'order-1', payload: { id: 42 } };
		const findOne = jest.fn(() => ({ exec: async () => order }));
		type Scope = Awaited<ReturnType<QueryManager['engine']['whenActive']>>;
		let open!: (scope: Scope) => void;
		let scope: Scope | null = null;
		const ready = new Promise<Scope>((resolve) => {
			open = resolve;
		});
		const manager = { engine: { active: () => scope, whenActive: () => ready } } as QueryManager;
		const result = readResidentOrder(manager, 'order-1');
		expect(findOne).not.toHaveBeenCalled();
		scope = { database: { collections: { orders: { findOne } } } } as unknown as Scope;
		open(scope);
		await expect(result).resolves.toBe(order);
		expect(findOne).toHaveBeenCalledWith('order-1');
	});

	it('throws when the active scope has no orders collection', async () => {
		const manager = {
			engine: { whenActive: async () => ({ database: { collections: {} } }) },
		} as unknown as QueryManager;
		await expect(readResidentOrder(manager, 'missing')).rejects.toThrow(
			'Engine collection "orders" is unavailable'
		);
	});

	it('returns null only for a missing resident and propagates storage failures', async () => {
		const exec = jest
			.fn()
			.mockResolvedValueOnce(null)
			.mockRejectedValueOnce(new Error('storage failed'));
		const manager = {
			engine: {
				whenActive: async () => ({
					database: { collections: { orders: { findOne: () => ({ exec }) } } },
				}),
			},
		} as unknown as QueryManager;
		await expect(readResidentOrder(manager, 'missing')).resolves.toBeNull();
		await expect(readResidentOrder(manager, 'missing')).rejects.toThrow('storage failed');
	});
});
