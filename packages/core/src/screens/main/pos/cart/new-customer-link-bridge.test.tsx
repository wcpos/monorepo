/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import cloneDeep from 'lodash/cloneDeep';
import { BehaviorSubject, map, startWith, Subject } from 'rxjs';

import type { StoreDatabase } from '@wcpos/database';

import { enqueueDocumentWrite } from '../../contexts/use-push-document';
import { NewCustomerLinkBridge } from './new-customer-link-bridge';
import {
	customerLinkIdentity,
	pendingCustomerLinks,
	recordCustomerLink,
} from './new-customer-link';

/**
 * The bridge end to end below the engine: the REAL `useLocalMutation` turns the
 * stamp into an order update on `engine.write`, which is the request the drain
 * sends to the store. The engine and its scope database are fakes.
 */

type Listener = (event: Record<string, unknown>) => void;
type Doc = ReturnType<typeof residentDoc>;

const ORDER = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';
const BILLING = {
	first_name: 'Ada',
	last_name: 'Lovelace',
	email: 'ada@example.com',
	city: 'London',
};
const SHIPPING = { first_name: 'Ada', last_name: 'Lovelace', city: 'Oxford' };

function residentDoc(collection: string, data: Record<string, unknown>) {
	let state = cloneDeep(data);
	const doc = {
		collection: { name: collection },
		get uuid() {
			return state.uuid as string;
		},
		get payload() {
			return state.payload as Record<string, unknown>;
		},
		get: (field: string) => state[field],
		toJSON: () => cloneDeep(state),
		toMutableJSON: () => cloneDeep(state),
		getLatest: () => doc,
		incrementalModify: async (fn: (old: Record<string, unknown>) => Record<string, unknown>) => {
			state = fn(cloneDeep(state));
			residentChanges.next();
			return doc;
		},
	};
	return doc;
}

/** Ticks on every resident write, as an RxDB query's `$` re-emits. */
const residentChanges = new Subject<void>();

let listeners: Listener[] = [];
let residents: Record<string, Map<string, Doc>> = {};
/** The engine's write queue rows, as `recordMutations` stores them. */
let queue: Record<string, unknown>[] = [];
const mockWrite = jest.fn();
const mockLoggerError = jest.fn();

const scope = () => ({
	scopeId: 'scope-1',
	barcodeSelectors: { products: [], variations: [] },
	database: {
		collections: {
			...Object.fromEntries(
				['orders', 'customers'].map((name) => [
					name,
					{
						findOne: (id: string) => ({ exec: async () => residents[name]?.get(id) ?? null }),
						find: ({ selector }: { selector: { uuid: { $in: string[] } } }) => ({
							$: residentChanges.pipe(
								startWith(undefined),
								map(() =>
									selector.uuid.$in
										.map((id) => residents[name]?.get(id))
										.filter((doc): doc is Doc => Boolean(doc))
								)
							),
						}),
					},
				])
			),
			recordMutations: {
				findOne: ({ selector }: { selector: Record<string, { $eq: unknown }> }) => ({
					exec: async () =>
						queue.find((row) =>
							Object.entries(selector).every(([field, { $eq }]) => row[field] === $eq)
						) ?? null,
				}),
			},
		},
	},
});
const mockRuntime = {
	engine: {
		active: scope,
		whenActive: async () => scope(),
		status: () => ({ activeScopeId: 'scope-1' }),
		write: (...args: unknown[]) => mockWrite(...args),
		db$: (cb: (database: unknown) => void) => {
			cb(scope().database);
			return () => undefined;
		},
		events: (listener: Listener) => {
			listeners.push(listener);
			return () => {
				listeners = listeners.filter((entry) => entry !== listener);
			};
		},
	},
};

function fakeStoreDB() {
	const docs = new Map<string, Record<string, unknown>>();
	const changes = new BehaviorSubject<unknown>(null);
	const doc = (id: string) => ({
		incrementalModify: async (fn: (data: any) => any) => {
			docs.set(id, fn(cloneDeep(docs.get(id))));
			changes.next(docs.get(id));
		},
		toJSON: () => ({ id, data: cloneDeep(docs.get(id)) }),
	});
	return {
		getLocal: async (id: string) => (docs.has(id) ? doc(id) : null),
		insertLocal: async (id: string, data: Record<string, unknown>) => {
			docs.set(id, data);
			changes.next(data);
			return doc(id);
		},
		getLocal$: () => changes.asObservable(),
	} as unknown as StoreDatabase;
}
let mockStoreDB: StoreDatabase;

