/**
 * @jest-environment jsdom
 */
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { readLedger, withLedger } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';
import type { StoreDatabase } from '@wcpos/database';

import {
	classifyMoneyRoute,
	MoneyCommandError,
	moneyCommandPoster,
	resendOpenCommands,
} from '../src/commands/money-command';
import { pushRecord } from '../src/mutations/push-record';
import { readOrderCommands } from '../src/store-local/money-commands';
import { createEngineDatabase, createFakeEngine, engineOrder } from '../src/testing';

import type { QueryRuntime } from '../src/provider';
import type { RxDatabase } from 'rxdb';

jest.mock('../src/mutations/push-record', () => ({ pushRecord: jest.fn() }));
addRxPlugin(RxDBLocalDocumentsPlugin);

function httpError(status: number, code: string, data?: Record<string, unknown>) {
	return Object.assign(new Error(code), { response: { status, data: { code, data } } });
}

type Mode = 'lose' | 'locked' | '403' | 'stale';
/** The store's side of the contract: replay by id before the revision check, stale otherwise. */
class FakeStore {
	n = 1;
	total = '100.00';
	currency = 'USD';
	status = 'pos-open';
	rows = new Map<string, PaymentRow>();
	commands = new Map<string, { fingerprint: string; answer: Record<string, unknown> }>();
	completions = 0;
	legs = 0;
	modes: Mode[] = [];
	get revision() {
		return `sha256:r${this.n}`;
	}
	document() {
		return { id: 5, total: this.total, currency: this.currency, status: this.status };
	}
	summary() {
		return {
			status: this.status,
			total: this.total,
			balance: '0',
			payment_method: '',
			payment_method_title: '',
		};
	}
	post = jest.fn(async (url: string, sent: unknown) => {
		const body = sent as Record<string, unknown>;
		const mode = this.modes.shift();
		if (mode === 'locked') throw httpError(409, 'wcpos_payment_locked');
		if (mode === '403') throw httpError(403, 'rest_forbidden');
		const { revision, command_id, ...rest } = body;
		const route = classifyMoneyRoute(url)!;
		const key = (command_id as string | undefined) ?? (rest.payment as PaymentRow).id;
		const fingerprint = JSON.stringify([url, rest]);
		const stored = this.commands.get(key);
		if (stored) {
			if (stored.fingerprint !== fingerprint) throw httpError(422, 'wcpos_command_conflict');
			return { data: stored.answer };
		}
		if (mode === 'stale' || revision !== this.revision)
			throw httpError(409, 'wcpos_revision_stale', {
				current: this.document(),
				currentRevision: this.revision,
				order: this.summary(),
			});
		let payment: PaymentRow | undefined;
		if (route.kind === 'record') {
			payment = { ...(rest.payment as PaymentRow), status: 'captured' };
			this.rows.set(payment.id, payment);
		}
		if (route.kind === 'intent' || route.kind === 'submit') this.legs += 1;
		if (route.kind === 'close') {
			this.completions += 1;
			this.status = 'completed';
		}
		this.n += 1;
		const answer = {
			...(payment ? { payment } : {}),
			order: this.summary(),
			revision: this.revision,
		};
		this.commands.set(key, { fingerprint, answer });
		if (mode === 'lose') throw new Error('Network Error');
		return { data: answer };
	});
}

let clock = 1_000_000;
let database: RxDatabase;
let storeDB: StoreDatabase;
let runtime: QueryRuntime;
let store: FakeStore;
let refreshWorks: boolean;
let adoptionProtected: boolean;
let requires: { readopt?: boolean }[];

