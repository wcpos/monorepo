/**
 * @jest-environment jsdom
 */
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { readLedger, withLedger } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';
import type { StoreDatabase } from '@wcpos/database';

import * as moneyAnswer from '../src/mutations/money-answer';
import {
	MoneyCommandError,
	moneyCommandPoster,
	recoverMoneyCommands,
	resendOpenCommands,
	sendMoneyCommand,
	settleMoneyCommand,
} from '../src/commands/money-command';
import { pushRecord } from '../src/mutations/push-record';
import * as residents from '../src/mutations/resident';
import {
	CLAIM_LEASE_MS,
	claimRoute,
	markSent,
	type MoneyCommandEntry,
	type MoneyCommandKind,
	readOrderCommands,
	settleCommand,
} from '../src/store-local/money-commands';
import { createEngineDatabase, createFakeEngine, engineOrder } from '../src/testing';

import type { QueryRuntime } from '../src/provider';
import type { RxDatabase } from 'rxdb';

jest.mock('../src/mutations/push-record', () => ({ pushRecord: jest.fn() }));
addRxPlugin(RxDBLocalDocumentsPlugin);

function httpError(status: number, code: string, data?: Record<string, unknown>) {
	return Object.assign(new Error(code), { response: { status, data: { code, data } } });
}

/** The money routes, as the store serves them (free `API/V2/Payments_Controller.php`). */
function routeOf(url: string): { kind: MoneyCommandKind; target: string | null } {
	const match =
		/^orders\/\d+\/(?:payments(?:\/([^/]+)\/(intent|capture|void|refund))?|payment-methods\/([^/]+)\/(submit|cancel)|(close))$/.exec(
			url
		)!;
	const kind = (match[2] ?? match[4] ?? match[5] ?? 'record') as MoneyCommandKind;
	return { kind, target: match[1] ?? match[3] ?? null };
}

/** `lose`: stored, answer lost. `drop`: lost before the store saw it. `503`: refused unstored. */
type Mode =
	| 'lose'
	| 'drop'
	| '503'
	| 'stale'
	| 'provider'
	| 'conflict'
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
		if (mode === '503') throw httpError(503, 'http_service_unavailable');
		if (mode === 'provider') throw httpError(502, 'wcpos_provider_error');
		// A re-send of an attempt the store closed after the gateway refused it.
		if (mode === 'conflict') throw httpError(409, 'wcpos_payment_conflict');
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
		if (mode === 'drop') throw new Error('Network Error');
		const { revision, command_id, ...rest } = body;
		const route = routeOf(url);
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
let ids: number;

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
const dirty = () =>
	writeResident((doc) => ({ ...doc, local: { dirty: true, pendingMutationIds: ['m'] } }));
const clean = async () => {
	await writeResident((doc) => ({ ...doc, local: { dirty: false, pendingMutationIds: [] } }));
	return (await resident()) as never;
};

beforeEach(async () => {
	jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1));
	store = new FakeStore();
	refreshWorks = true;
	adoptionProtected = false;
	requires = [];
	ids = 0;
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

type Over = { approval?: typeof approval; claimant?: string };
/**
 * Get or create the route's command and claim it (the journal's `claimRoute`), as a poster does
 * before it sends: a sent command is re-claimed for a re-send with its own id and frozen body.
 */
async function claim(
	url: string,
	body: Record<string, unknown>,
	over: Over = {}
): Promise<MoneyCommandEntry> {
	const { kind, target } = routeOf(url);
	const rowId = kind === 'record' ? (body.payment as PaymentRow).id : null;
	const candidate: MoneyCommandEntry = {
		orderUuid: 'order',
		kind,
		path: url,
		target,
		id: rowId ?? `command-${(ids += 1)}`,
		body,
		approval: over.approval ?? approval,
		sentAt: null,
		sentRevision: null,
		scope: 'test-scope',
	};
	const route = { orderUuid: 'order', kind, target, rowId };
	const claimed = await claimRoute(storeDB, route, over.claimant ?? 'poster', candidate);
	if (claimed.status === 'none') throw new Error('unclaimed');
	return claimed.entry;
}
const send = async (url: string, body: Record<string, unknown> = {}, over: Over = {}) =>
	sendMoneyCommand(runtime, storeDB, await claim(url, body, over), { post: store.post });
/** What a poster does with an answer: delete the entry, record the chain, run the refresh. */
async function sendAndSettle(url: string, body: Record<string, unknown> = {}) {
	const entry = await claim(url, body);
	const { data } = await sendMoneyCommand(runtime, storeDB, entry, { post: store.post });
	await settleCommand(storeDB, 'order', entry.id, {
		answerRevision: data.revision!,
		answeredAt: Date.now(),
	});
	await settleMoneyCommand(runtime, storeDB, 'order');
}
const sentBodies = () => store.post.mock.calls.map(([, body]) => body as Record<string, unknown>);
const entries = async () => (await readOrderCommands(storeDB, 'order')).entries;
const ledgerIds = async () =>
	readLedger((await residentJSON()).payload.meta_data as never).map((row) => row.id);

