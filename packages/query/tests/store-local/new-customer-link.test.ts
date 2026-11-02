/** @jest-environment node */
import { BehaviorSubject } from 'rxjs';

import type { StoreDatabase } from '@wcpos/database';

import {
	type CustomerLink,
	dropCustomerLink,
	pendingCustomerLinks,
	recordCustomerLink,
} from '../../src/store-local';

/** An in-memory stand-in for the store database's local documents. */
function fakeStoreDB() {
	const docs = new Map<string, Record<string, unknown>>();
	const changes = new BehaviorSubject<unknown>(null);
	const doc = (id: string) => ({
		incrementalModify: async (fn: (data: any) => any) => {
			docs.set(id, fn(structuredClone(docs.get(id))));
			changes.next(docs.get(id));
		},
		toJSON: () => ({ id, data: structuredClone(docs.get(id)) }),
	});
	return {
		getLocal: async (id: string) => (docs.has(id) ? doc(id) : null),
		insertLocal: async (id: string, data: Record<string, unknown>) => {
			if (docs.has(id)) throw new Error('conflict');
			docs.set(id, data);
			changes.next(data);
			return doc(id);
		},
		getLocal$: () => changes.asObservable(),
	} as unknown as StoreDatabase;
}

const ORDER = 'order-uuid';
function link(overrides: Partial<CustomerLink> = {}): CustomerLink {
	return {
		customerUuid: 'customer-uuid',
		scopeId: 'scope-1',
		identity: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
		at: '2026-09-30T00:00:00.000Z',
		...overrides,
	};
}

describe('customer link journal', () => {
	it('records, lists and drops links by order', async () => {
		const storeDB = fakeStoreDB();
		await recordCustomerLink(storeDB, ORDER, link());
		await recordCustomerLink(storeDB, 'other-order', link({ customerUuid: 'other' }));
		expect(Object.keys(await pendingCustomerLinks(storeDB)).sort()).toEqual([ORDER, 'other-order']);
		await dropCustomerLink(storeDB, ORDER, link().at);
		expect(Object.keys(await pendingCustomerLinks(storeDB))).toEqual(['other-order']);
	});

	it('does not drop a link that was replaced after it was read', async () => {
		const storeDB = fakeStoreDB();
		await recordCustomerLink(storeDB, ORDER, link());
		await recordCustomerLink(storeDB, ORDER, link({ customerUuid: 'newer', at: 'later' }));
		await dropCustomerLink(storeDB, ORDER, link().at);
		expect((await pendingCustomerLinks(storeDB))[ORDER]?.customerUuid).toBe('newer');
	});
});

it('the shared ensure reads the concurrent insert winner without losing its links', async () => {
	const storeDB = fakeStoreDB();
	await Promise.all([
		recordCustomerLink(storeDB, ORDER, link()),
		recordCustomerLink(storeDB, 'other-order', link()),
	]);
	expect(Object.keys(await pendingCustomerLinks(storeDB)).sort()).toEqual([ORDER, 'other-order']);
});
