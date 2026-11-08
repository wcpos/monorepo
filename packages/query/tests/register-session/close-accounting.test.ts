/**
 * The close's accounting, ported from the hook's suite when the close moved into query: the
 * engine read is this package's own `observeEngineQuery`, fed from in-memory hits, and the session,
 * movements, closures and register document are real databases.
 */
import { BehaviorSubject, map } from 'rxjs';
import { Query } from 'mingo';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { cashMovementsLiteral } from '@wcpos/database/collections/schemas/cash-movements';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { registerSessionsLiteral } from '@wcpos/database/collections/schemas/register-sessions';

import { type CloseContext, closeRegister } from '../../src/register-session/close';
import { observeSessionAccounting } from '../../src/register-session/reads';
import { remintRegister } from '../../src/register-session/register-document';
import * as sessionStore from '../../src/register-session/session-store';

jest.mock('@wcpos/utils/logger', () => {
	const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };
	return { getLogger: () => logger };
});
jest.mock('../../src/engine-query', () => ({
	observeEngineQuery: (...args: Parameters<typeof mockObserve>) => mockObserve(...args),
}));
jest.mock('../../src/requirement-bridge', () => ({
	declareRequirements: (...args: unknown[]) => mockDeclareRequirements(...args),
}));

type Row = Record<string, unknown>;
type Hit = {
	record: {
		remoteId?: number | null;
		uuid: string;
		local: { dirty: boolean; pendingMutationIds?: string[] };
		payload: Row;
	};
};
let mockOrders = new BehaviorSubject<Hit[]>([]);
let mockRefunds = new BehaviorSubject<Hit[]>([]);
let mockParentOrders: BehaviorSubject<Hit[]> | undefined;
const mockQueryCalls = jest.fn();
function mockObserve(_engine: unknown, query: { collection: string; selector: Row }) {
	mockQueryCalls(query);
	const source =
		query.collection === 'refunds'
			? mockRefunds
			: query.selector.id && mockParentOrders
				? mockParentOrders
				: mockOrders;
	return source.pipe(
		map((hits) => ({
			hits: hits.filter(({ record }) =>
				new Query(query.selector).test({
					...record.payload,
					session_id:
						(record.payload.meta_data as { key: string; value: unknown }[] | undefined)?.find(
							({ key }) => key === '_wcpos_session'
						)?.value ?? '',
				})
			),
		}))
	);
}
const mockReleaseParents = jest.fn();
const mockDeclareRequirements = jest.fn((..._args: unknown[]) => [
	{ release: mockReleaseParents, ready: Promise.resolve() },
]);

const realWriteClosure = sessionStore.writeClosure;
const writeClosure = jest.spyOn(sessionStore, 'writeClosure');
const closeSession = jest.spyOn(sessionStore, 'closeSession');
const requeueClose = jest.spyOn(sessionStore, 'requeueClose');

addRxPlugin(RxDBLocalDocumentsPlugin);
let storeDB: StoreDatabase;
let userDB: UserDatabase;
let ctx: CloseContext;
const engine = {};
const session = {
	id: 'session',
	register_id: 'register',
	status: 'open',
	opened_at_gmt: '2026-09-12T08:00:00.000Z',
	opened_by: 7,
	counted_float: '100',
	sync_status: 'synced',
	sync_attempts: 0,
	server_expected: { cash: '100' },
	server_sales_count: 0,
	server_expected_at: '2026-09-15T09:00:00.000Z',
	server_movement_ids: [],
};
const movement = {
	id: 'movement',
	session_id: 'session',
	type: 'paid_in',
	amount: '20',
	reason: '',
	created_by: 7,
	created_at_gmt: '2026-09-15T09:30:00.000Z',
	sync_status: 'pending',
	sync_attempts: 0,
};