describe('sendMoneyCommand: the envelope', () => {
	it('a capture re-sent after a lost answer carries the same command_id and frozen body under a fresh revision', async () => {
		store.modes = ['lose'];
		await expect(send('orders/5/payments/leg-1/capture', { amount: '10.00' })).rejects.toThrow(
			'Network Error'
		);
		store.n += 1; // another till moved the order; the store checks the replay before the revision
		await adoptStore(false);
		const { data } = await send('orders/5/payments/leg-1/capture', { amount: '99.00' });
		const [first, second] = sentBodies();
		expect(second.command_id).toBe(first.command_id);
		expect({ ...second, revision: null }).toEqual({ ...first, revision: null });
		expect(second.revision).not.toBe(first.revision);
		expect(data.payment).toMatchObject({ id: 'leg-1', status: 'captured' });
	});

	it('a record sends no command_id, and its re-send is byte-identical and makes no second row', async () => {
		store.modes = ['lose'];
		await expect(send('orders/5/payments', { payment: cash() })).rejects.toThrow();
		await send('orders/5/payments', { payment: cash() });
		const [first, second] = sentBodies();
		expect(first).not.toHaveProperty('command_id');
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(store.rows.size).toBe(1);
	});

	// ADR 0040 Decided 1 rule 3: the offline record's edits (its provenance stamp) go first.
	it('a deferred record is re-sent after the pending push, same id and body, one row', async () => {
		const deferred = await poster({
			provenance: async () => ({ register_id: 'reg', sale_counter: '3' }),
		}).defer('orders/5/payments', { payment: cash() });
		await dirty();
		jest.mocked(pushRecord).mockImplementation(clean);
		const revision = store.revision;
		expect(await recover()).toEqual([
			{ orderUuid: 'order', answers: [expect.objectContaining({ kind: 'record' })] },
		]);
		expect(jest.mocked(pushRecord).mock.invocationCallOrder[0]).toBeLessThan(
			store.post.mock.invocationCallOrder[0]
		);
		const [body] = sentBodies();
		expect(JSON.stringify(body)).toBe(JSON.stringify({ ...deferred.body, revision }));
		expect((body.payment as PaymentRow).id).toBe(deferred.id);
		expect(body).not.toHaveProperty('command_id');
		expect(store.rows.size).toBe(1);
		expect(await entries()).toEqual([]);
	});

	it.each([
		[404, 'rest_no_route', 0],
		[422, 'wcpos_a_code_nobody_listed', 0],
		[409, 'wcpos_currency_locked', 0],
		[403, 'rest_forbidden', 1],
		[408, 'request_timeout', 1],
		[429, 'too_many_requests', 1],
		[426, 'wcpos_update_required', 1],
	])(
		'a %i %s settles the command only when it is the server’s decision',
		async (status, code, left) => {
			store.post.mockRejectedValueOnce(httpError(status, code));
			await expect(send('orders/5/payments/leg-1/capture')).rejects.toThrow(code);
			expect(await entries()).toHaveLength(left);
		}
	);

	it('a definitive refusal that stored a failed row mirrors that row and settles the command', async () => {
		store.post.mockRejectedValueOnce(
			httpError(409, 'wcpos_amount_exceeds_balance', { payment: { ...cash(), status: 'failed' } })
		);
		await expect(send('orders/5/payments', { payment: cash() })).rejects.toThrow(
			'wcpos_amount_exceeds_balance'
		);
		expect(await ledgerIds()).toEqual(['row-1']);
		expect(await entries()).toEqual([]);
	});
});

