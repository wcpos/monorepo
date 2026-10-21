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
	recoverMoneyCommands,
	resendOpenCommands,
	retireSettledChains,
} from '../src/commands/money-command';
import { pushRecord } from '../src/mutations/push-record';
import {
	CHAIN_RETENTION_MS,
	CLAIM_LEASE_MS,
	claimRoute,
	journalCommand,
	markSent,
	readOrderCommands,
} from '../src/store-local/money-commands';
import { createEngineDatabase, createFakeEngine, engineOrder } from '../src/testing';

import type { QueryRuntime } from '../src/provider';
import type { RxDatabase } from 'rxdb';

jest.mock('../src/mutations/push-record', () => ({ pushRecord: jest.fn() }));
addRxPlugin(RxDBLocalDocumentsPlugin);

function httpError(status: number, code: string, data?: Record<string, unknown>) {
	return Object.assign(new Error(code), { response: { status, data: { code, data } } });
}

/** `lose`: stored, answer lost. `drop`: lost before the store saw it. `503`: refused unstored. */
type Mode =
	| 'lose'
	| 'drop'
	| '503'
	| 'locked'
	| '403'
	| 'stale'
	| 'provider'
	| 'outstanding'
	| 'malformed'
	| 'unstamped'
	| 'otherRow';
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
		if (mode === '503') throw httpError(503, 'http_service_unavailable');
		if (mode === 'provider') throw httpError(502, 'wcpos_provider_error');
		// A plugin filter or proxy answering 2xx with nothing the store said.
		if (mode === 'malformed') return { data: {} };
		// A well-formed answer about another payment (a proxy, a filter, a wrong handler).
		if (mode === 'otherRow')
			return {
				data: { payment: cash('other-row'), order: this.summary(), revision: this.revision },
			};
		// A close whose stamp could not persist: the order's summary, no completion (SPEC §4.3).
		if (mode === 'unstamped')
			return { data: { order: this.summary(), completion: null, revision: this.revision } };
		if (mode === 'outstanding')
			throw httpError(409, 'wcpos_balance_outstanding', { order: this.summary() });
		if (mode === 'drop') throw new Error('Network Error');
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
		// The leg routes answer their row too (`payment_response`); a submit its outcome.
		if (['intent', 'capture', 'void'].includes(route.kind))
			payment = {
				...cash(route.target!, '10.00'),
				status:
					route.kind === 'void' ? 'voided' : route.kind === 'capture' ? 'captured' : 'pending',
			} as PaymentRow;
		if (route.kind === 'intent' || route.kind === 'submit') this.legs += 1;
		if (route.kind === 'close') {
			this.completions += 1;
			this.status = 'completed';
		}
		this.n += 1;
		const answer = {
			...(payment ? { payment } : {}),
			...(route.kind === 'submit' ? { outcome: 'sent' } : {}),
			order: this.summary(),
			...(route.kind === 'close'
				? { completion: { n: this.completions, id: `c${this.completions}` } }
				: {}),
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
	// The dead process's claim lapses with its lease; until then a live sender may still settle it.
	await expect(restart()).rejects.toMatchObject({ reason: 'in_flight' });
	clock += CLAIM_LEASE_MS;
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

it('wcpos_fields_invalid settles the submit and returns the field errors to the form', async () => {
	const errors = { card_number: 'Enter a card number' };
	store.post.mockRejectedValueOnce(httpError(400, 'wcpos_fields_invalid', { errors }));
	const error = await poster()('orders/5/payment-methods/stripe/submit', {
		attempt_id: 'a',
	}).catch((e: unknown) => e);
	expect(error).toMatchObject({
		response: { data: { code: 'wcpos_fields_invalid', data: { errors } } },
	});
	expect(await entries()).toEqual([]);
});

it.each([
	[404, 'rest_no_route', 0],
	[422, 'wcpos_a_code_nobody_listed', 0],
	[409, 'wcpos_currency_locked', 0],
	[408, 'request_timeout', 1],
	[429, 'too_many_requests', 1],
	[426, 'wcpos_update_required', 1],
])(
	'a %i %s settles the command only when it is the server’s decision',
	async (status, code, left) => {
		store.post.mockRejectedValueOnce(httpError(status, code));
		await expect(poster()('orders/5/payments/leg-1/capture', {})).rejects.toThrow(code);
		expect(await entries()).toHaveLength(left);
	}
);

it('a refused pre-flight push ends as preflight_failed: nothing is sent and no entry remains', async () => {
	await writeResident((doc) => ({ ...doc, local: { dirty: true, pendingMutationIds: ['m'] } }));
	const refused = httpError(401, 'rest_not_logged_in');
	jest.mocked(pushRecord).mockRejectedValue(refused);
	const error = await poster()('orders/5/payments', { payment: cash() }).catch((e: unknown) => e);
	expect(error).toBeInstanceOf(MoneyCommandError);
	expect(error).toMatchObject({ reason: 'preflight_failed', cause: refused });
	expect(store.post).not.toHaveBeenCalled();
	expect(await entries()).toEqual([]);
});

it('a 502 wcpos_provider_error settles the submit: the store took nothing and the cashier can choose again', async () => {
	store.modes = ['provider'];
	await expect(
		poster()('orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} })
	).rejects.toThrow('wcpos_provider_error');
	expect(await entries()).toEqual([]);
	store.modes = ['503'];
	await expect(
		poster()('orders/5/payment-methods/g/submit', { attempt_id: 'a-2', values: {} })
	).rejects.toThrow('http_service_unavailable');
	expect(await entries()).toHaveLength(1);
});

it('a definitive refusal mirrored by the caller refreshes the resident ledger and records no answer chain', async () => {
	// Another till recorded money the resident has not seen: the close is refused as outstanding.
	store.total = '120.00';
	store.n += 1;
	store.modes = ['outstanding'];
	const post = poster({ approval: { total: '100.00', currency: 'USD' } });
	// The resident still holds authority under its old revision; the close goes out under it.
	await nakedRevision(store.revision);
	await writeResident((doc) => ({
		...doc,
		sync: { ...doc.sync, adopted: { revision: store.revision, at: Date.now() } },
	}));
	const refusal = await post('orders/5/close', {}).catch((error: unknown) => error);
	expect((refusal as Error).message).toBe('wcpos_balance_outstanding');
	expect(await entries()).toEqual([]);
	requires = [];
	await post.mirror({ order: store.summary() as never });
	expect(requires).toEqual([expect.objectContaining({ readopt: true })]);
	expect((await residentJSON()).payload.total).toBe('120.00');
	expect((await readOrderCommands(storeDB, 'order')).chain).toBeNull();
});

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

it('a close lost before the server stored it, then a remote reopen and a restart: the re-send is refused as stale and re-approval is required; no new completion', async () => {
	store.modes = ['drop'];
	await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
	store.total = '90.00'; // another till reopened the sale and changed it
	store.n += 1;
	await adoptStore(false); // and a pull adopted that document before the restart
	await expect(restart()).rejects.toMatchObject({ reason: 'order_changed' });
	const [first, second] = sentBodies();
	expect(second.revision).toBe(first.revision);
	expect(second.command_id).toBe(first.command_id);
	expect(store.post).toHaveBeenCalledTimes(2);
	expect(store.completions).toBe(0);
	expect(await entries()).toEqual([]);
});

it('a clock stepped back after an answer cannot wedge the approval of the next close', async () => {
	const post = poster();
	await post('orders/5/payments', { payment: cash() });
	await post.settle();
	clock -= 1_000_000; // the wall clock steps back behind the chain's answer
	await nakedRevision(store.revision); // a 428 refresh revokes the adoption's authority
	const close = poster();
	await close('orders/5/close', {});
	await close.settle();
	expect(store.completions).toBe(1);
	expect(await entries()).toEqual([]);
});

it('a capture retried through a fresh poster re-sends the journaled command, never a new one', async () => {
	store.modes = ['503'];
	await expect(poster()('orders/5/payments/leg-1/capture', { context: {} })).rejects.toThrow();
	const post = poster();
	await post('orders/5/payments/leg-1/capture', { context: {} });
	await post.settle();
	const [first, second] = sentBodies();
	expect(second.command_id).toBe(first.command_id);
	expect({ ...second, revision: null }).toEqual({ ...first, revision: null });
	expect(await entries()).toEqual([]);
});

it('a stale close with a changed but covered total requires renewed approval', async () => {
	store.total = '90.00'; // still covered by what was paid, but not what the cashier approved
	store.n += 1;
	await expect(poster()('orders/5/close', {})).rejects.toMatchObject({ reason: 'order_changed' });
	expect(store.completions).toBe(0);
	await poster({ approval: { total: '90.00', currency: 'USD' } })('orders/5/close', {});
	expect(store.completions).toBe(1);
});

/**
 * The shape every naked writer leaves: the stamp replaced, `sync.adopted` behind. That the real
 * writers (the 428 refresh, the manual rebase, a non-adopting acknowledgement) each leave exactly
 * this is pinned through the engine in sync-engine's `create-rxdb-sync-engine.naked-revision.test.ts`.
 */
it.each([
	['close', 'orders/5/close'],
	['submit', 'orders/5/payment-methods/cod/submit'],
])(
	'a revision written without its document cannot authorize a %s against a stale total or currency',
	async (_kind, url) => {
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
		await expect(poster()(url, {})).rejects.toMatchObject({ reason: 'order_changed' });
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
	const stamped = (await residentJSON()).sync.revision;
	const post = poster();
	await post('orders/5/payments', { payment: cash('row-1', '10.00') });
	await post.settle();
	const answered = store.revision;
	// The answer's revision lives in the chain, never on the resident: a stamp without its
	// document would make the next pull skip the server's payload (the equal-stamp skip).
	expect((await residentJSON()).sync.revision).toBe(stamped);
	expect(answered).not.toBe(stamped);
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

it('with no approval a command freezes an open entry’s approval, else the resident’s total and currency', async () => {
	// Nothing journaled for the order: the resident as it stands.
	await writeResident((doc) => ({ ...doc, payload: { ...doc.payload, total: '77.00' } }));
	store.modes = ['drop'];
	await expect(
		poster({ approval: undefined })('orders/5/payments/leg-2/void', {})
	).rejects.toThrow();
	expect((await entries())[0].approval).toEqual({ total: '77.00', currency: 'USD' });
	// A resumed leg (no press) captures a leg whose intent is still journaled: its approval.
	store.modes = ['drop'];
	await expect(
		poster({ approval: { total: '77.00', currency: 'USD' } })('orders/5/payments/leg-1/intent', {})
	).rejects.toThrow();
	await writeResident((doc) => ({ ...doc, payload: { ...doc.payload, total: '55.00' } }));
	store.modes = ['drop'];
	await expect(
		poster({ approval: undefined })('orders/5/payments/leg-1/capture', {})
	).rejects.toThrow();
	const capture = (await entries()).find(({ kind }) => kind === 'capture')!;
	expect(capture.approval).toEqual({ total: '77.00', currency: 'USD' });
});

const chain = async () => (await readOrderCommands(storeDB, 'order')).chain;

it('a settled order’s chain is dropped on the next journal write once older than CHAIN_RETENTION_MS', async () => {
	const post = poster();
	const { data } = await post('orders/5/payments', { payment: cash() });
	await post.mirror({ payment: data.payment as PaymentRow });
	// Any journal write sweeps: here another order's command is frozen.
	const write = (id: string) =>
		journalCommand(storeDB, {
			orderUuid: 'other',
			kind: 'capture',
			path: 'orders/6/payments/leg/capture',
			target: 'leg',
			id,
			body: {},
			approval,
			sentAt: null,
			sentRevision: null,
		});
	await write('c-1');
	expect(await chain()).not.toBeNull();
	clock += CHAIN_RETENTION_MS;
	await write('c-2');
	expect(await chain()).toBeNull();
});

it('a settled chain is retired once the resident adopts a later revision than its post-answer refresh, and kept until then', async () => {
	const post = poster();
	const { data } = await post('orders/5/payments', { payment: cash() });
	await post.mirror({ payment: data.payment as PaymentRow });
	expect(await chain()).toMatchObject({
		adoptedAfterAnswer: true,
		adoptedRevision: store.revision,
	});
	await retireSettledChains(runtime, storeDB);
	expect(await chain()).not.toBeNull();
	// Another till moves the order; the pull adopts the newer document.
	store.n += 1;
	await adoptStore(false);
	await retireSettledChains(runtime, storeDB);
	expect(await chain()).toBeNull();
});

it('a chain with an open entry is never retired by a later adoption', async () => {
	const post = poster();
	const { data } = await post('orders/5/payments', { payment: cash() });
	await post.mirror({ payment: data.payment as PaymentRow });
	store.modes = ['lose'];
	await expect(post('orders/5/payments', { payment: cash('row-2') })).rejects.toThrow();
	store.n += 1;
	await adoptStore(false);
	await retireSettledChains(runtime, storeDB);
	expect(await chain()).not.toBeNull();
});

it('the store-session recovery re-sends a sent, unanswered command with no tender on screen, and settles it', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
	expect(await entries()).toHaveLength(1);
	// No tender: the pull adopted the completed sale and it left the open orders.
	const recovered = await recoverMoneyCommands(runtime, storeDB, { post: store.post });
	expect(recovered).toEqual([
		{ orderUuid: 'order', answers: [expect.objectContaining({ kind: 'close' })] },
	]);
	expect(store.completions).toBe(1);
	expect(await entries()).toEqual([]);
});

it('the store-session recovery leaves a command on the wire from this process to its sender', async () => {
	let answer!: () => void;
	const held = new Promise<void>((resolve) => (answer = resolve));
	const sending = poster({
		post: async (url, body) => {
			await held;
			return store.post(url, body);
		},
	})('orders/5/close', {});
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
	expect((await entries())[0]?.sentAt).not.toBeNull();
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([]);
	answer();
	await sending;
	expect(store.post).toHaveBeenCalledTimes(1);
});

// The sender holds its command from before the journal write until its settle: a recovery that
// fires anywhere inside that span (here after the answer and before the caller's mirror, and
// during a stale adoption) leaves the command to its sender.
it('a recovery fired mid-send is a no-op, after the answer and before the settle', async () => {
	const post = poster();
	await post('orders/5/close', {});
	expect((await entries())[0]?.sentAt).not.toBeNull();
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([]);
	expect(store.post).toHaveBeenCalledTimes(1);
	await post.mirror({});
	expect(await entries()).toEqual([]);
	// Settled: the claim is gone, and a later command of the same kind is the journal's again.
	store.modes = ['lose'];
	await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toHaveLength(1);
});

it('a recovery fired mid-send is a no-op during a stale adoption and its re-send', async () => {
	let adopting!: () => void;
	const adoption = new Promise<void>((resolve) => (adopting = resolve));
	const adopt = runtime.engine.adoptOrderSnapshot as jest.Mock;
	const real = adopt.getMockImplementation()!;
	adopt.mockImplementationOnce(async (payload: Record<string, unknown>) => {
		await adoption;
		return real(payload);
	});
	store.modes = ['stale'];
	const sending = poster()('orders/5/payments/leg/capture', {});
	while (adopt.mock.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([]);
	adopting();
	await sending;
	expect(store.post).toHaveBeenCalledTimes(2);
});

// A malformed 2xx never settles a close, whoever re-sends it (sync-core `isCloseAnswer`).
it('Try again never settles a close on a malformed 2xx; the next re-send answers it', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
	store.modes = ['malformed'];
	await expect(restart()).rejects.toThrow('close_malformed_response');
	expect(await entries()).toHaveLength(1);
	expect(await restart()).toEqual([expect.objectContaining({ kind: 'close' })]);
	expect(await entries()).toEqual([]);
	expect(store.completions).toBe(1);
});

it('the session recovery never settles a close on a malformed 2xx; the next recovery answers it', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
	store.modes = ['malformed'];
	// Still journaled and reported unanswered, so the session tries again later.
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([
		{ orderUuid: 'order', answers: [], unanswered: true },
	]);
	expect(await entries()).toHaveLength(1);
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([
		{ orderUuid: 'order', answers: [expect.objectContaining({ kind: 'close' })] },
	]);
	expect(await entries()).toEqual([]);
});

it.each([
	['record', 'orders/5/payments', { payment: cash() }],
	['intent', 'orders/5/payments/leg/intent', { payment: cash('leg') }],
	['capture', 'orders/5/payments/leg/capture', {}],
	['void', 'orders/5/payments/leg/void', {}],
	['submit', 'orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} }],
	['cancel', 'orders/5/payment-methods/g/cancel', { attempt_id: 'a-1' }],
])('a malformed 2xx to a %s is never answered: the entry stays journaled', async (_, url, body) => {
	store.modes = ['malformed'];
	await expect(poster()(url, body)).rejects.toThrow('money_command_malformed_answer');
	expect(await entries()).toHaveLength(1);
	expect((await entries())[0].sentAt).not.toBeNull();
});

// Get-or-create and claim happen in one serialised journal write (`claimRoute`): two posters
// for one route never mint two commands.
it('two posters racing one route in one tab send one command id; the other is told it is in flight', async () => {
	const results = await Promise.allSettled([
		poster()('orders/5/close', {}),
		poster()('orders/5/close', {}),
	]);
	const ids = new Set(sentBodies().map(({ command_id }) => command_id));
	expect(ids.size).toBe(1);
	expect(store.completions).toBe(1);
	expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
	expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
		reason: { reason: 'in_flight' },
	});
});

// A send that throws gives its claim up at once (the entry stays); a caller that throws after
// its answer and never settles loses the claim to the lease, and then the recovery re-sends.
it('a send that throws frees its claim at once, and an abandoned answer frees it after the lease', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
	expect((await entries())[0].claimedBy).toBeNull();
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toHaveLength(1);
	expect(await entries()).toEqual([]);

	await poster()('orders/5/payments/leg-2/void', {}); // answered; the caller throws, never settles
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([]);
	clock += CLAIM_LEASE_MS;
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toHaveLength(1);
	expect(await entries()).toEqual([]);
});

