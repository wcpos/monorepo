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
	MoneyCommandError,
	sendMoneyCommand,
	settleMoneyCommand,
} from '../src/commands/money-command';
import { pushRecord } from '../src/mutations/push-record';
import {
	CLAIM_LEASE_MS,
	claimRoute,
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
});
