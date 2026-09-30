import { BehaviorSubject } from 'rxjs';

import type { StoreDatabase } from '@wcpos/database';

import {
	CUSTOMER_LINK_LIFETIME_MS,
	type CustomerLink,
	type CustomerLinkDeps,
	customerLinkIdentity,
	dropCustomerLink,
	pendingCustomerLinks,
	reconcileCustomerLink,
	recordCustomerLink,
} from './new-customer-link';

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
const CUSTOMER = 'customer-uuid';
const BILLING = {
	first_name: 'Ada',
	last_name: 'Lovelace',
	email: 'ada@example.com',
	city: 'London',
};

function link(overrides: Partial<CustomerLink> = {}): CustomerLink {
	return {
		customerUuid: CUSTOMER,
		scopeId: 'scope-1',
		identity: customerLinkIdentity(BILLING),
		at: '2026-09-30T00:00:00.000Z',
		...overrides,
	};
}

function deps(
	state: {
		customer?: { remoteId: number | null } | null;
		order?: Record<string, unknown> | null;
		stampResult?: boolean;
		scopeId?: string;
		queuedDelete?: boolean;
		dirty?: boolean;
		now?: number;
	} = {}
) {
	const document = { uuid: ORDER };
	const stamps: { document: unknown; customerId: number }[] = [];
	const drops: string[] = [];
	const value: CustomerLinkDeps = {
		activeScopeId: () => state.scopeId ?? 'scope-1',
		findCustomer: async () => (state.customer === undefined ? { remoteId: null } : state.customer),
		findOrder: async () =>
			state.order === null
				? null
				: {
						document,
						payload: state.order ?? { customer_id: 0, billing: BILLING },
						dirty: state.dirty ?? false,
					},
		stampCustomer: async (doc, customerId) => {
			stamps.push({ document: doc, customerId });
			return state.stampResult ?? true;
		},
		orderHasQueuedDelete: async () => state.queuedDelete ?? false,
		serializeOrder: (_uuid, run) => run(),
		drop: async (uuid) => {
			drops.push(uuid);
		},
		now: () => state.now ?? Date.parse('2026-09-30T01:00:00.000Z'),
	};
	return { value, stamps, drops, document };
}