// Server SPEC §4.3: a replayed close whose stamp could not persist answers `completion: null`.
// With a paid summary it settles as completed without a number; with an open one it stays.
it.each([
	['a paid', 'completed', 0],
	['an open', 'pos-open', 1],
])('a replayed close answered with no completion and %s summary', async (_, status, kept) => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
	store.status = status;
	store.modes = ['unstamped'];
	if (kept) await expect(restart()).rejects.toThrow('close_malformed_response');
	else
		expect(await restart()).toEqual([
			{ kind: 'close', data: expect.objectContaining({ completion: null }) },
		]);
	expect(await entries()).toHaveLength(kept);
});

// A poster's new command is unsent and claimed while its pre-flight runs: the recovery re-sends
// the order's other, lost command and leaves this one to its poster (never a crash leftover).
it('the recovery never deletes an unsent command another poster has claimed', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
	const fresh = {
		orderUuid: 'order',
		kind: 'close',
		path: 'orders/5/close',
		target: null,
		id: 'close-in-preflight',
		body: {},
		approval,
		sentAt: null,
		sentRevision: null,
	} as const;
	const route = { orderUuid: 'order', kind: 'close', target: null, rowId: null } as const;
	expect(await claimRoute(storeDB, route, 'cashier-tab', fresh)).toMatchObject({
		status: 'created',
	});
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toHaveLength(1);
	expect(await entries()).toEqual([expect.objectContaining({ id: 'close-in-preflight' })]);
});