describe('sendMoneyCommand: the pre-flight', () => {
	it('a path that is not a money route is a programming error: preflight_failed, nothing sent', async () => {
		const entry: MoneyCommandEntry = {
			orderUuid: 'order',
			kind: 'capture',
			path: 'orders/5/notes',
			target: 'leg',
			id: 'command-x',
			body: {},
			approval,
			sentAt: null,
			sentRevision: null,
			scope: 'test-scope',
		};
		const error = await sendMoneyCommand(runtime, storeDB, entry, { post: store.post }).catch(
			(e: unknown) => e
		);
		expect(error).toMatchObject({
			reason: 'preflight_failed',
			cause: expect.objectContaining({ message: expect.stringContaining('"orders/5/notes"') }),
		});
		expect(store.post).not.toHaveBeenCalled();
	});

	it('a refused pre-flight push ends as preflight_failed: nothing is sent and no entry remains', async () => {
		await dirty();
		const refused = httpError(401, 'rest_not_logged_in');
		jest.mocked(pushRecord).mockRejectedValue(refused);
		const error = await send('orders/5/payments', { payment: cash() }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(MoneyCommandError);
		expect(error).toMatchObject({ reason: 'preflight_failed', cause: refused });
		expect(store.post).not.toHaveBeenCalled();
		expect(await entries()).toEqual([]);
	});

	it('a pre-flight push that moves the total stops a submit with order_changed before posting, and a re-approved one proceeds', async () => {
		await dirty();
		jest.mocked(pushRecord).mockImplementation(async () => {
			store.total = '120.00';
			store.n += 1;
			await clean();
			await adoptStore(false);
			return (await resident()) as never;
		});
		const submit = { attempt_id: 'a' };
		await expect(send('orders/5/payment-methods/cod/submit', submit)).rejects.toMatchObject({
			reason: 'order_changed',
		});
		expect(store.post).not.toHaveBeenCalled();
		expect(await entries()).toEqual([]);
		await send('orders/5/payment-methods/cod/submit', submit, {
			approval: { total: '120.00', currency: 'USD' },
		});
		expect(store.legs).toBe(1);
	});

	// A pending edit is refused (`wcpos_money_in_motion`) while a payment is in motion, so the
	// commands that end that payment never push it first: they would wait on the edit they unblock.
	it.each([
		['void', 'orders/5/payments/leg/void'],
		['capture', 'orders/5/payments/leg/capture'],
		['cancel', 'orders/5/payment-methods/g/cancel'],
	])('a %s never waits on a pending edit the payment in motion blocks', async (_, url) => {
		await dirty();
		jest.mocked(pushRecord).mockRejectedValue(httpError(422, 'wcpos_money_in_motion'));
		await send(url, { attempt_id: 'a-1' });
		expect(pushRecord).not.toHaveBeenCalled();
		expect(store.post).toHaveBeenCalledTimes(1);
	});
});

describe('sendMoneyCommand: stale answers and approval', () => {
	it.each([
		['the total', { total: '120.00' }],
		['the currency at the same total', { currency: 'EUR' }],
	])(
		'a stale submit whose order moved %s ends as order_changed and is settled',
		async (_, change) => {
			Object.assign(store, change);
			store.n += 1;
			await expect(send('orders/5/payment-methods/cod/submit')).rejects.toMatchObject({
				reason: 'order_changed',
			});
			expect(store.post).toHaveBeenCalledTimes(1);
			expect(await entries()).toEqual([]);
		}
	);

	it.each([
		['intent', 'orders/5/payments/leg-1/intent'],
		['submit', 'orders/5/payment-methods/cod/submit'],
		['close', 'orders/5/close'],
	])('a stale answer whose adoption is protected never re-sends a %s', async (_, url) => {
		store.modes = ['stale'];
		adoptionProtected = true;
		await expect(send(url)).rejects.toMatchObject({ reason: 'order_changed' });
		expect(store.post).toHaveBeenCalledTimes(1);
	});

	it('a stale capture is re-sent once under the current revision; a second stale leaves the entry, and 422 command_conflict settles it', async () => {
		store.modes = ['stale', 'stale'];
		await expect(send('orders/5/payments/leg-1/capture')).rejects.toThrow('wcpos_revision_stale');
		expect(store.post).toHaveBeenCalledTimes(2);
		expect(await entries()).toHaveLength(1);
		store.commands.set('row-9', { fingerprint: 'another body', answer: {} });
		await expect(send('orders/5/payments', { payment: cash('row-9') })).rejects.toThrow(
			'wcpos_command_conflict'
		);
		expect((await entries()).map(({ id }) => id)).not.toContain('row-9');
	});

	it('a lost close re-sent after a remote reopen replays under its first revision: no new completion', async () => {
		store.modes = ['lose'];
		await expect(send('orders/5/close')).rejects.toThrow();
		store.status = 'pos-open'; // another till reopened the sale
		store.total = '90.00';
		store.n += 1;
		await adoptStore(false);
		await send('orders/5/close');
		expect(store.completions).toBe(1);
		const [first, second] = sentBodies();
		expect(second).toEqual(first);
	});

	it('a close the store never saw, re-sent after a remote reopen, is refused as stale and needs re-approval', async () => {
		store.modes = ['drop'];
		await expect(send('orders/5/close')).rejects.toThrow('Network Error');
		store.total = '90.00';
		store.n += 1;
		await adoptStore(false);
		await expect(send('orders/5/close')).rejects.toMatchObject({ reason: 'order_changed' });
		const [first, second] = sentBodies();
		expect(second).toEqual(first);
		expect(store.completions).toBe(0);
		expect(await entries()).toEqual([]);
	});

	it('an approved re-send pushes pending local work first, so an edit made after a lost close is re-approved', async () => {
		store.modes = ['drop'];
		await expect(send('orders/5/close')).rejects.toThrow('Network Error');
		await dirty();
		jest.mocked(pushRecord).mockImplementation(async () => {
			store.total = '120.00';
			store.n += 1;
			return clean();
		});
		await expect(send('orders/5/close')).rejects.toMatchObject({ reason: 'order_changed' });
		expect(pushRecord).toHaveBeenCalledTimes(1);
		expect(store.completions).toBe(0);
	});

	/**
	 * The shape every naked writer leaves: the stamp replaced, `sync.adopted` behind (pinned through
	 * the engine in sync-engine's `create-rxdb-sync-engine.naked-revision.test.ts`).
	 */
	it.each([
		['close', 'orders/5/close'],
		['submit', 'orders/5/payment-methods/cod/submit'],
	])(
		'a revision written without its document cannot authorize a %s against a stale total or currency',
		async (_, url) => {
			store.total = '120.00';
			store.currency = 'EUR';
			store.n += 1;
			await nakedRevision(store.revision);
			// The corrective refresh re-adopts under the EQUAL revision and the approval sees 120 EUR.
			await expect(send(url)).rejects.toMatchObject({ reason: 'order_changed' });
			expect(requires.at(-1)?.readopt).toBe(true);
			expect((await residentJSON()).payload).toMatchObject({ total: '120.00', currency: 'EUR' });
			expect(store.post).not.toHaveBeenCalled();
		}
	);
});

describe('sendMoneyCommand: the answer', () => {
	it.each([
		['record', 'orders/5/payments', { payment: cash() }],
		['capture', 'orders/5/payments/leg/capture', {}],
		['void', 'orders/5/payments/leg/void', {}],
	])('a %s answered with another payment’s row is never answered', async (_, url, body) => {
		store.modes = ['otherRow'];
		await expect(send(url, body)).rejects.toThrow('money_command_malformed_answer');
		expect(await entries()).toHaveLength(1);
	});

	it('a recorded submit answered with another attempt’s row is never answered', async () => {
		store.post.mockResolvedValueOnce({
			data: { outcome: 'recorded', payment: cash('other-attempt'), order: store.summary() },
		});
		await expect(send('orders/5/payment-methods/g/submit', { attempt_id: 'a-1' })).rejects.toThrow(
			'money_command_malformed_answer'
		);
		expect(await entries()).toHaveLength(1);
	});

	it('a 2xx {} from a proxy or a filter proves nothing: the entry stays for a re-send', async () => {
		store.modes = ['malformed'];
		await expect(send('orders/5/payments/leg/capture')).rejects.toThrow(
			'money_command_malformed_answer'
		);
		expect(await entries()).toEqual([expect.objectContaining({ sentRevision: 'sha256:r1' })]);
	});

	// Server SPEC §4.3: a close whose stamp could not persist answers `completion: null`. With a
	// paid summary it is the answer; with an open one it proves nothing.
	it.each([
		['a paid', 'completed', true],
		['an open', 'pos-open', false],
	])('a close answered with no completion and %s summary', async (_, status, answered) => {
		store.status = status;
		store.modes = ['unstamped'];
		const sent = send('orders/5/close');
		if (answered) await expect(sent).resolves.toMatchObject({ data: { completion: null } });
		else await expect(sent).rejects.toThrow('close_malformed_response');
		expect(await entries()).toHaveLength(1);
	});

	it('a 502 wcpos_provider_error is re-sent once; the store’s conflict on the re-send settles the submit as refused', async () => {
		store.modes = ['provider', 'conflict'];
		await expect(send('orders/5/payment-methods/g/submit', { attempt_id: 'a-1' })).rejects.toThrow(
			'wcpos_provider_error'
		);
		expect(store.post).toHaveBeenCalledTimes(2);
		expect(await entries()).toEqual([]);
	});

	// The store answers a gateway that threw after dispatch with the same 502, its attempt `sent`
	// (adversarial finding 3 on #2798).
	it('an ambiguous 502 is re-sent under the same command, and a stored sent is its answer', async () => {
		const real = store.post.getMockImplementation()!;
		store.post.mockImplementationOnce(async (url, body) => {
			await real(url, body);
			throw httpError(502, 'wcpos_provider_error');
		});
		const { data } = await send('orders/5/payment-methods/g/submit', { attempt_id: 'a-1' });
		expect(data.outcome).toBe('sent');
		expect(store.post).toHaveBeenCalledTimes(2);
		expect(new Set(sentBodies().map(({ command_id }) => command_id)).size).toBe(1);
		expect(store.legs).toBe(1);
	});
});

describe('sendMoneyCommand: the stale-claimant fence', () => {
	// A pre-flight can outlast the claim lease. Another poster then replaces the still-unsent
	// command; the displaced sender never posts its own id (adversarial finding 1 on #2798).
	it('a sender displaced while its pre-flight outlasts the lease never posts', async () => {
		await dirty();
		let entered!: () => void;
		const inPush = new Promise<void>((resolve) => (entered = resolve));
		let releasePush!: () => void;
		const pushHeld = new Promise<void>((resolve) => (releasePush = resolve));
		jest
			.mocked(pushRecord)
			.mockImplementationOnce(async () => {
				entered();
				await pushHeld;
				return clean();
			})
			.mockImplementation(clean);
		const slow = send('orders/5/close', {}, { claimant: 'slow' });
		await inPush;
		clock += CLAIM_LEASE_MS;
		await send('orders/5/close', {}, { claimant: 'replacement' });
		const [replacement] = await entries();
		releasePush();
		await expect(slow).rejects.toMatchObject({ reason: 'in_flight' });
		expect(sentBodies().map(({ command_id }) => command_id)).toEqual([replacement.id]);
	});

	// An answer arriving after the lease lapsed, once another poster claimed and executed the
	// command, is never adopted and never deletes the entry: it is the other poster's now.
	it('a displaced sender never settles the command another claimant executed', async () => {
		let entered!: () => void;
		const sent = new Promise<void>((resolve) => (entered = resolve));
		let answerLate!: (error: unknown) => void;
		store.post.mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					answerLate = reject;
					entered();
				})
		);
		const slow = send('orders/5/close', {}, { claimant: 'slow' });
		await sent;
		clock += CLAIM_LEASE_MS;
		store.modes = ['lose'];
		await expect(send('orders/5/close', {}, { claimant: 'other' })).rejects.toThrow(
			'Network Error'
		);
		expect(store.completions).toBe(1);
		answerLate(
			httpError(409, 'wcpos_revision_stale', {
				current: { ...store.document(), total: '120.00' },
				currentRevision: 'sha256:r9',
			})
		);
		await expect(slow).rejects.toMatchObject({ reason: 'in_flight' });
		expect(await entries()).toEqual([expect.objectContaining({ kind: 'close' })]);
		expect((await residentJSON()).payload.total).toBe('100.00');
	});
});

