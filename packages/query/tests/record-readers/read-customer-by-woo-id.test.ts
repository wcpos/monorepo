import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { readCustomerByWooId } from '../../src/record-readers';

function engineWith(collections: Record<string, unknown> | null) {
	return {
		whenActive: async () => (collections === null ? null : { database: { collections } }),
	} as unknown as RxdbSyncEngine;
}

const customers = [
	{ uuid: 'local-customer', remoteId: null, payload: { first_name: 'Unacknowledged' } },
	{ uuid: 'customer-42', remoteId: '42', payload: { id: 42, first_name: 'Ada' } },
];
function customerEngine() {
	return engineWith({
		customers: {
			findOne: ({ selector }: { selector: { remoteId: string | null } }) => ({
				exec: async () =>
					customers.find((customer) => customer.remoteId === selector.remoteId) ?? null,
			}),
		},
	});
}

describe('readCustomerByWooId', () => {
	it('finds the customer by remoteId rather than the local UUID', async () => {
		expect(await readCustomerByWooId(customerEngine(), 42)).toBe(customers[1]);
	});

	it('returns null when the customer is absent', async () => {
		expect(await readCustomerByWooId(customerEngine(), 99)).toBeNull();
	});

	it('never resolves guest id 0 to an unacknowledged customer', async () => {
		expect(await readCustomerByWooId(customerEngine(), 0)).toBeNull();
	});

	it.each([null, {}])('returns null without a scope or collection (%s)', async (collections) => {
		expect(await readCustomerByWooId(engineWith(collections), 42)).toBeNull();
	});
});