// The journal is per store, the orders per cashier scope: a command is re-sent only in the scope
// that sent it, and waits for that scope otherwise (no cross-scope replay).
it('a command records its scope, and recovery and Try again re-send only the active scope’s', async () => {
	store.modes = ['lose'];
	await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
	expect((await entries())[0]).toMatchObject({ scope: 'test-scope' });
	const theirs = {
		orderUuid: 'order',
		kind: 'close',
		path: 'orders/5/close',
		target: null,
		id: 'their-close',
		body: {},
		approval,
		sentAt: null,
		sentRevision: null,
		scope: 'another-cashier',
	} as const;
	await claimRoute(
		storeDB,
		{ orderUuid: 'order', kind: 'close', target: null, rowId: null },
		'x',
		theirs
	);
	await markSent(storeDB, 'order', 'their-close', 'sha256:r1');
	clock += CLAIM_LEASE_MS;
	expect(await restart()).toEqual([expect.objectContaining({ kind: 'capture' })]);
	expect(await recoverMoneyCommands(runtime, storeDB, { post: store.post })).toEqual([]);
	expect(store.post.mock.calls.map(([url]) => url)).not.toContain('orders/5/close');
	expect(await entries()).toEqual([expect.objectContaining({ id: 'their-close' })]);
});

// A replayed submit or cancel cannot carry the awaiting-customer stamp change its first answer
// made; only the server document does. It settles once the post-answer refresh adopted it.
it.each([
	['submit', 'orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} }],
	['cancel', 'orders/5/payment-methods/g/cancel', { attempt_id: 'a-1' }],
])(
	'a replayed %s stays journaled until the refresh adopts the server document',
	async (_, url, body) => {
		store.modes = ['lose'];
		await expect(poster()(url, body)).rejects.toThrow('Network Error');
		refreshWorks = false;
		await expect(restart()).rejects.toThrow('money_command_unconfirmed');
		expect(await entries()).toEqual([expect.objectContaining({ claimedBy: null })]);
		refreshWorks = true;
		expect(await restart()).toHaveLength(1);
		expect(await entries()).toEqual([]);
	}
);

// The answer must be about this command: its row id is the record's own id, the leg's target,
// or the submitted attempt. Another payment's row never settles it.
it.each([
	['record', 'orders/5/payments', { payment: cash() }],
	['capture', 'orders/5/payments/leg/capture', {}],
	['void', 'orders/5/payments/leg/void', {}],
])('a %s answered with another payment’s row is never answered', async (_, url, body) => {
	store.modes = ['otherRow'];
	await expect(poster()(url, body)).rejects.toThrow('money_command_malformed_answer');
	expect(await entries()).toHaveLength(1);
});

it('a recorded submit answered with another attempt’s row is never answered', async () => {
	store.post.mockImplementationOnce(async () => ({
		data: {
			outcome: 'recorded',
			payment: cash('other-attempt'),
			order: store.summary(),
			revision: store.revision,
		},
	}));
	await expect(
		poster()('orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} })
	).rejects.toThrow('money_command_malformed_answer');
	expect(await entries()).toHaveLength(1);
});

// A close lost before the store saw it, then a cart edit the cashier made meanwhile: the re-send
// pushes that edit first (keeping its own revision), so the store answers stale and the changed
// sale is re-approved instead of closing at the pre-edit total.
it('an approved re-send pushes pending local work first, so an edit made after a lost close is re-approved', async () => {
	store.modes = ['drop'];
	await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
	await writeResident((doc) => ({
		...doc,
		local: { ...doc.local, dirty: true, pendingMutationIds: ['edit'] },
	}));
	jest.mocked(pushRecord).mockImplementation(async () => {
		store.total = '120.00';
		store.n += 1;
		await writeResident((doc) => ({
			...doc,
			local: { ...doc.local, dirty: false, pendingMutationIds: [] },
		}));
		return undefined as never;
	});
	await expect(restart()).rejects.toMatchObject({ reason: 'order_changed' });
	expect(pushRecord).toHaveBeenCalledTimes(1);
	expect(store.completions).toBe(0);
	expect(await entries()).toEqual([]);
});

it('the status poll passes through without an envelope', async () => {
	const post = jest.fn(async () => ({ data: { ok: true } }));
	await poster({ post })('payment-methods/stripe/bootstrap', { a: 1 });
	expect(post).toHaveBeenCalledWith('payment-methods/stripe/bootstrap', { a: 1 });
	expect(classifyMoneyRoute('orders/5/payments/leg-1/status')).toBeNull();
	expect(await entries()).toEqual([]);
});