describe('the answer chain and the post-answer refresh', () => {
	it('an answer’s revision is sent by the next command unless the resident adopted a server revision after the answer', async () => {
		refreshWorks = false;
		const stamped = (await residentJSON()).sync.revision;
		await sendAndSettle('orders/5/payments', { payment: cash('row-1', '10.00') });
		const answered = store.revision;
		// The answer's revision lives in the chain, never on the resident: a stamp without its
		// document would make the next pull skip the server's payload (the equal-stamp skip).
		expect((await residentJSON()).sync.revision).toBe(stamped);
		await sendAndSettle('orders/5/payments', { payment: cash('row-2', '10.00') });
		expect(sentBodies()[1].revision).toBe(answered);
		refreshWorks = true;
		store.n += 1; // someone else moved it; a pull adopts that document after the answer
		await adoptStore(false);
		const adopted = store.revision;
		await send('orders/5/payments', { payment: cash('row-3', '10.00') });
		expect(sentBodies()[2].revision).toBe(adopted);
	});

	it('a document read before the answer and adopted after it costs one stale round trip and no second row', async () => {
		const before = store.revision;
		await sendAndSettle('orders/5/payments', { payment: cash('row-1', '10.00') });
		await writeResident((doc) => ({
			...doc,
			sync: { ...doc.sync, revision: before, adopted: { revision: before, at: Date.now() } },
		}));
		await send('orders/5/payments', { payment: cash('row-2', '10.00') });
		expect(store.post).toHaveBeenCalledTimes(3);
		expect(sentBodies()[2].payment).toEqual(sentBodies()[1].payment);
		expect(store.rows.size).toBe(2);
	});

	it('a fresh close whose last adoption predates the chain’s answer refreshes first, and refuses with revision_unavailable when the refresh cannot adopt', async () => {
		refreshWorks = false;
		await sendAndSettle('orders/5/payments', { payment: cash() });
		await expect(send('orders/5/close')).rejects.toMatchObject({
			reason: 'revision_unavailable',
		});
		expect(store.post).toHaveBeenCalledTimes(1);
		expect(await entries()).toEqual([]);
		refreshWorks = true;
		await send('orders/5/close');
		expect(store.completions).toBe(1);
	});

	it('a clock stepped back after an answer cannot wedge the approval of the next close', async () => {
		refreshWorks = false;
		await sendAndSettle('orders/5/payments', { payment: cash() }); // its refresh fails
		clock -= 1_000_000; // the wall clock steps back behind the chain's answer
		refreshWorks = true;
		// The close's refresh adopts at a stamp older than the answer it follows.
		await send('orders/5/close');
		expect(store.completions).toBe(1);
	});

	// The receipt's barrier: only an adoption the post-answer refresh itself made counts, never an
	// older read landing while that refresh fails (adversarial finding 8 on #2798).
	it('the post-answer refresh records the barrier only when it adopted the document itself', async () => {
		const { data } = await send('orders/5/payments', { payment: cash() });
		await settleCommand(storeDB, 'order', 'row-1', {
			answerRevision: data.revision!,
			answeredAt: Date.now(),
		});
		const engine = runtime.engine as unknown as { require: unknown };
		const refresh = engine.require;
		engine.require = () => ({
			ready: (async () => {
				await writeResident((doc) => ({
					...doc,
					sync: { ...doc.sync, adopted: { revision: doc.sync.revision, at: Date.now() } },
				}));
				throw new Error('offline');
			})(),
			release: () => undefined,
			queryKey: '',
		});
		await settleMoneyCommand(runtime, storeDB, 'order');
		expect((await readOrderCommands(storeDB, 'order')).chain).not.toHaveProperty(
			'adoptedAfterAnswer'
		);
		engine.require = refresh;
		await settleMoneyCommand(runtime, storeDB, 'order');
		expect((await readOrderCommands(storeDB, 'order')).chain).toMatchObject({
			adoptedAfterAnswer: true,
			adoptedRevision: store.revision,
		});
	});

	// A server-mode poll that settles the row moves the order on the store (routes §4.3).
	/** The poll settled the row on the store, which moved the order to the revision it answers. */
	async function pollSettles() {
		store.n += 1;
		const payment = { ...cash('leg-1', '10.00'), status: 'authorized' } as PaymentRow;
		await poster().mirror({ payment, order: store.summary() as never, revision: store.revision });
		return store.revision;
	}

	it('a status poll’s revision is recorded as the chain, without the post-answer refresh, and the next void is sent once under it with no re-read', async () => {
		const polled = await pollSettles();
		expect(requires).toEqual([]);
		expect((await readOrderCommands(storeDB, 'order')).chain).toMatchObject({
			answerRevision: polled,
			polled: true,
		});
		// Stamped for the next order push (the drain reads sync.revision); the adoption stays, so
		// the stamp claims no authority (ADR 0040 §1.3).
		const { sync } = await residentJSON();
		expect(sync.revision).toBe(polled);
		expect(sync.adopted?.revision).toBe('sha256:r1');
		await poster()('orders/5/payments/leg-1/void', { reason: 'cancelled' });
		expect(requires).toEqual([]);
		expect(store.post).toHaveBeenCalledTimes(1);
		expect(sentBodies()[0].revision).toBe(polled);
	});

	it('an approved kind after a polled chain still re-adopts before it is sent', async () => {
		const polled = await pollSettles();
		await poster()('orders/5/close', {});
		expect(requires).toEqual([expect.objectContaining({ readopt: true })]);
		expect(store.post).toHaveBeenCalledTimes(1);
		expect(sentBodies()[0].revision).toBe(polled);
		expect(store.completions).toBe(1);
	});

	it('a mirror without a revision leaves the chain and the stamp as they were', async () => {
		await sendAndSettle('orders/5/payments', { payment: cash() });
		const { chain: before } = await readOrderCommands(storeDB, 'order');
		const { sync } = await residentJSON();
		await poster().mirror({ payment: cash(), order: store.summary() as never });
		expect((await readOrderCommands(storeDB, 'order')).chain).toEqual(before);
		expect((await residentJSON()).sync).toEqual(sync);
	});

	it('a poll answered before a later adoption never replaces the stamp', async () => {
		store.n += 1;
		await adoptStore(false);
		const adopted = store.revision;
		clock -= 1_000_000; // the poll's answer dates before the adoption
		const polled = await pollSettles();
		expect((await residentJSON()).sync.revision).toBe(adopted);
		expect(await chain()).toMatchObject({ answerRevision: polled, polled: true });
	});

	it('an adoption that lands while the poll is being mirrored keeps its revision', async () => {
		store.n += 1;
		const payment = { ...cash('leg-1', '10.00'), status: 'authorized' } as PaymentRow;
		const polledRevision = store.revision;
		// The answer has arrived; a pull adopts a newer document during the mirror's own awaits.
		const original = moneyAnswer.mirrorMoneyAnswer;
		let adopted = '';
		jest.spyOn(moneyAnswer, 'mirrorMoneyAnswer').mockImplementationOnce(async (...args) => {
			const out = await original(...args);
			store.n += 1;
			await adoptStore(false);
			adopted = store.revision;
			return out;
		});
		await poster().mirror({ payment, order: store.summary() as never, revision: polledRevision });
		expect(adopted).not.toBe(polledRevision);
		expect((await residentJSON()).sync.revision).toBe(adopted);
		expect(await chain()).toMatchObject({ answerRevision: polledRevision, polled: true });
	});

	it('a command answer’s post-answer refresh re-adopts over a poll’s stamp', async () => {
		await pollSettles();
		await sendAndSettle('orders/5/payments/leg-1/void', { reason: 'cancelled' });
		const { sync } = await residentJSON();
		expect(sync.revision).toBe(store.revision);
		expect(sync.adopted?.revision).toBe(sync.revision);
	});

	it('a second poll’s summary lands under the stamp the first poll made', async () => {
		refreshWorks = false; // the intent's refresh fails: the resident keeps the sent revision
		const post = poster();
		await post('orders/5/payments/leg-1/intent', {});
		await post.settle();
		const payment = { ...cash('leg-1', '10.00'), status: 'authorized' } as PaymentRow;
		for (const status of ['pos-partial', 'processing']) {
			store.n += 1;
			store.status = status;
			await post.mirror({ payment, order: store.summary() as never, revision: store.revision });
		}
		expect((await residentJSON()).payload.status).toBe('processing');
		expect((await residentJSON()).sync.revision).toBe(store.revision);
	});
});

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
const restart = () => resendOpenCommands(runtime, storeDB, 'order', { post: store.post });
const recover = () => recoverMoneyCommands(runtime, storeDB, { post: store.post });
const chain = async () => (await readOrderCommands(storeDB, 'order')).chain;

