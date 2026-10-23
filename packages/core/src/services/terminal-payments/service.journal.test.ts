/**
 * @jest-environment jsdom
 */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { moneyCommandPoster, recoverMoneyCommands, type useQueryRuntime } from '@wcpos/query';
import {
	createEngineDatabase,
	createFakeEngine,
	engineOrder,
	readOrderCommands,
} from '@wcpos/query/testing';
import type { StoreLocalDatabase } from '@wcpos/query/store-local';
import type { PaymentRow } from '@wcpos/order-math';

import { TerminalPaymentsService } from './service';

import type { RxDatabase } from 'rxdb';

type QueryRuntime = ReturnType<typeof useQueryRuntime>;
Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
jest.mock('@wcpos/database/live-tab', () => ({
	...jest.requireActual('@wcpos/database/live-tab'),
	holdLiveTab: jest.fn(() => jest.fn()),
}));
addRxPlugin(RxDBLocalDocumentsPlugin);

/**
 * A server terminal leg retried by its OWN retry path (server-leg's backoff, then the next
 * status read re-issuing the capture), through the real money command poster and journal: a
 * retry is a re-send of the journaled command, never a second command.
 */
const row: PaymentRow = {
	id: 'leg',
	source: 'app',
	order_id: 42,
	method_id: 'terminal',
	provider: 'square',
	kind: 'card',
	capture_mode: 'server',
	transport: null,
	recorded_offline: false,
	amount: '10.00',
	currency: 'USD',
	tendered: null,
	change: null,
	tip: null,
	status: 'pending',
	failure_reason: null,
	refunded_amount: '0.00',
	refunds: [],
	provider_refs: {},
	receipt: {},
	cashier_id: 1,
	store_id: 1,
	created_at_gmt: '2026-01-01T00:00:00Z',
	captured_at_gmt: null,
	updated_at_gmt: '2026-01-01T00:00:00Z',
};

/** `drop`: lost on the wire, so the next status read still shows the leg authorized. */
type CaptureMode = 'drop' | '503' | 'locked';
class FakeStore {
	n = 1;
	leg: PaymentRow = row;
	commands = new Map<string, { fingerprint: string; answer: Record<string, unknown> }>();
	captures = 0;
	captureModes: CaptureMode[] = [];
	/** Holds the intent's answer until released, then answers it `wcpos_payment_locked`. */
	intentLocked: Promise<void> | null = null;
	/** The void finds no row: the locked intent never ran. */
	voidNotFound = false;
	get revision() {
		return `sha256:r${this.n}`;
	}
	summary() {
		const captured = this.leg.status === 'captured';
		return {
			status: captured ? 'completed' : 'pos-open',
			total: '10.00',
			paid: captured ? '10.00' : '0.00',
			balance: captured ? '0.00' : '10.00',
			payment_method: 'terminal',
			payment_method_title: 'Terminal',
		};
	}
	get = jest.fn(async (_url: string) => ({ data: { payment: this.leg, order: this.summary() } }));
	post = jest.fn(async (url: string, sent: unknown) => {
		const { revision, command_id, ...rest } = sent as Record<string, unknown>;
		const refuse = (status: number, code: string) =>
			Object.assign(new Error(code), {
				response: { status, data: { code, data: { status, retry_after: 1 } } },
			});
		if (url.endsWith('/intent') && this.intentLocked) {
			const gate = this.intentLocked;
			this.intentLocked = null;
			await gate;
			throw refuse(409, 'wcpos_payment_locked');
		}
		if (url.endsWith('/void') && this.voidNotFound) throw refuse(404, 'wcpos_payment_not_found');
		const capture = url.endsWith('/capture');
		const mode = capture ? this.captureModes.shift() : undefined;
		if (mode === '503')
			throw Object.assign(new Error('503'), { response: { status: 503, data: {} } });
		if (mode === 'drop') throw new Error('Network Error');
		// The order lock was held: nothing ran and nothing was stored for this command.
		if (mode === 'locked')
			throw Object.assign(new Error('locked'), {
				response: {
					status: 409,
					data: { code: 'wcpos_payment_locked', data: { status: 409, retry_after: 1 } },
				},
			});
		const fingerprint = JSON.stringify([url, rest]);
		const stored = this.commands.get(command_id as string);
		if (stored) {
			if (stored.fingerprint !== fingerprint)
				throw Object.assign(new Error('conflict'), {
					response: { status: 422, data: { code: 'wcpos_command_conflict' } },
				});
			return { data: stored.answer };
		}
		if (revision !== this.revision)
			throw Object.assign(new Error('stale'), {
				response: { status: 409, data: { code: 'wcpos_revision_stale' } },
			});
		if (capture) {
			this.captures += 1;
			this.leg = { ...this.leg, status: 'captured', captured_at_gmt: '2026-01-01T00:00:05Z' };
		} else this.leg = { ...this.leg, status: 'authorized', updated_at_gmt: '2026-01-01T00:00:01Z' };
		this.n += 1;
		const answer = { payment: this.leg, order: this.summary(), revision: this.revision };
		this.commands.set(command_id as string, { fingerprint, answer });
		return { data: answer };
	});
}

let database: RxDatabase;
let storeDB: StoreLocalDatabase;
let runtime: QueryRuntime;
let store: FakeStore;
let settledCaptures: number;