async function resident() {
	return (await database.orders.findOne('order').exec())!;
}
async function residentJSON() {
	return (await resident()).toJSON() as unknown as {
		payload: Record<string, unknown> & { meta_data: { key: string; value: unknown }[] };
		sync: { revision: string; adopted?: { revision: string; at: number } };
	};
}
async function writeResident(modify: (doc: Record<string, any>) => Record<string, any>) {
	await (await resident()).incrementalModify(modify as never);
}
/** A whole-document adoption of the store's current copy, as the pull adopt path makes it. */
async function adoptStore(readopt: boolean) {
	const { sync } = await residentJSON();
	if (!readopt && sync.revision === store.revision) return; // the equal-stamp skip
	await writeResident((doc) => ({
		...doc,
		payload: {
			...doc.payload,
			...store.document(),
			meta_data: withLedger(doc.payload.meta_data, [...store.rows.values()]),
		},
		sync: {
			...doc.sync,
			revision: store.revision,
			adopted: { revision: store.revision, at: Date.now() },
		},
	}));
}
/** A naked writer: replaces sync.revision while spreading ...sync (428 refresh, rebase, ack). */
async function nakedRevision(revision: string) {
	await writeResident((doc) => ({ ...doc, sync: { ...doc.sync, revision } }));
}