describe('moneyCommandPoster', () => {
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

	// Get-or-create and claim happen in one serialised journal write (`claimRoute`).
	it('two posters racing one route send one command id; the other is told it is in flight', async () => {
		const results = await Promise.allSettled([
			poster()('orders/5/close', {}),
			poster()('orders/5/close', {}),
		]);
		expect(new Set(sentBodies().map(({ command_id }) => command_id)).size).toBe(1);
		expect(store.completions).toBe(1);
		expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
		expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
			reason: { reason: 'in_flight' },
		});
	});

	it('with no approval a command freezes an open entry’s approval, else the resident’s total and currency', async () => {
		await writeResident((doc) => ({ ...doc, payload: { ...doc.payload, total: '77.00' } }));
		store.modes = ['drop'];
		await expect(
			poster({ approval: undefined })('orders/5/payments/leg-2/void', {})
		).rejects.toThrow();
		expect((await entries())[0].approval).toEqual({ total: '77.00', currency: 'USD' });
		// A resumed leg (no press) captures a leg whose intent is still journaled: its approval.
		store.modes = ['drop'];
		await expect(
			poster({ approval: { total: '77.00', currency: 'USD' } })(
				'orders/5/payments/leg-1/intent',
				{}
			)
		).rejects.toThrow();
		await writeResident((doc) => ({ ...doc, payload: { ...doc.payload, total: '55.00' } }));
		store.modes = ['drop'];
		await expect(
			poster({ approval: undefined })('orders/5/payments/leg-1/capture', {})
		).rejects.toThrow();
		const capture = (await entries()).find(({ kind }) => kind === 'capture')!;
		expect(capture.approval).toEqual({ total: '77.00', currency: 'USD' });
	});

	it('a path that is not a money route passes through without an envelope or a journal entry', async () => {
		const post = jest.fn(async () => ({ data: { ok: true } }));
		await poster({ post })('payment-methods/stripe/bootstrap', { a: 1 });
		await poster({ post })('orders/5/payments/leg-1/status', {});
		expect(post).toHaveBeenNthCalledWith(1, 'payment-methods/stripe/bootstrap', { a: 1 });
		expect(post).toHaveBeenNthCalledWith(2, 'orders/5/payments/leg-1/status', {});
		expect(await entries()).toEqual([]);
	});

	// `wcpos_balance_outstanding`: another till recorded money the resident has not seen.
	it('a definitive refusal earns the next settle the corrective refresh, and records no answer chain', async () => {
		store.post.mockRejectedValueOnce(
			httpError(409, 'wcpos_balance_outstanding', { order: store.summary() })
		);
		const post = poster();
		await expect(post('orders/5/close', {})).rejects.toThrow('wcpos_balance_outstanding');
		expect(await entries()).toEqual([]);
		requires = [];
		await post.mirror({ order: store.summary() as never });
		expect(requires).toEqual([expect.objectContaining({ readopt: true })]);
		expect(await chain()).toBeNull();
	});
});