jest.mock('@wcpos/query', () => ({
	...(() => {
		const {
			COLLECTION_VOCABULARY,
			promotedColumnsFor,
			adapterDerivedFieldsFor,
			WRITEABLE_REMOTE_ID_FIELD,
		} = jest.requireActual('@wcpos/query');
		return {
			COLLECTION_VOCABULARY,
			promotedColumnsFor,
			adapterDerivedFieldsFor,
			WRITEABLE_REMOTE_ID_FIELD,
		};
	})(),
	engineCollection: (database: { collections?: Record<string, unknown> } | null, name: string) =>
		database?.collections?.[name] ?? null,
	useQueryRuntime: () => mockRuntime,
}));

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: () => '2026-09-30T00:00:00',
}));

jest.mock('../contexts/current-order/temporary-order', () => ({
	getTemporaryOrder: async () => null,
	patchTemporaryOrderPayload: async () => null,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getErrorMessage: (error: unknown) => String(error),
	getLogger: () => ({
		error: (...args: unknown[]) => mockLoggerError(...args),
		debug: jest.fn(),
		success: jest.fn(),
		warn: jest.fn(),
	}),
}));

function seed(input: { order: Record<string, unknown>; orderRemoteId?: string | null }) {
	residents = {
		orders: new Map([
			[
				ORDER,
				residentDoc('orders', {
					uuid: ORDER,
					remoteId: input.orderRemoteId ?? null,
					payload: input.order,
					sync: { revision: '', partial: false, source: 'local' },
					local: { dirty: false, pendingMutationIds: [] },
				}),
			],
		]),
		customers: new Map([
			[
				CUSTOMER,
				residentDoc('customers', {
					uuid: CUSTOMER,
					remoteId: null,
					payload: { first_name: 'Ada', billing: BILLING, shipping: SHIPPING },
				}),
			],
		]),
	};
}

/** What the drain's ack does to the resident: the Woo id lands on the record. */
function acknowledgeCustomer(id: number) {
	const customer = residents.customers!.get(CUSTOMER)!;
	return customer.incrementalModify((old) => ({
		...old,
		remoteId: String(id),
		payload: { ...(old.payload as object), id },
	}));
}

function emit(event: Record<string, unknown>) {
	for (const listener of listeners) listener(event);
}

/** Let the bridge's serial pass chain settle. */
async function flush() {
	for (let i = 0; i < 10; i += 1) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
}

function orderUpdates() {
	return mockWrite.mock.calls
		.map(([intent]) => intent as Record<string, any>)
		.filter((intent) => intent.collection === 'orders');
}

async function linkOrderToCustomer() {
	await recordCustomerLink(mockStoreDB, ORDER, {
		customerUuid: CUSTOMER,
		scopeId: 'scope-1',
		identity: customerLinkIdentity(BILLING),
		// Now, not a fixed date: links expire, and this suite must not age out.
		at: new Date().toISOString(),
	});
}

function ackCustomerEvent() {
	emit({
		type: 'write-acknowledged',
		collection: 'customers',
		recordId: CUSTOMER,
		mutationId: 'm-customer',
		currentRevision: null,
	});
}

const attachedOpenCart = {
	status: 'pos-open',
	customer_id: 0,
	billing: BILLING,
	shipping: SHIPPING,
	line_items: [{ product_id: 5, quantity: 1, total: '10.00' }],
	total: '10.00',
};