beforeEach(async () => {
	jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1));
	store = new FakeStore();
	refreshWorks = true;
	adoptionProtected = false;
	requires = [];
	database = await createEngineDatabase(['orders']);
	storeDB = (await createRxDatabase({
		name: `money${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	})) as unknown as StoreDatabase;
	const engine = createFakeEngine(database);
	Object.assign(engine, {
		require: (requirement: { readopt?: boolean }) => {
			requires.push(requirement);
			const ready = refreshWorks
				? adoptStore(requirement.readopt === true).then(() => ({ action: 'fetched' }))
				: Promise.reject(new Error('offline'));
			return { ready, release: () => undefined, queryKey: '' };
		},
		adoptOrderSnapshot: jest.fn(async (payload: Record<string, unknown>) => {
			if (adoptionProtected) return 'protected';
			const { _rxdb_revision: revision, ...current } = payload;
			await writeResident((doc) => ({
				...doc,
				payload: { ...doc.payload, ...current },
				sync: { ...doc.sync, revision, adopted: { revision, at: Date.now() } },
			}));
			return 'applied';
		}),
	});
	runtime = { engine } as unknown as QueryRuntime;
	await database.orders.insert({
		...engineOrder({
			uuid: 'order',
			id: 5,
			status: 'pos-open',
			total: '100.00',
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
	jest.mocked(pushRecord).mockReset();
});
afterEach(async () => {
	jest.restoreAllMocks();
	await database.close();
	await (storeDB as unknown as RxDatabase).remove();
});

const approval = { total: '100.00', currency: 'USD' };
function poster(over: Partial<Parameters<typeof moneyCommandPoster>[0]> = {}) {
	return moneyCommandPoster({
		runtime,
		storeDB,
		orderUuid: 'order',
		post: store.post,
		approval,
		...over,
	});
}
const cash = (id = 'row-1', amount = '40.00') =>
	({
		id,
		amount,
		status: 'captured',
		updated_at_gmt: '2026-10-20T10:00:00',
		refunds: [],
		refunded_amount: '0.00',
		provider_refs: {},
	}) as unknown as PaymentRow;
const sentBodies = () => store.post.mock.calls.map(([, body]) => body as Record<string, unknown>);
const restart = () => resendOpenCommands(runtime, storeDB, 'order', { post: store.post });
const entries = async () => (await readOrderCommands(storeDB, 'order')).entries;

it('a capture retried after a lost answer re-sends the same command_id and body with a fresh revision', async () => {
	store.n = 1;
	store.modes = ['lose'];
	const post = poster();
	await expect(post('orders/5/payments/leg-1/capture', { amount: '10.00' })).rejects.toThrow(
		'Network Error'
	);
	store.n += 1; // another till moved the order meanwhile; the replay is checked before the revision
	await adoptStore(false);
	await restart();
	const [first, second] = sentBodies();
	expect(second.command_id).toBe(first.command_id);
	expect({ ...second, revision: null }).toEqual({ ...first, revision: null });
	expect(second.revision).not.toBe(first.revision);
	expect(await entries()).toEqual([]);
});

it('record sends no command_id and a byte-identical body on retry', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/payments', { payment: cash() })).rejects.toThrow();
	await restart();
	const [first, second] = sentBodies();
	expect(first).not.toHaveProperty('command_id');
	expect(JSON.stringify(second)).toBe(JSON.stringify(first));
});

it('an accepted partial cash record whose answer is lost is re-sent from the journal after restart and the retry creates no second row', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/payments', { payment: cash() })).rejects.toThrow();
	expect(await entries()).toHaveLength(1);
	await restart();
	expect(store.rows.size).toBe(1);
	expect(
		readLedger((await residentJSON()).payload.meta_data as never).map((row) => row.id)
	).toEqual(['row-1']);
	expect(await entries()).toEqual([]);
});

it('lost answer, then wcpos_payment_locked, then restart: the entry survives and the re-send yields exactly one row', async () => {
	store.modes = ['lose', 'locked'];
	await expect(poster()('orders/5/payments', { payment: cash() })).rejects.toThrow();
	await expect(restart()).rejects.toThrow('wcpos_payment_locked');
	expect((await entries())[0].sentAt).not.toBeNull();
	await restart();
	expect(store.rows.size).toBe(1);
	expect(await entries()).toEqual([]);
});

it('a crash after the 2xx and before the mirror keeps the entry; the re-send replays and mints no new identity', async () => {
	const post = poster();
	await post('orders/5/payments/leg-1/void', {}); // answered; the process dies before settle()
	const [entry] = await entries();
	await restart();
	expect(sentBodies()[1].command_id).toBe(entry.id);
	expect(store.commands.size).toBe(1);
	expect(await entries()).toEqual([]);
});

it.each([
	['intent', 'orders/5/payments/leg-1/intent', 'leg-1'],
	['submit', 'orders/5/payment-methods/cod/submit', 'attempt-1'],
])(
	'an %s re-sent after restart keeps its own id and command id, which differ, and runs once',
	async (_kind, url, own) => {
		store.modes = ['lose'];
		await expect(poster()(url, { attempt_id: 'attempt-1' })).rejects.toThrow();
		await restart();
		const [first, second] = sentBodies();
		expect(second.command_id).toBe(first.command_id);
		expect(second.command_id).not.toBe(own);
		expect(store.post.mock.calls[1][0]).toBe(url);
		expect(store.legs).toBe(1);
	}
);

it('a 403 leaves the entry in place', async () => {
	store.modes = ['403'];
	await expect(poster()('orders/5/payments', { payment: cash() })).rejects.toThrow();
	expect(await entries()).toHaveLength(1);
});

it('pre-flight changes the total before the first POST: no request is sent, no journal entry remains, and a newly approved submission proceeds', async () => {
	await writeResident((doc) => ({ ...doc, local: { dirty: true, pendingMutationIds: ['m'] } }));
	jest.mocked(pushRecord).mockImplementation(async () => {
		store.total = '120.00';
		store.n += 1;
		await writeResident((doc) => ({ ...doc, local: { dirty: false, pendingMutationIds: [] } }));
		await adoptStore(false);
		return (await resident()) as never;
	});
	const submit = (total: string) =>
		poster({ approval: { total, currency: 'USD' } })('orders/5/payment-methods/cod/submit', {
			attempt_id: 'a',
		});
	await expect(submit('100.00')).rejects.toMatchObject({ reason: 'order_changed' });
	expect(store.post).not.toHaveBeenCalled();
	expect(await entries()).toEqual([]);
	await submit('120.00');
	expect(store.legs).toBe(1);
});

it('a pre-flight push that moves the total from 100 to 120 stops a submit with order_changed before posting', async () => {
	await writeResident((doc) => ({ ...doc, local: { dirty: true, pendingMutationIds: ['m'] } }));
	jest.mocked(pushRecord).mockImplementation(async () => {
		store.total = '120.00';
		store.n += 1;
		await writeResident((doc) => ({ ...doc, local: { dirty: false, pendingMutationIds: [] } }));
		await adoptStore(false);
		return (await resident()) as never;
	});
	const error = await poster()('orders/5/payment-methods/cod/submit', {}).catch((e: unknown) => e);
	expect(error).toBeInstanceOf(MoneyCommandError);
	expect(error).toMatchObject({ reason: 'order_changed' });
	expect(store.post).not.toHaveBeenCalled();
});

it.each([
	['the total', { total: '120.00' }],
	['the currency at the same total', { currency: 'EUR' }],
])('a stale submit whose order moved %s ends as order_changed', async (_label, change) => {
	Object.assign(store, change);
	store.n += 1;
	await expect(poster()('orders/5/payment-methods/cod/submit', {})).rejects.toMatchObject({
		reason: 'order_changed',
	});
	expect(store.post).toHaveBeenCalledTimes(1);
	expect(await entries()).toEqual([]);
});

it.each([
	['intent', 'orders/5/payments/leg-1/intent'],
	['submit', 'orders/5/payment-methods/cod/submit'],
	['close', 'orders/5/close'],
])('a stale answer whose adoption is protected never re-sends a %s', async (_kind, url) => {
	store.modes = ['stale'];
	adoptionProtected = true;
	await expect(poster()(url, {})).rejects.toMatchObject({ reason: 'order_changed' });
	expect(store.post).toHaveBeenCalledTimes(1);
});

it('lost close answer, remote reopen, restart: the re-send replays C1 and creates no new completion', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/close', {})).rejects.toThrow();
	store.status = 'pos-open'; // another till reopened the sale
	store.total = '90.00';
	store.n += 1;
	await restart();
	expect(store.completions).toBe(1);
	expect(sentBodies()[1].command_id).toBe(sentBodies()[0].command_id);
});

it('a stale close with a changed but covered total requires renewed approval', async () => {
	store.total = '90.00'; // still covered by what was paid, but not what the cashier approved
	store.n += 1;
	await expect(poster()('orders/5/close', {})).rejects.toMatchObject({ reason: 'order_changed' });
	expect(store.completions).toBe(0);
	await poster({ approval: { total: '90.00', currency: 'USD' } })('orders/5/close', {});
	expect(store.completions).toBe(1);
});

it.each(['428 refresh', 'manual rebase', 'non-adopting acknowledgement'])(
	'a %s cannot authorize close or submit against a stale total or currency',
	async () => {
		// A valid post-answer adoption first.
		const post = poster();
		await post('orders/5/payments', { payment: cash() });
		await post.settle();
		expect((await residentJSON()).sync.adopted?.revision).toBe(store.revision);
		// The server moves; the naked writer stamps the server's revision without its document.
		store.total = '120.00';
		store.currency = 'EUR';
		store.n += 1;
		await nakedRevision(store.revision);
		const { sync } = await residentJSON();
		expect(sync.adopted?.revision).not.toBe(sync.revision);
		// The corrective refresh re-adopts under the EQUAL revision and the approval sees 120 EUR.
		await expect(poster()('orders/5/close', {})).rejects.toMatchObject({ reason: 'order_changed' });
		expect(requires.at(-1)?.readopt).toBe(true);
		expect((await residentJSON()).payload).toMatchObject({ total: '120.00', currency: 'EUR' });
		expect(store.post).toHaveBeenCalledTimes(1);
	}
);

it('a fresh close whose last full adoption predates the chain’s answer refreshes first, and refuses with revision_unavailable when the refresh cannot adopt', async () => {
	const post = poster();
	refreshWorks = false;
	await post('orders/5/payments', { payment: cash() });
	await post.settle(); // the post-answer refresh fails: the adoption predates the answer
	await expect(poster()('orders/5/close', {})).rejects.toMatchObject({
		reason: 'revision_unavailable',
	});
	expect(store.post).toHaveBeenCalledTimes(1);
	expect(await entries()).toEqual([]);
	refreshWorks = true;
	await poster()('orders/5/close', {});
	expect(store.completions).toBe(1);
});

it('a journaled sent command survives a non-enqueued full-meta replacement and reset/re-ingestion, retaining its frozen identity and blocking a fresh tender', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/payments', { payment: cash() })).rejects.toThrow();
	const [before] = await entries();
	await writeResident((doc) => ({ ...doc, payload: { ...doc.payload, meta_data: [] } }));
	const json = await residentJSON();
	await (await resident()).remove();
	await database.orders.insert(json as never);
	const [after] = await entries();
	expect(after).toEqual(before);
	expect(after.sentAt).not.toBeNull();
});

it('a second stale leaves the entry; 422 command_conflict is definitive and never retried', async () => {
	store.modes = ['stale', 'stale'];
	await expect(poster()('orders/5/payments/leg-1/capture', {})).rejects.toThrow(
		'wcpos_revision_stale'
	);
	expect(store.post).toHaveBeenCalledTimes(2);
	expect(await entries()).toHaveLength(1);
	store.commands.set('row-9', { fingerprint: 'another body', answer: {} });
	await expect(poster()('orders/5/payments', { payment: cash('row-9') })).rejects.toThrow(
		'wcpos_command_conflict'
	);
	expect(store.post).toHaveBeenCalledTimes(3);
	expect((await entries()).map(({ id }) => id)).not.toContain('row-9');
});

it('a 2xx answer’s revision is sent by the next command unless the resident adopted a server revision after the answer', async () => {
	refreshWorks = false;
	const post = poster();
	await post('orders/5/payments', { payment: cash('row-1', '10.00') });
	await post.settle();
	const answered = store.revision;
	await post('orders/5/payments', { payment: cash('row-2', '10.00') });
	expect(sentBodies()[1].revision).toBe(answered);
	await post.settle();
	refreshWorks = true;
	store.n += 1; // someone else moved it; a pull adopts that document after the answer
	await adoptStore(false);
	const adopted = store.revision;
	await post('orders/5/payments', { payment: cash('row-3', '10.00') });
	expect(sentBodies()[2].revision).toBe(adopted);
	expect(store.post).toHaveBeenCalledTimes(3);
});

it('a document read before the answer and adopted after it costs one stale round trip and no second row', async () => {
	const before = store.revision;
	const post = poster();
	await post('orders/5/payments', { payment: cash('row-1', '10.00') });
	await post.settle();
	await nakedRevision(before); // the earlier read lands after the answer, adopted whole
	await writeResident((doc) => ({
		...doc,
		sync: { ...doc.sync, adopted: { revision: before, at: Date.now() } },
	}));
	await post('orders/5/payments', { payment: cash('row-2', '10.00') });
	expect(store.post).toHaveBeenCalledTimes(3);
	expect(sentBodies()[2].payment).toEqual(sentBodies()[1].payment);
	expect(store.rows.size).toBe(2);
});

it('provenance is minted once per command and rides every re-send, and only on the completion-capable kinds', async () => {
	const provenance = jest.fn(async () => ({ register_id: 'reg', sale_counter: '7' }));
	store.modes = ['lose'];
	await expect(poster({ provenance })('orders/5/close', {})).rejects.toThrow();
	await restart();
	expect(provenance).toHaveBeenCalledTimes(1);
	expect(sentBodies()[1].provenance).toEqual({ register_id: 'reg', sale_counter: '7' });
	await poster({ provenance })('orders/5/payments/leg-1/void', {});
	expect(provenance).toHaveBeenCalledTimes(1);
});

it('the status poll passes through without an envelope', async () => {
	const post = jest.fn(async () => ({ data: { ok: true } }));
	await poster({ post })('payment-methods/stripe/bootstrap', { a: 1 });
	expect(post).toHaveBeenCalledWith('payment-methods/stripe/bootstrap', { a: 1 });
	expect(classifyMoneyRoute('orders/5/payments/leg-1/status')).toBeNull();
	expect(await entries()).toEqual([]);
});