describe('defer: a record journaled offline (ADR 0040 Decided 1)', () => {
	it('defer journals a record as sent-undispatched, no POST', async () => {
		const deferred = await poster().defer('orders/5/payments', { payment: cash() });
		expect(store.post).not.toHaveBeenCalled();
		expect(deferred).toMatchObject({ id: 'row-1', kind: 'record', sentRevision: null });
		expect(await entries()).toEqual([
			expect.objectContaining({
				id: 'row-1',
				sentAt: expect.any(String),
				sentRevision: null,
				claimedBy: null,
			}),
		]);
		await expect(poster().defer('orders/5/close', {})).rejects.toThrow(
			'money_command_not_deferrable'
		);
	});

	it('defer on an already-journaled row id returns it', async () => {
		const first = await poster().defer('orders/5/payments', { payment: cash() });
		const again = await poster().defer('orders/5/payments', { payment: cash('row-1', '99.00') });
		expect(again).toMatchObject({ id: 'row-1', body: first.body, sentAt: first.sentAt });
		expect(await entries()).toEqual([expect.objectContaining({ id: 'row-1', claimedBy: null })]);
		expect(store.post).not.toHaveBeenCalled();
	});

	it('a failed re-send pre-flight keeps a deferred entry and reports unanswered', async () => {
		await poster().defer('orders/5/payments', { payment: cash() });
		await dirty();
		jest.mocked(pushRecord).mockRejectedValue(httpError(422, 'rest_invalid_param'));
		expect(await recover()).toEqual([{ orderUuid: 'order', answers: [], unanswered: true }]);
		expect(store.post).not.toHaveBeenCalled();
		expect(await entries()).toEqual([
			expect.objectContaining({ id: 'row-1', sentRevision: null, claimedBy: null }),
		]);
	});

	it('a refused deferred record mirrors the failed row, settles, and is returned as refused', async () => {
		await poster().defer('orders/5/payments', { payment: cash() });
		const failed = { ...cash(), status: 'failed' } as PaymentRow;
		store.rows.set('row-1', failed); // the store stored the refused row as failed
		store.post.mockRejectedValueOnce(
			httpError(409, 'wcpos_order_already_paid', { payment: failed, order: store.summary() })
		);
		expect(await recover()).toEqual([
			{
				orderUuid: 'order',
				answers: [],
				refused: {
					code: 'wcpos_order_already_paid',
					row: expect.objectContaining({ id: 'row-1', status: 'failed' }),
					summary: expect.objectContaining({ status: 'pos-open' }),
				},
			},
		]);
		expect(await entries()).toEqual([]);
		expect(readLedger((await residentJSON()).payload.meta_data as never)).toEqual([
			expect.objectContaining({ id: 'row-1', status: 'failed' }),
		]);
		expect(await recover()).toEqual([]);
	});
});