beforeEach(async () => {
	store = new FakeStore();
	settledCaptures = 0;
	database = await createEngineDatabase(['orders']);
	storeDB = (await createRxDatabase({
		name: `journal${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as StoreLocalDatabase;
	const engine = createFakeEngine(database);
	// The forced refresh adopts the store's document whole, under its revision.
	Object.assign(engine, {
		require: () => {
			const ready = database.orders
				.findOne('order')
				.exec()
				.then((doc) =>
					doc!.incrementalModify((data: any) => ({
						...data,
						sync: {
							...data.sync,
							revision: store.revision,
							adopted: { revision: store.revision, at: Date.now() },
						},
					}))
				)
				.then(() => ({ action: 'fetched', appliedRecordIds: ['42'] }));
			return { ready, release: () => undefined, queryKey: '' };
		},
	});
	runtime = { engine } as unknown as QueryRuntime;
	await database.orders.insert({
		...engineOrder({
			uuid: 'order',
			id: 42,
			status: 'pos-open',
			total: '10.00',
			currency: 'USD',
			meta_data: [],
		}),
		sync: {
			revision: store.revision,
			partial: false,
			source: 'woo-rest',
			adopted: { revision: store.revision, at: Date.now() },
		},
	});
});
afterEach(async () => {
	await database.close();
	await (storeDB as unknown as RxDatabase).remove();
});

/** Timers run on demand, so the leg's backoff and polls are stepped deterministically. */
function scheduler() {
	const queue: (() => void)[] = [];
	return {
		setTimeout: ((callback: () => void) => {
			queue.push(callback);
			return queue.length as unknown as ReturnType<typeof setTimeout>;
		}) as (callback: () => void, ms: number) => ReturnType<typeof setTimeout>,
		clearTimeout: () => undefined,
		async drain(until: () => boolean) {
			for (let i = 0; i < 50 && !until(); i++) {
				await new Promise((resolve) => setTimeout(resolve, 0));
				queue.shift()?.();
			}
		},
	};
}

function service(timers: ReturnType<typeof scheduler>) {
	return new TerminalPaymentsService({
		http: { get: store.get, post: store.post },
		commandPoster: (orderUuid, { approval }) =>
			moneyCommandPoster({
				runtime,
				storeDB,
				orderUuid,
				post: store.post,
				approval: approval ?? { total: '10.00', currency: 'USD' },
			}),
		mirror: async (_orderUuid, { payment, order }, poster) => {
			await poster.mirror({ payment, order });
			if (payment.status === 'captured') settledCaptures += 1;
		},
		setTimeout: timers.setTimeout,
		clearTimeout: timers.clearTimeout,
		now: () => Date.parse('2026-01-01T00:00:02Z'),
	});
}

const captureCalls = () =>
	store.post.mock.calls
		.filter(([url]) => url.endsWith('/capture'))
		.map(([, body]) => body as Record<string, unknown>);
const begin = (s: TerminalPaymentsService) =>
	s.begin({
		dp: 2,
		orderUuid: 'order',
		orderId: 42,
		orderNumber: '42',
		row,
		reader: 'reader',
		approval: { total: '10.00', currency: 'USD' },
	});

it('a capture retried after a lost answer re-sends the same command_id and body', async () => {
	store.captureModes = ['drop'];
	const timers = scheduler();
	const terminal = service(timers);
	begin(terminal);
	await timers.drain(() => settledCaptures > 0);
	const [first, second] = captureCalls();
	expect(captureCalls()).toHaveLength(2);
	expect(second.command_id).toBe(first.command_id);
	expect({ ...second, revision: null }).toEqual({ ...first, revision: null });
	expect(store.captures).toBe(1);
	terminal.stop();
});

it('after a 5xx capture and a successful retry no journal entry stays open', async () => {
	store.captureModes = ['503'];
	const timers = scheduler();
	const terminal = service(timers);
	begin(terminal);
	await timers.drain(() => settledCaptures > 0);
	const [first, second] = captureCalls();
	expect(second.command_id).toBe(first.command_id);
	expect(store.captures).toBe(1);
	expect((await readOrderCommands(storeDB, 'order')).entries).toEqual([]);
	terminal.stop();
});

it('a locked capture is re-sent with the same command_id after its backoff, then settles', async () => {
	store.captureModes = ['locked'];
	const timers = scheduler();
	const terminal = service(timers);
	begin(terminal);
	await timers.drain(() => settledCaptures > 0);
	const [first, second] = captureCalls();
	expect(captureCalls()).toHaveLength(2);
	expect(second.command_id).toBe(first.command_id);
	expect({ ...second, revision: null }).toEqual({ ...first, revision: null });
	expect(store.captures).toBe(1);
	expect((await readOrderCommands(storeDB, 'order')).entries).toEqual([]);
	terminal.stop();
});

// A cancel pressed while the intent was out, answered by the lock (nothing ran), goes out as the
// void; when the void finds no row the leg is voided, and the intent's journal entry is retired:
// a later recovery or Try again must never re-send it and authorize a cancelled sale.
it('a locked intent whose cancel voids a missing row is retired: recovery sends nothing', async () => {
	let release!: () => void;
	store.intentLocked = new Promise<void>((resolve) => (release = resolve));
	store.voidNotFound = true;
	const timers = scheduler();
	const terminal = service(timers);
	begin(terminal);
	await timers.drain(() => store.post.mock.calls.length > 0);
	await terminal.leg('order')!.cancel();
	release();
	await timers.drain(() => terminal.get('order')?.phase === 'final');
	expect(terminal.get('order')).toMatchObject({ outcome: 'voided' });
	await timers.drain(() => false);
	expect((await readOrderCommands(storeDB, 'order')).entries).toEqual([]);
	const posts = store.post.mock.calls.length;
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([]);
	expect(store.post).toHaveBeenCalledTimes(posts);
	terminal.stop();
});