function refundHit(amount = '20', stamp = 'session'): Hit {
	return {
		record: {
			uuid: 'refund:20',
			local: { dirty: true },
			payload: {
				id: 20,
				parent_id: 1,
				date_created_gmt: '2026-09-15T10:00:00',
				amount,
				meta_data: [{ key: '_wcpos_session', value: stamp }],
			},
		},
	};
}
function parentHit(
	saleSession = 'old-session',
	allocated = true,
	modified = '2026-09-01',
	payment = {}
): Hit {
	return {
		record: {
			uuid: 'parent',
			local: { dirty: false },
			payload: {
				id: 1,
				date_modified_gmt: modified,
				date_created_gmt: modified,
				meta_data: [
					{
						key: '_wcpos_payments',
						value: {
							schema: 1,
							payments: [
								{
									id: 'card',
									created_at_gmt: modified,
									updated_at_gmt: modified,
									session_id: saleSession,
									kind: 'card',
									method_id: 'stripe',
									status: 'captured',
									amount: '100',
									refunded_amount: allocated ? '20' : '0',
									refunds: allocated ? [{ id: 20, amount: '20', status: 'succeeded' }] : [],
									...payment,
								},
							],
						},
					},
				],
			},
		},
	};
}

beforeEach(async () => {
	jest.clearAllMocks();
	writeClosure.mockImplementation(realWriteClosure);
	mockOrders = new BehaviorSubject<Hit[]>([]);
	mockRefunds = new BehaviorSubject<Hit[]>([]);
	mockParentOrders = undefined;
	storeDB = await createRxDatabase({
		name: `closeaccounting${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	userDB = await createRxDatabase({
		name: `closeaccountinguser${Math.random().toString(36).slice(2)}`,
		storage: getRxStorageMemory(),
		localDocuments: true,
		multiInstance: false,
	});
	await storeDB.addCollections({
		register_sessions: { schema: registerSessionsLiteral, autoMigrate: false },
		cash_movements: { schema: cashMovementsLiteral, autoMigrate: false },
		closures: { schema: closuresLiteral, autoMigrate: false },
	});
	await remintRegister(userDB);
	ctx = {
		storeDB,
		userDB,
		siteUuid: 'site',
		actor: { id: '7', name: 'Pat' },
		engine: engine as CloseContext['engine'],
		site: {
			populate$: () =>
				new BehaviorSubject([
					{ id: 8, display_name: 'Alex' },
					{ id: 9, display_name: 'Sam' },
				]),
		} as unknown as CloseContext['site'],
		credentials: { id: 7, display_name: 'Pat' },
		timezone: 'device',
		registerName: 'Front',
	};
});
afterEach(async () => {
	await storeDB.remove();
	await userDB.remove();
});
const insert = (patch: Row = {}) =>
	storeDB.register_sessions.insert({ ...session, ...patch } as never);
const sessionRow = async () => (await storeDB.register_sessions.findOne('session').exec())!;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const refundsByMethod = (closure: { breakdowns: Row }) =>
	Object.fromEntries(
		Object.entries(closure.breakdowns.payment_methods as Record<string, { refunds: string }>).map(
			([method, row]) => [method, row.refunds]
		)
	);

describe('the accounting read', () => {
	// Remove missing-parent demand: the old card ledger never arrives without another surface opening it.
	it('requests missing stamped refund parents, releases on arrival, and keeps resident parents local', async () => {
		mockRefunds.next([refundHit()]);
		const current = new BehaviorSubject<Row | undefined>(session);
		const subscription = observeSessionAccounting(engine as never, current as never).subscribe();
		expect(mockDeclareRequirements).toHaveBeenCalledWith(engine, [
			{
				id: 'register-session:refund-parents',
				kind: 'targeted-records',
				collection: 'orders',
				remoteIds: ['1'],
			},
		]);
		mockOrders.next([parentHit()]);
		expect(mockReleaseParents).toHaveBeenCalledTimes(1);
		subscription.unsubscribe();
		mockDeclareRequirements.mockClear();
		observeSessionAccounting(engine as never, current as never)
			.subscribe()
			.unsubscribe();
		expect(mockDeclareRequirements).not.toHaveBeenCalled();
	});

	// Remove replacement/teardown release: stale requirements outlive their missing set or session.
	it('replaces missing parent demand and releases it when the session scope changes', async () => {
		mockRefunds.next([refundHit()]);
		const current = new BehaviorSubject<Row | undefined>(session);
		const subscription = observeSessionAccounting(engine as never, current as never).subscribe();
		expect(mockDeclareRequirements).toHaveBeenCalledTimes(1);
		mockRefunds.next([
			{
				...refundHit(),
				record: { ...refundHit().record, payload: { ...refundHit().record.payload, parent_id: 2 } },
			},
		]);
		expect(mockDeclareRequirements).toHaveBeenLastCalledWith(engine, [
			expect.objectContaining({ remoteIds: ['2'] }),
		]);
		expect(mockReleaseParents).toHaveBeenCalledTimes(1);
		current.next(undefined);
		expect(mockReleaseParents).toHaveBeenCalledTimes(2);
		subscription.unsubscribe();
	});

	// Revert session_id to metadata $elemMatch: every order emission scans refund metadata.
	it('queries refunds by the promoted session field and referenced ids', () => {
		mockOrders.next([parentHit('session', true, '2026-09-15')]);
		observeSessionAccounting(engine as never, new BehaviorSubject(session) as never)
			.subscribe()
			.unsubscribe();
		expect(mockQueryCalls).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: 'refunds',
				selector: { $or: [{ session_id: 'session' }, { id: { $in: [20] } }] },
			})
		);
	});
});

// Remove parent lookup/merge: an old-session card refund becomes cash and later allocations never arrive.
it('closes with the old parent and refund that drove the drawer, and the count’s note', async () => {
	await insert();
	mockRefunds.next([refundHit()]);
	mockOrders.next([parentHit()]);
	const closure = await closeRegister(ctx, 'session', {
		counted: { cash: '100' },
		note: 'Found notes',
		denominations: [{ value: '50', pieces: 2 }],
	});
	expect(writeClosure).toHaveBeenCalledWith(
		expect.objectContaining({
			orders: [parentHit().record],
			note: 'Found notes',
			denominations: [{ value: '50', pieces: 2 }],
			refundRecords: [refundHit().record.payload],
		})
	);
	expect(closure.till_expected).toEqual({ cash: '100', stripe: '-20.0000' });
});

it.each([false, true])(
	'derives the closure with the retained baseline, allocation-only %s',
	async (allocationOnly) => {
		if (allocationOnly) {
			// The close already wrote the session, but its closure still needs recovery.
			await insert({
				status: 'closed',
				closed_at_gmt: '2026-09-15T11:00:00',
				closure_id: 'session',
				sync_status: 'pending',
			});
			const pending = parentHit('session', true, '2026-09-15', {
				updated_at_gmt: '2026-09-15T10:00:00',
			});
			pending.record.local.dirty = true;
			mockOrders.next([pending]);
		} else {
			await insert();
			mockOrders.next([parentHit()]);
			mockRefunds.next([refundHit()]);
		}
		const closure = await closeRegister(ctx, 'session', { counted: { cash: '100' } });
		expect((await sessionRow()).server_expected).toEqual({ cash: '100' });
		expect(closure.toJSON()).toMatchObject({
			period_refunds_total: '20.0000',
			till_expected: { cash: '100', stripe: '-20.0000' },
			breakdowns: {
				refund_count: 1,
				payment_methods: {
					stripe: { sales: allocationOnly ? '100.0000' : '0', refunds: '20.0000' },
				},
			},
		});
	}
);

// Remove the parent wait or use the pre-wait accounting: the closure records cash instead of card.
it('waits for missing refund parents before computing the closure tender', async () => {
	await insert();
	mockRefunds.next([refundHit()]);
	let resolve!: () => void;
	const ready = new Promise<void>((done) => {
		resolve = done;
	});
	mockDeclareRequirements.mockReturnValueOnce([{ release: mockReleaseParents, ready }]);
	const closing = closeRegister(ctx, 'session', { counted: { cash: '100' } });
	await tick();
	expect(writeClosure).not.toHaveBeenCalled();
	mockOrders.next([parentHit()]);
	resolve();
	expect(refundsByMethod(await closing)).toEqual({ stripe: '20.0000' });
});

// Revert to resolving on any accounting emission: an unchanged missing set closes with cash.
it('ignores an unrelated resident parent emission while awaiting the missing parent tender', async () => {
	await insert();
	const sibling = refundHit('5');
	sibling.record.uuid = 'refund:21';
	sibling.record.payload.id = 21;
	sibling.record.payload.parent_id = 2;
	const resident = parentHit('old-session', false);
	resident.record.uuid = 'resident';
	resident.record.payload.id = 2;
	mockParentOrders = new BehaviorSubject([resident]);
	mockRefunds.next([refundHit(), sibling]);
	let resolve!: () => void;
	const ready = new Promise<void>((done) => {
		resolve = done;
	});
	mockDeclareRequirements.mockReturnValueOnce([{ release: mockReleaseParents, ready }]);
	const closing = closeRegister(ctx, 'session', { counted: { cash: '100' } });
	await tick();
	expect(writeClosure).not.toHaveBeenCalled();
	resolve();
	await tick();
	mockParentOrders.next([{ ...resident }]);
	await tick();
	const closedEarly = writeClosure.mock.calls.length > 0;
	mockParentOrders.next([resident, parentHit()]);
	const closure = await closing;
	expect(closedEarly).toBe(false);
	expect(refundsByMethod(closure)).toEqual({ stripe: '20.0000', cash: '5.0000' });
});

// Revert the post-ready accounting wait: closure freezes cash before the fetched card parent emits.
it.each([false, true])(
	'waits for the parent emission after readiness, with same-parent replacement %s',
	async (replace) => {
		await insert();
		mockRefunds.next([refundHit()]);
		let resolve!: () => void;
		const ready = new Promise<void>((done) => {
			resolve = done;
		});
		mockDeclareRequirements.mockReturnValueOnce([{ release: mockReleaseParents, ready }]);
		const closing = closeRegister(ctx, 'session', { counted: { cash: '100' } });
		await tick();
		expect(writeClosure).not.toHaveBeenCalled();
		resolve();
		await tick();
		expect(writeClosure).not.toHaveBeenCalled();
		let resolveReplacement = () => {};
		if (replace) {
			// Revert generation confirmation: an unchanged key from new, unfetched handles closes early.
			const replacementReady = new Promise<void>((done) => {
				resolveReplacement = done;
			});
			mockDeclareRequirements.mockReturnValueOnce([
				{ release: mockReleaseParents, ready: replacementReady },
			]);
			mockRefunds.next([refundHit()]);
			await tick();
			expect(writeClosure).not.toHaveBeenCalled();
		}
		mockOrders.next([parentHit()]);
		resolveReplacement();
		expect(refundsByMethod(await closing)).toEqual({ stripe: '20.0000' });
	}
);

// Revert to a single-generation wait: releasing the old handles closes before the replacement fetch.
it('follows replacement refund parent handles before computing the closure tender', async () => {
	await insert();
	mockRefunds.next([refundHit()]);
	let releaseFirst!: () => void;
	const firstReady = new Promise<void>((done) => {
		releaseFirst = done;
	});
	mockDeclareRequirements.mockReturnValueOnce([
		{ release: jest.fn(() => releaseFirst()), ready: firstReady },
	]);
	let resolve!: () => void;
	const ready = new Promise<void>((done) => {
		resolve = done;
	});
	mockDeclareRequirements.mockReturnValueOnce([{ release: mockReleaseParents, ready }]);
	const closing = closeRegister(ctx, 'session', { counted: { cash: '100' } });
	await tick();
	expect(writeClosure).not.toHaveBeenCalled();
	const replacementRefund = refundHit();
	replacementRefund.record.payload.parent_id = 2;
	mockRefunds.next([replacementRefund]);
	await tick();
	expect(writeClosure).not.toHaveBeenCalled();
	const replacementParent = parentHit();
	replacementParent.record.payload.id = 2;
	mockOrders.next([replacementParent]);
	resolve();
	expect(refundsByMethod(await closing)).toEqual({ stripe: '20.0000' });
});

// Restart the deadline for a replacement generation: closing remains blocked beyond the original window.
it('shares one close deadline across replacement refund parent handles', async () => {
	await insert();
	mockRefunds.next([refundHit()]);
	let releaseFirst!: () => void;
	const ready = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	mockDeclareRequirements
		.mockReturnValueOnce([{ release: jest.fn(() => releaseFirst()), ready }])
		.mockReturnValueOnce([{ release: mockReleaseParents, ready: new Promise<void>(() => {}) }]);
	jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
	try {
		const closing = closeRegister(ctx, 'session', { counted: { cash: '100' } });
		await jest.advanceTimersByTimeAsync(10_000);
		const replacement = refundHit();
		replacement.record.payload.parent_id = 2;
		mockRefunds.next([replacement]);
		await jest.advanceTimersByTimeAsync(4_999);
		expect(writeClosure).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(1);
		await closing;
		expect(writeClosure).toHaveBeenCalledTimes(1);
	} finally {
		jest.useRealTimers();
	}
});

// The closure's expected figures are the drawer's: the snapshot's ledger rows, refunds and voided legs.
it('keeps the baseline: allocations after the snapshot are deltas, the rest is the server’s', async () => {
	await insert({ server_expected_at: '2026-09-17T00:00:00.000Z' });
	mockOrders.next([parentHit('session', true, '2026-09-16')]);
	const closure = await closeRegister(ctx, 'session', { counted: { cash: '100' } });
	expect(writeClosure).toHaveBeenLastCalledWith(
		expect.objectContaining({
			orders: [parentHit('session', true, '2026-09-16').record],
			refundRecords: [],
		})
	);
	expect(closure.till_expected).toEqual({ cash: '100', stripe: '-20.0000' });
});

it.each([
	[['card'], '2026-09-15T10:00:00', '100'],
	[[], '2026-09-15T09:00:00', '110.0000'],
	[[], '2026-09-15T08:00:00', '110.0000'],
	[undefined, '2026-09-15T10:00:00', '110.0000'],
	[null, '2026-09-15T08:00:00', '100'],
] as const)('uses snapshot ledger ids %j at %s for the closure', async (ids, createdAt, cash) => {
	await insert({ server_ledger_row_ids: ids });
	mockOrders.next([
		parentHit('session', false, createdAt, { kind: 'cash', method_id: 'cash', amount: '10' }),
	]);
	const closure = await closeRegister(ctx, 'session', { counted: { cash: '100' } });
	expect(closure.till_expected).toEqual({ cash });
});

it.each([
	[[], '2026-09-15T09:00:00', '80.0000'],
	[[20], '2026-09-15T10:00:00', '100'],
	[null, '2026-09-15T10:00:00', '80.0000'],
	[null, '2026-09-15T08:00:00', '100'],
] as const)('uses snapshot refund ids %j at %s for the closure', async (ids, createdAt, cash) => {
	await insert({ server_refund_ids: ids });
	const refund = refundHit();
	refund.record.payload.date_created_gmt = createdAt;
	mockOrders.next([parentHit('old-session', false)]);
	mockRefunds.next([refund]);
	const closure = await closeRegister(ctx, 'session', { counted: { cash: '100' } });
	expect(closure.till_expected).toEqual({ cash });
});

// ADR 0040 D6: only a captured leg ever counted, so failing or voiding a captured leg debits it
// exactly once, and failing or voiding an authorized leg changes nothing.
it.each([
	['cash', 'captured', 'voided', '50.0000'],
	['cash', 'authorized', 'failed', '100'],
	['cheque', 'authorized', 'voided', '100'],
	['cheque', 'captured', 'failed', '50.0000'],
])(
	'a snapshotted %s %s leg changed offline to %s closes expecting %s',
	async (method, before, status, tillExpected) => {
		const snapshot = { id: 'card', updated_at_gmt: '2026-09-15T08:00:00', status: before };
		await insert({
			server_expected: { [method]: '100' },
			server_ledger_row_ids: ['card'],
			server_ledger_rows: [snapshot],
		});
		const hit = parentHit('session', false, '2026-09-15T10:00:00', {
			kind: method === 'cash' ? 'cash' : 'manual',
			method_id: method,
			amount: '50',
			status,
			created_at_gmt: snapshot.updated_at_gmt,
		});
		hit.record.local.dirty = true;
		mockOrders.next([hit]);
		const closure = await closeRegister(ctx, 'session', { counted: { [method]: '50' } });
		expect(closure.till_expected).toEqual({ [method]: tillExpected });
	}
);

// Revert: persist only the closer label, losing opener/approver identities offline.
it.each([
	{ opened_by: 8, approved_by: 9, opener: 'Alex', approver: 'Sam', recovered: false },
	// Revert: label a recovered close with the current credential instead of closed_by.
	{ opened_by: 8, approved_by: 9, opener: 'Alex', approver: 'Sam', recovered: true },
	{ opened_by: 7, approved_by: 7, opener: 'Pat', approver: 'Pat' },
	{ opened_by: 99, approved_by: null, opener: '', approver: '' },
])(
	'persists closure actor names for opener $opened_by and approver $approved_by (recovered: $recovered)',
	async ({ opened_by, approved_by, opener, approver, recovered = false }) => {
		await insert({
			opened_by,
			approved_by,
			...(recovered
				? {
						closed_by: 8,
						status: 'closed',
						closed_at_gmt: '2026-09-17T12:00:00Z',
						closure_id: 'session',
						sync_status: 'pending',
					}
				: {}),
		});
		mockOrders.next(
			[7, 8, 99].map((id) => ({
				record: {
					uuid: `order-${id}`,
					local: { dirty: true },
					payload: {
						id,
						date_modified_gmt: '2026-09-17T11:00:00Z',
						meta_data: [
							{ key: '_wcpos_session', value: 'session' },
							{ key: '_pos_user', value: String(id) },
						],
					},
				},
			}))
		);
		await closeRegister(ctx, 'session', { counted: { cash: '120' } });
		const saved = await storeDB.closures.findOne('session').exec();
		expect(saved?.breakdowns).toMatchObject({
			opened_by_name: opener,
			approved_by_name: approver,
			closed_by_name: recovered ? 'Alex' : 'Pat',
			cashiers: [
				{ id: 7, name: 'Pat' },
				{ id: 8, name: 'Alex' },
				{ id: 99, name: '99' },
			],
		});
		expect(saved?.sync_status).toBe('pending');
	}
);

it('replays a closed session using the stored note and denominations', async () => {
	await insert({
		status: 'closed',
		closure_id: 'session',
		sync_status: 'pending',
		count_note: 'Stored note',
		count_denominations: [{ value: '50', pieces: 2 }],
	});
	await closeRegister(ctx, 'session', { counted: { cash: '100' } });
	expect(closeSession).not.toHaveBeenCalled();
	expect(writeClosure).toHaveBeenCalledWith(
		expect.objectContaining({ note: 'Stored note', denominations: [{ value: '50', pieces: 2 }] })
	);
});

describe('#2016: a refused close', () => {
	/** A first close the store refused: its closure written and reserved, then `closure` status. */
	const refusedClose = async (sessionPatch: Row, closureStatus: string) => {
		await insert();
		await storeDB.cash_movements.insert(movement as never);
		await closeRegister(ctx, 'session', { counted: { cash: '105' } });
		await (await storeDB.closures.findOne('session').exec())!.incrementalPatch({
			sync_status: closureStatus as never,
		});
		await (await sessionRow()).incrementalPatch(sessionPatch);
		jest.clearAllMocks();
		writeClosure.mockImplementation(realWriteClosure);
	};
	const refused = { status: 'closed', sync_status: 'failed', server_status: 'counting' } as const;
	const reopened = { status: 'counting', server_status: 'counting', closure_id: null } as const;

	// Revert the action to requeue first: the close goes out before the closure is rewritten.
	it.each([
		['a refused close', refused, 'pending'],
		['a counting row after a refresh', reopened, 'failed'],
		['a counting row the store reopened', reopened, 'pending'],
	])(
		'retries %s by closing again, rewriting the closure, then requeueing',
		async (_, patch, closureStatus) => {
			await refusedClose(patch, closureStatus);
			await closeRegister(ctx, 'session', { counted: { cash: '110' } });
			expect(closeSession).toHaveBeenCalledWith(
				storeDB,
				'session',
				expect.objectContaining({ counted: { cash: '110' } })
			);
			expect(writeClosure).toHaveBeenCalledWith(
				expect.objectContaining({ revise: true, counted: '110' })
			);
			expect(requeueClose).toHaveBeenCalledWith(
				storeDB,
				'session',
				expect.objectContaining({ status: 'closed', counted: { cash: '110' } })
			);
			expect(writeClosure.mock.invocationCallOrder[0]).toBeLessThan(
				requeueClose.mock.invocationCallOrder[0]
			);
			expect((await storeDB.closures.findOne('session').exec())?.counted).toEqual({ cash: '110' });
		}
	);

	// Requeue from the closed row: a refresh that lands while the closure is written loses the close.
	it('requeues the held close when a refresh adopts the store’s row while the closure is written', async () => {
		await refusedClose(reopened, 'pending');
		writeClosure.mockImplementationOnce(async (input) => {
			const row = await realWriteClosure(input);
			// The refresh adopts the store's row: back at counting, synced, no closure.
			await (
				await sessionRow()
			).incrementalPatch({
				status: 'counting',
				sync_status: 'synced',
				closure_id: null,
			});
			return row;
		});
		await closeRegister(ctx, 'session', { counted: { cash: '110' } });
		expect(requeueClose).toHaveBeenCalledWith(
			storeDB,
			'session',
			expect.objectContaining({ status: 'closed', counted: { cash: '110' } })
		);
		expect((await sessionRow()).toJSON()).toMatchObject({
			status: 'closed',
			pending_status: 'closed',
			counted: { cash: '110' },
			closure_id: 'session',
			sync_status: 'pending',
		});
	});

	// Drop the failed session's accounting: the retry records none of its sales.
	it('a retry from a refused abandon reads the accounting of the failed session', async () => {
		await refusedClose({ status: 'open', sync_status: 'failed', closure_id: null }, 'pending');
		mockOrders.next([parentHit('session', true, '2026-09-15')]);
		const closure = await closeRegister(ctx, 'session', { counted: { cash: '110' } });
		expect(writeClosure).toHaveBeenCalledWith(
			expect.objectContaining({ orders: [parentHit('session', true, '2026-09-15').record] })
		);
		expect(closure.till_expected).toEqual({ cash: '120.0000', stripe: '-20.0000' });
	});

	it('leaves the close held when the closure write fails', async () => {
		await refusedClose(reopened, 'pending');
		writeClosure.mockRejectedValueOnce(new Error('disk write'));
		await expect(closeRegister(ctx, 'session', { counted: { cash: '110' } })).rejects.toThrow(
			'disk write'
		);
		expect(requeueClose).not.toHaveBeenCalled();
		expect((await sessionRow()).sync_status).toBe('failed');
	});

	it('does not requeue a first close', async () => {
		await insert();
		await closeRegister(ctx, 'session', { counted: { cash: '105' } });
		expect(writeClosure).toHaveBeenCalledWith(expect.objectContaining({ revise: true }));
		expect(requeueClose).not.toHaveBeenCalled();
	});
});