describe('Try again: resendOpenCommands', () => {
	it('provenance is minted once per command, rides every re-send, and only on the kinds the store stamps from', async () => {
		const provenance = jest.fn(async () => ({ register_id: 'reg', sale_counter: '7' }));
		store.modes = ['lose'];
		await expect(poster({ provenance })('orders/5/close', {})).rejects.toThrow();
		await restart();
		expect(provenance).toHaveBeenCalledTimes(1);
		expect(sentBodies()[1].provenance).toEqual({ register_id: 'reg', sale_counter: '7' });
		await poster({ provenance })('orders/5/payments/leg-1/void', {});
		expect(provenance).toHaveBeenCalledTimes(1);
		expect(sentBodies()[2]).not.toHaveProperty('provenance');
	});

	it('a retired route is never re-sent', async () => {
		store.modes = ['lose'];
		const post = poster();
		await expect(post('orders/5/payments/leg-1/intent', {})).rejects.toThrow('Network Error');
		await post.retire('intent', 'leg-1');
		expect(await entries()).toEqual([]);
		expect(await restart()).toEqual([]);
		expect(store.post).toHaveBeenCalledTimes(1);
	});

	// Codex 4342609024 on #2831: the refusal settles the entry, so nothing else would correct the
	// resident's stale money.
	it('a replay refused as outstanding runs the corrective refresh before the refusal propagates', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
		store.total = '120.00'; // another till recorded money the resident has not seen
		store.n += 1;
		store.post.mockRejectedValueOnce(
			httpError(409, 'wcpos_balance_outstanding', { order: store.summary() })
		);
		requires = [];
		await expect(restart()).rejects.toThrow('wcpos_balance_outstanding');
		expect(requires).toEqual([expect.objectContaining({ readopt: true })]);
		expect((await residentJSON()).payload.total).toBe('120.00');
		expect(await entries()).toEqual([]);
	});

	it('an accepted cash record whose answer is lost is re-sent from the journal and makes no second row', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/payments', { payment: cash() })).rejects.toThrow();
		expect(await entries()).toHaveLength(1);
		await restart();
		const [first, second] = sentBodies();
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(store.rows.size).toBe(1);
		expect(await ledgerIds()).toEqual(['row-1']);
		expect(await entries()).toEqual([]);
	});

	it('lost answer, then wcpos_payment_locked: the entry survives and the next re-send makes exactly one row', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/payments', { payment: cash() })).rejects.toThrow();
		store.post.mockRejectedValueOnce(httpError(409, 'wcpos_payment_locked'));
		await expect(restart()).rejects.toThrow('wcpos_payment_locked');
		expect((await entries())[0].sentAt).not.toBeNull();
		await restart();
		expect(store.rows.size).toBe(1);
		expect(await entries()).toEqual([]);
	});

	it('a crash after the 2xx and before the mirror keeps the entry; the re-send after the lease replays it', async () => {
		await poster()('orders/5/payments/leg-1/void', {}); // answered; the process dies before settle()
		const [entry] = await entries();
		// Until the dead process's lease lapses, a live sender may still settle it.
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
		'an %s re-sent keeps its command id, which is not its own id, and runs once',
		async (_kind, url, own) => {
			store.modes = ['lose'];
			await expect(poster()(url, { attempt_id: 'attempt-1' })).rejects.toThrow();
			await restart();
			const [first, second] = sentBodies();
			expect(second.command_id).toBe(first.command_id);
			expect(second.command_id).not.toBe(own);
			expect(store.legs).toBe(1);
		}
	);

	// A replayed close is validated like a first close (CodeRabbit 4328977234 on #2798).
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

	// A replayed submit or cancel cannot carry the stamp change its first answer made; only the
	// store's document does (Codex 4333124084 on #2798).
	it.each([
		['submit', 'orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} }],
		['cancel', 'orders/5/payment-methods/g/cancel', { attempt_id: 'a-1' }],
	])(
		'a replayed %s stays journaled until the refresh adopts the store’s document',
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

	it('a replayed submit is not confirmed by a pull adopted while the re-send was in flight', async () => {
		store.modes = ['lose'];
		await expect(
			poster()('orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} })
		).rejects.toThrow('Network Error');
		const real = store.post.getMockImplementation()!;
		store.post.mockImplementationOnce(async (url, body) => {
			await adoptStore(true); // the normal pull, mid-flight
			return real(url, body);
		});
		refreshWorks = false;
		await expect(restart()).rejects.toThrow('money_command_unconfirmed');
		expect(await entries()).toHaveLength(1);
	});

	it('a pull adopted in the same millisecond as the answer never confirms a replayed submit', async () => {
		store.modes = ['lose'];
		await expect(
			poster()('orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} })
		).rejects.toThrow('Network Error');
		const real = store.post.getMockImplementation()!;
		store.post.mockImplementationOnce(async (url, body) => {
			const answer = await real(url, body);
			await adoptStore(true); // the normal pull, at the answer
			return answer;
		});
		jest.mocked(Date.now).mockReturnValue(clock); // one millisecond for the whole replay
		refreshWorks = false;
		await expect(restart()).rejects.toThrow('money_command_unconfirmed');
		expect(await entries()).toHaveLength(1);
	});

	it('a replayed submit is not confirmed by an older adoption landing while its refresh fails', async () => {
		store.modes = ['lose'];
		await expect(
			poster()('orders/5/payment-methods/g/submit', { attempt_id: 'a-1', values: {} })
		).rejects.toThrow('Network Error');
		Object.assign(runtime.engine, {
			require: () => ({
				ready: (async () => {
					await writeResident((doc) => ({
						...doc,
						sync: { ...doc.sync, adopted: { revision: doc.sync.revision, at: Date.now() } },
					}));
					throw new Error('offline');
				})(),
				release: () => undefined,
				queryKey: '',
			}),
		});
		await expect(restart()).rejects.toThrow('money_command_unconfirmed');
		expect(await entries()).toHaveLength(1);
	});

	// A command settled between the snapshot and the claim is gone (adversarial 2 on #2798).
	it('a replaying poster never freezes a new command when the journaled one is gone', async () => {
		await expect(poster({ replay: true })('orders/5/close', {})).rejects.toThrow(
			'money_command_unclaimed'
		);
		expect(store.post).not.toHaveBeenCalled();
		expect(await entries()).toEqual([]);
	});
});

describe('the store-session recovery', () => {
	it('a send that throws frees its claim at once, and an abandoned answer frees it after the lease', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
		expect((await entries())[0].claimedBy).toBeNull();
		expect(await recover()).toHaveLength(1);
		expect(await entries()).toEqual([]);

		await poster()('orders/5/payments/leg-2/void', {}); // answered; the caller never settles
		expect(await recover()).toEqual([]);
		clock += CLAIM_LEASE_MS;
		expect(await recover()).toHaveLength(1);
		expect(await entries()).toEqual([]);
	});

	it('re-sends a sent, unanswered command with no tender on screen, and settles it', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
		expect(await recover()).toEqual([
			{ orderUuid: 'order', answers: [expect.objectContaining({ kind: 'close' })] },
		]);
		expect(store.completions).toBe(1);
		expect(await entries()).toEqual([]);
	});

	it('leaves a command on the wire from this process to its sender', async () => {
		let answer!: () => void;
		const held = new Promise<void>((resolve) => (answer = resolve));
		const sending = poster({
			post: async (url, body) => {
				await held;
				return store.post(url, body);
			},
		})('orders/5/close', {});
		while ((await entries())[0]?.sentAt == null)
			await new Promise((resolve) => setTimeout(resolve, 0));
		expect(await recover()).toEqual([]);
		answer();
		await sending;
		expect(store.post).toHaveBeenCalledTimes(1);
	});

	it('is a no-op fired after the answer and before the settle', async () => {
		const post = poster();
		await post('orders/5/close', {});
		expect(await recover()).toEqual([]);
		expect(store.post).toHaveBeenCalledTimes(1);
		await post.mirror({});
		expect(await entries()).toEqual([]);
	});

	it('is a no-op fired during a stale adoption and its re-send', async () => {
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
		expect(await recover()).toEqual([]);
		adopting();
		await sending;
		expect(store.post).toHaveBeenCalledTimes(2);
	});

	// The session retries an unanswered order on `RECOVERY_RETRY_DELAYS_MS` (Codex 4333265115).
	it('reports a re-send that got no definitive answer as unanswered, and answers it on the next run', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/close', {})).rejects.toThrow('Network Error');
		store.modes = ['malformed'];
		expect(await recover()).toEqual([{ orderUuid: 'order', answers: [], unanswered: true }]);
		expect(await entries()).toHaveLength(1);
		expect(await recover()).toEqual([
			{ orderUuid: 'order', answers: [expect.objectContaining({ kind: 'close' })] },
		]);
		expect(await entries()).toEqual([]);
	});

	// A thrown read is not an absence: the command stays journaled and the run reports it
	// unanswered, so the session retries it on RECOVERY_RETRY_DELAYS_MS.
	it('a resident lookup that rejects leaves the command journaled and asks for a retry', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
		const lookup = jest
			.spyOn(residents, 'findEngineResident')
			.mockRejectedValue(new Error('storage read failed'));
		expect(await recover()).toEqual([{ orderUuid: 'order', answers: [], unanswered: true }]);
		expect(await entries()).toEqual([
			expect.objectContaining({ kind: 'capture', claimedBy: null }),
		]);
		expect(store.post).toHaveBeenCalledTimes(1);
		lookup.mockRestore();
		expect(await recover()).toEqual([
			{ orderUuid: 'order', answers: [expect.objectContaining({ kind: 'capture' })] },
		]);
	});

	// A poster's new command is unsent and claimed while its pre-flight runs (CodeRabbit 4332935302).
	it('never deletes an unsent command another poster has claimed', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
		const fresh: MoneyCommandEntry = {
			orderUuid: 'order',
			kind: 'close',
			path: 'orders/5/close',
			target: null,
			id: 'close-in-preflight',
			body: {},
			approval,
			sentAt: null,
			sentRevision: null,
			scope: 'test-scope',
		};
		const route = { orderUuid: 'order', kind: 'close', target: null, rowId: null } as const;
		expect(await claimRoute(storeDB, route, 'cashier-tab', fresh)).toMatchObject({
			status: 'created',
		});
		expect(await recover()).toHaveLength(1);
		expect(await entries()).toEqual([expect.objectContaining({ id: 'close-in-preflight' })]);
	});

	// The journal is per store, the orders per cashier scope (Codex 4333124076, 4333445290).
	it('a command records its scope, and recovery and Try again re-send only the active scope’s', async () => {
		store.modes = ['lose'];
		await expect(poster()('orders/5/payments/leg/capture', {})).rejects.toThrow('Network Error');
		expect((await entries())[0]).toMatchObject({ scope: 'test-scope' });
		const theirs: MoneyCommandEntry = {
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
		};
		const route = { orderUuid: 'order', kind: 'close', target: null, rowId: null } as const;
		await claimRoute(storeDB, route, 'x', theirs);
		await markSent(storeDB, 'order', 'their-close', 'sha256:r1', 'x');
		clock += CLAIM_LEASE_MS;
		expect(await restart()).toEqual([expect.objectContaining({ kind: 'capture' })]);
		expect(await recover()).toEqual([]);
		expect(store.post.mock.calls.map(([url]) => url)).not.toContain('orders/5/close');
		expect(await entries()).toEqual([expect.objectContaining({ id: 'their-close' })]);
	});

	it('retires a settled chain once the resident adopts a later revision than its post-answer refresh', async () => {
		const post = poster();
		const { data } = (await post('orders/5/payments', { payment: cash() })) as {
			data: { payment: PaymentRow };
		};
		await post.mirror({ payment: data.payment });
		expect(await chain()).toMatchObject({
			adoptedAfterAnswer: true,
			adoptedRevision: store.revision,
		});
		await recover();
		expect(await chain()).not.toBeNull();
		store.n += 1; // another till moves the order; the pull adopts the newer document
		await adoptStore(false);
		await recover();
		expect(await chain()).toBeNull();
	});

	it('never retires the chain of an order with an open entry', async () => {
		const post = poster();
		const { data } = (await post('orders/5/payments', { payment: cash() })) as {
			data: { payment: PaymentRow };
		};
		await post.mirror({ payment: data.payment });
		store.modes = ['lose', '503']; // the recovery's re-send fails: the entry stays open
		await expect(post('orders/5/payments', { payment: cash('row-2') })).rejects.toThrow();
		store.n += 1;
		await adoptStore(false);
		await recover();
		expect(await chain()).not.toBeNull();
	});
});