describe('reconcileCustomerLink', () => {
	it('waits, without touching the order, while the customer has no Woo id (offline)', async () => {
		const d = deps({ customer: { remoteId: null } });
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('waiting');
		expect(d.stamps).toEqual([]);
		expect(d.drops).toEqual([]);
	});

	it('stamps the acknowledged id onto the order that still carries the attached customer', async () => {
		const d = deps({ customer: { remoteId: 91 } });
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('stamped');
		expect(d.stamps).toEqual([{ document: d.document, customerId: 91 }]);
		// Written is not delivered: the link stays until the store holds the id.
		expect(d.drops).toEqual([]);
	});

	it('keeps the link, without writing, while a stamped order is still an open cart', async () => {
		// The stamp is a held open-cart row, which a paid snapshot can still retire unsent.
		const d = deps({
			customer: { remoteId: 91 },
			order: { status: 'pos-open', customer_id: 91, billing: BILLING },
		});
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('waiting');
		expect(d.stamps).toEqual([]);
		expect(d.drops).toEqual([]);
	});

	it('keeps the link, without writing, while the stamp on a paid order is unsent', async () => {
		const d = deps({
			customer: { remoteId: 91 },
			order: { status: 'processing', customer_id: 91, billing: BILLING },
			dirty: true,
		});
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('waiting');
		expect(d.stamps).toEqual([]);
		expect(d.drops).toEqual([]);
	});

	it('stamps again a paid order that came back a guest, its held stamp retired unsent', async () => {
		const d = deps({
			customer: { remoteId: 91 },
			order: { status: 'processing', customer_id: 0, billing: BILLING },
		});
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('stamped');
		expect(d.stamps).toEqual([{ document: d.document, customerId: 91 }]);
		expect(d.drops).toEqual([]);
	});

	it('treats an absent billing email and an empty one as the same identity', async () => {
		const { email: _email, ...withoutEmail } = BILLING;
		const d = deps({
			customer: { remoteId: 91 },
			order: { customer_id: 0, billing: withoutEmail },
		});
		await expect(
			reconcileCustomerLink(
				d.value,
				ORDER,
				link({ identity: customerLinkIdentity({ ...withoutEmail, email: '' }) })
			)
		).resolves.toBe('stamped');
	});

	it('keeps the link when the stamp write fails, so the next pass retries', async () => {
		const d = deps({ customer: { remoteId: 91 }, stampResult: false });
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('waiting');
		expect(d.drops).toEqual([]);
	});

	it('reports a refused create and leaves the order a guest, with the link kept for a resend', async () => {
		const d = deps({ customer: { remoteId: null } });
		await expect(reconcileCustomerLink(d.value, ORDER, link(), { rejected: true })).resolves.toBe(
			'rejected'
		);
		expect(d.stamps).toEqual([]);
		expect(d.drops).toEqual([]);
	});

	it('stamps rather than reports when the refused write was a later edit of an acknowledged customer', async () => {
		const d = deps({ customer: { remoteId: 91 } });
		await expect(reconcileCustomerLink(d.value, ORDER, link(), { rejected: true })).resolves.toBe(
			'stamped'
		);
	});

	it('does not overwrite another customer the cashier has since picked', async () => {
		const d = deps({ customer: { remoteId: 91 }, order: { customer_id: 12, billing: BILLING } });
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('dropped');
		expect(d.stamps).toEqual([]);
	});

	it('does not stamp an order the cashier has put back to a guest', async () => {
		const d = deps({
			customer: { remoteId: 91 },
			order: { customer_id: 0, billing: { first_name: '', last_name: '', email: '' } },
		});
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('dropped');
		expect(d.stamps).toEqual([]);
	});

	it('is idempotent: a replay after the stamp landed writes nothing, and settles the link', async () => {
		const d = deps({
			customer: { remoteId: 91 },
			order: { status: 'processing', customer_id: 91, billing: BILLING },
		});
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('dropped');
		expect(d.stamps).toEqual([]);
		expect(d.drops).toEqual([ORDER]);
	});

	it('keeps a link whose customer or order is away, as a resync leaves them', async () => {
		const noCustomer = deps({ customer: null });
		await expect(reconcileCustomerLink(noCustomer.value, ORDER, link())).resolves.toBe('waiting');
		const noOrder = deps({ customer: { remoteId: 91 }, order: null });
		await expect(reconcileCustomerLink(noOrder.value, ORDER, link())).resolves.toBe('waiting');
		expect([...noCustomer.stamps, ...noOrder.stamps]).toEqual([]);
		expect([...noCustomer.drops, ...noOrder.drops]).toEqual([]);
	});

	it('drops a link that has outlived its lifetime, without writing', async () => {
		const expired = Date.parse(link().at) + CUSTOMER_LINK_LIFETIME_MS + 1;
		const d = deps({ customer: { remoteId: 91 }, now: expired });
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('dropped');
		expect(d.stamps).toEqual([]);
		expect(d.drops).toEqual([ORDER]);
	});

	it('never writes to an order with a queued delete (a void before the ack)', async () => {
		const d = deps({ customer: { remoteId: 91 }, queuedDelete: true });
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('dropped');
		expect(d.stamps).toEqual([]);
		expect(d.drops).toEqual([ORDER]);
	});

	it.each(['cancelled', 'trash'])('never writes to a %s order', async (status) => {
		const d = deps({
			customer: { remoteId: 91 },
			order: { status, customer_id: 0, billing: BILLING },
		});
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('dropped');
		expect(d.stamps).toEqual([]);
	});

	it("leaves another scope's link alone", async () => {
		const d = deps({ customer: null, scopeId: 'scope-2' });
		await expect(reconcileCustomerLink(d.value, ORDER, link())).resolves.toBe('waiting');
		expect(d.drops).toEqual([]);
	});
});

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