describe('NewCustomerLinkBridge', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		listeners = [];
		queue = [];
		mockStoreDB = fakeStoreDB();
		mockWrite.mockResolvedValue({ mutationId: 'm-order', recordId: ORDER });
	});

	it('leaves the order a guest with the copied addresses while the customer is unacknowledged (offline)', async () => {
		seed({ order: attachedOpenCart });
		await linkOrderToCustomer();
		render(<NewCustomerLinkBridge />);
		await flush();

		expect(orderUpdates()).toEqual([]);
		expect(residents.orders!.get(ORDER)!.payload).toMatchObject({
			customer_id: 0,
			billing: BILLING,
			shipping: SHIPPING,
		});
		expect(Object.keys(await pendingCustomerLinks(mockStoreDB))).toEqual([ORDER]);
	});

	it('re-stamps the open order with the Woo id when the customer create is acknowledged', async () => {
		seed({ order: attachedOpenCart });
		await linkOrderToCustomer();
		render(<NewCustomerLinkBridge />);
		await flush();
		expect(orderUpdates()).toEqual([]);

		await acknowledgeCustomer(91);
		emit({
			type: 'write-acknowledged',
			collection: 'customers',
			recordId: CUSTOMER,
			mutationId: 'm-customer',
			currentRevision: null,
		});
		await flush();

		expect(orderUpdates()).toEqual([
			expect.objectContaining({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER,
				payload: expect.objectContaining({ customer_id: 91 }),
			}),
		]);
		// Only the customer link: nothing about the money rides on the stamp.
		expect(orderUpdates()[0]!.payload).not.toHaveProperty('total');
		expect(orderUpdates()[0]!.payload).not.toHaveProperty('line_items');
		expect(residents.orders!.get(ORDER)!.payload).toMatchObject({
			customer_id: 91,
			total: '10.00',
		});
		// Still an open cart, so the stamp is only held: the link stays until the store has it.
		expect(Object.keys(await pendingCustomerLinks(mockStoreDB))).toEqual([ORDER]);
	});

	it('sends a follow-up update carrying the id when the order was already pushed as a guest', async () => {
		// Checked out while offline: the order reached the store (it has a Woo id)
		// as a guest, and the customer's ack only lands afterwards, after a relaunch.
		seed({
			order: { ...attachedOpenCart, id: 500, status: 'completed' },
			orderRemoteId: '500',
		});
		await linkOrderToCustomer();
		await acknowledgeCustomer(91);
		render(<NewCustomerLinkBridge />);
		await flush();

		expect(orderUpdates()).toEqual([
			expect.objectContaining({
				operation: 'update',
				recordId: ORDER,
				payload: expect.objectContaining({ customer_id: 91 }),
			}),
		]);
		expect(await pendingCustomerLinks(mockStoreDB)).toEqual({});

		// A second ack (a later edit of the customer) finds nothing left to stamp.
		emit({
			type: 'write-acknowledged',
			collection: 'customers',
			recordId: CUSTOMER,
			mutationId: 'm2',
		});
		await flush();
		expect(orderUpdates()).toHaveLength(1);
	});

	it('tells the cashier when the store refuses the customer, and the order stays a guest', async () => {
		seed({ order: attachedOpenCart });
		await linkOrderToCustomer();
		render(<NewCustomerLinkBridge />);
		await flush();

		emit({
			type: 'write-rejected',
			collection: 'customers',
			recordId: CUSTOMER,
			mutationId: 'm-customer',
			status: 400,
			bornLocalCreate: true,
		});
		await flush();

		expect(orderUpdates()).toEqual([]);
		expect(residents.orders!.get(ORDER)!.payload).toMatchObject({
			customer_id: 0,
			billing: BILLING,
			shipping: SHIPPING,
		});
		expect(mockLoggerError).toHaveBeenCalledWith(
			'pos_cart.new_customer_not_saved',
			expect.objectContaining({
				showToast: true,
				toast: { title: 'pos_cart.new_customer_not_saved_title' },
			})
		);
	});

	it('ignores write outcomes for other collections', async () => {
		seed({ order: attachedOpenCart });
		await linkOrderToCustomer();
		render(<NewCustomerLinkBridge />);
		await flush();
		await acknowledgeCustomer(91);
		const callsBefore = mockWrite.mock.calls.length;
		emit({ type: 'write-rejected', collection: 'orders', recordId: CUSTOMER, mutationId: 'x' });
		await flush();
		expect(mockLoggerError).not.toHaveBeenCalled();
		// The rejection was not the customer's, so it neither reports nor reconciles.
		expect(mockWrite.mock.calls.length).toBe(callsBefore);
	});

	it('does not cancel a void made offline before the ack: no write, and the link is dropped', async () => {
		// Pushed at checkout, then voided offline: the delete waits, never attempted.
		// A stamp now would coalesce into it and turn the void into an update.
		seed({ order: { ...attachedOpenCart, id: 500 }, orderRemoteId: '500' });
		queue = [
			{
				mutationId: 'm-void',
				collectionName: 'orders',
				recordId: ORDER,
				operation: 'delete',
				status: 'pending',
				attempts: 0,
			},
		];
		await linkOrderToCustomer();
		render(<NewCustomerLinkBridge />);
		await flush();

		await acknowledgeCustomer(91);
		ackCustomerEvent();
		await flush();

		expect(orderUpdates()).toEqual([]);
		expect(residents.orders!.get(ORDER)!.payload).toMatchObject({ customer_id: 0 });
		expect(await pendingCustomerLinks(mockStoreDB)).toEqual({});
	});

	it('does not write behind a delete already sent: no write, and the link is dropped', async () => {
		// The delete is in flight (claimed after one attempt). A stamp appended behind
		// it would be an update to an order the store is deleting, and dead-letter.
		seed({ order: { ...attachedOpenCart, id: 500 }, orderRemoteId: '500' });
		queue = [
			{
				mutationId: 'm-delete',
				collectionName: 'orders',
				recordId: ORDER,
				operation: 'delete',
				status: 'claimed',
				attempts: 1,
			},
		];
		await linkOrderToCustomer();
		await acknowledgeCustomer(91);
		render(<NewCustomerLinkBridge />);
		await flush();

		expect(orderUpdates()).toEqual([]);
		expect(await pendingCustomerLinks(mockStoreDB)).toEqual({});
	});

	it("stamps an order another record's delete does not touch", async () => {
		seed({ order: attachedOpenCart });
		queue = [
			{
				mutationId: 'm-other',
				collectionName: 'orders',
				recordId: 'another-order',
				operation: 'delete',
				status: 'pending',
			},
		];
		await linkOrderToCustomer();
		await acknowledgeCustomer(91);
		render(<NewCustomerLinkBridge />);
		await flush();

		expect(orderUpdates()).toEqual([
			expect.objectContaining({ payload: expect.objectContaining({ customer_id: 91 }) }),
		]);
	});

	it('acks after the checkout push: the stamp waits in the hold and rides the pre-payment push', async () => {
		// The open cart's create already reached the store at checkout-open, as a guest.
		seed({ order: { ...attachedOpenCart, id: 500 }, orderRemoteId: '500' });
		await linkOrderToCustomer();
		render(<NewCustomerLinkBridge />);
		await flush();

		await acknowledgeCustomer(91);
		ackCustomerEvent();
		await flush();

		// An ordinary, non-explicit update: the open-cart hold keeps it while pos-open.
		const [stamp] = orderUpdates();
		expect(stamp).toMatchObject({ operation: 'update', payload: { customer_id: 91 } });
		expect(stamp).not.toHaveProperty('explicit');

		// Every online payment pushes the order explicitly before any money moves
		// (persistSaleProvenance). That push sends the resident, which carries the id.
		mockWrite.mockClear();
		await enqueueDocumentWrite(mockRuntime as never, residents.orders!.get(ORDER)! as never);
		expect(orderUpdates()).toEqual([
			expect.objectContaining({
				operation: 'update',
				recordId: ORDER,
				explicit: true,
				payload: expect.objectContaining({ customer_id: 91, status: 'pos-open' }),
			}),
		]);
	});

	it('keeps the link while a resync has the order away, and stamps it when it is back', async () => {
		seed({ order: attachedOpenCart });
		await linkOrderToCustomer();
		const order = residents.orders!.get(ORDER)!;
		residents.orders!.delete(ORDER);
		await acknowledgeCustomer(91);
		render(<NewCustomerLinkBridge />);
		await flush();

		expect(orderUpdates()).toEqual([]);
		expect(Object.keys(await pendingCustomerLinks(mockStoreDB))).toEqual([ORDER]);

		// The re-pull brings the order back; the next order ack looks again.
		residents.orders!.set(ORDER, order);
		emit({
			type: 'write-acknowledged',
			collection: 'orders',
			recordId: 'another-order',
			mutationId: 'm-next-sale',
			currentRevision: null,
		});
		await flush();

		expect(orderUpdates()).toEqual([
			expect.objectContaining({ payload: expect.objectContaining({ customer_id: 91 }) }),
		]);
		expect(Object.keys(await pendingCustomerLinks(mockStoreDB))).toEqual([ORDER]);
	});

	it('acks after the pre-payment push on a gateway pay page: the stamp the paid snapshot retires is sent again after payment', async () => {
		// The store's copy of the order. Only rows the drain sends reach it.
		const server: Record<string, unknown> = { ...attachedOpenCart, id: 500 };
		let sequence = 0;
		// The engine's write path for an order update: a queued row, and the resident
		// marked dirty until the store acknowledges it (write-intents).
		mockWrite.mockImplementation(async (intent: Record<string, any>) => {
			const mutationId = `m-order-${(sequence += 1)}`;
			queue.push({
				mutationId,
				collectionName: intent.collection,
				recordId: intent.recordId,
				operation: intent.operation,
				status: 'pending',
				explicit: intent.explicit === true,
				payload: intent.payload,
			});
			await residents.orders!.get(ORDER)!.incrementalModify((old) => ({
				...old,
				local: { dirty: true, pendingMutationIds: [mutationId] },
			}));
			return { mutationId, recordId: ORDER };
		});
		// The drain sends every releasable row. The open-cart hold keeps back a
		// non-explicit row while the till holds the order as `pos-open`.
		const drain = async () => {
			const order = residents.orders!.get(ORDER)!;
			const held = (row: Record<string, unknown>) =>
				order.payload.status === 'pos-open' && !row.explicit && row.operation !== 'delete';
			const sending = queue.filter((row) => row.recordId === ORDER && !held(row));
			queue = queue.filter((row) => !sending.includes(row));
			for (const row of sending) {
				Object.assign(server, row.payload);
				await order.incrementalModify((old) => ({
					...old,
					payload: { ...(old.payload as object), ...(row.payload as object) },
					local: { dirty: false, pendingMutationIds: [] },
				}));
				emit({
					type: 'write-acknowledged',
					collection: 'orders',
					recordId: ORDER,
					mutationId: row.mutationId,
					currentRevision: null,
				});
			}
			await flush();
		};

		// Checkout pushed the cart explicitly before payment, as a guest: the
		// customer's ack had not landed yet.
		seed({ order: { ...attachedOpenCart, id: 500 }, orderRemoteId: '500' });
		await linkOrderToCustomer();
		render(<NewCustomerLinkBridge />);
		await flush();

		// The ack lands after that push, so the stamp is a held open-cart row.
		await acknowledgeCustomer(91);
		ackCustomerEvent();
		await flush();
		await drain();
		expect(queue).toEqual([
			expect.objectContaining({
				operation: 'update',
				payload: expect.objectContaining({ customer_id: 91 }),
			}),
		]);
		expect(server.customer_id).toBe(0);

		// The gateway takes payment and the pay page hands back the paid order. Adopting
		// it retires the held row as moot (createOrderHeldRowDiscarder: the store settled
		// the sale, the till still holds an unpaid open cart, and every row is a hold
		// candidate), then upserts the store's document, which is still a guest.
		Object.assign(server, { status: 'processing', date_paid_gmt: '2026-10-01T00:00:00' });
		queue = queue.filter((row) => row.recordId !== ORDER || row.explicit);
		await residents.orders!.get(ORDER)!.incrementalModify((old) => ({
			...old,
			payload: cloneDeep(server),
			local: { dirty: false, pendingMutationIds: [] },
		}));
		await flush();
		await drain();

		expect(server).toMatchObject({ status: 'processing', customer_id: 91 });
		expect(residents.orders!.get(ORDER)!.payload).toMatchObject({ customer_id: 91 });
		expect(await pendingCustomerLinks(mockStoreDB)).toEqual({});
	});
});
