/** @jest-environment jsdom */
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, map, merge, of, startWith, Subject } from 'rxjs';
import { Query } from 'mingo';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { StoreDatabase, UserDatabase } from '@wcpos/database';
import { closuresLiteral } from '@wcpos/database/collections/schemas/closures';
import { getLogger } from '@wcpos/utils/logger';
import { renderLogiclessTemplate } from '@wcpos/receipt-renderer/render-template';
import * as actions from '@wcpos/query/register-session';

import { useRegisterSession } from './use-register-session';
import {
	markSeededIn,
	recordLiveSession,
	remintRegister,
} from '../../../../query/src/register-session/register-document';
import { buildClosureDocument } from './closure-document';

Object.assign(globalThis, { TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

const mockRequestRefresh = jest.fn();
jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	observeRegisterSessions: () => {
		const generation = mockGeneration;
		return mockHasSessions
			? merge(of(null), mockSessionChanges).pipe(
					map(() => ({
						active,
						closed,
						isCurrent: () => mockHasSessions && generation === mockGeneration,
					})),
					startWith(null)
				)
			: of(null);
	},
	observeCashMovements: () => of(entries),
	observeRegisterClosures: () => of(closureRows),
	observeSessionAccounting: jest.fn((...args) =>
		jest.requireActual('@wcpos/query/register-session').observeSessionAccounting(...args)
	),
	openSession: jest.fn(),
	recordLiveSession: jest.fn(),
	markCountingHere: jest.fn(),
	startCounting: jest.fn(),
	backToSelling: jest.fn(),
	closeSession: jest.fn(),
	recordMovement: jest.fn(),
	readMovement: jest.fn(),
	voidMovement: jest.fn(),
	retryMovement: jest.fn(),
	requireOpenSession: jest.fn(),
	writeClosure: jest.fn(),
	sessionRefreshRequests: { next: (...args: unknown[]) => mockRequestRefresh(...args) },
}));
const logger = jest.mocked(getLogger(['wcpos', 'registerSession']));

type Row = Record<string, unknown>;

let active: Row[] = [];
let closed: Row[] = [];
let entries: Row[] = [];
let closureRows: Row[] = [];
const mockSessionChanges = new Subject<void>();
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

let mockHasSessions = true;
let mockGeneration = {};
const mockBinding = { registerId: 'register', registerName: 'Front' };
const mockReleaseParents = jest.fn();
const mockDeclareRequirements = jest.fn((..._args: unknown[]) => [
	{ release: mockReleaseParents, ready: Promise.resolve() },
]);
const mockRuntime = { engine: {}, locale: 'en' };
let mockCloseTime: string | null = null;
const mockStoreSession = {
	store: { id: 1 },
	wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' },
	userDB: { getLocal$: () => of(null) } as Pick<UserDatabase, 'getLocal$'>,
	storeDB: {},
	site: {
		uuid: 'site',
		populate$: () =>
			of([
				{ id: 8, display_name: 'Alex' },
				{ id: 9, display_name: 'Sam' },
			]),
	},
};

jest.mock('../register/use-register-binding', () => ({
	useRegisterBinding: () => mockBinding,
}));
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => mockStoreSession,
	useAppState: () => ({ ...mockStoreSession, store: { timezone: 'America/Los_Angeles' } }),
}));
jest.mock('../../../../query/src/engine-query', () => ({
	observeEngineQuery: (...args: Parameters<typeof mockObserve>) => mockObserve(...args),
}));
jest.mock('../../../../query/src/requirement-bridge', () => ({
	declareRequirements: (...args: unknown[]) => mockDeclareRequirements(...args),
}));
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => mockRuntime,
	useDocField: (_doc: unknown, select: (value: Record<string, unknown>) => unknown) =>
		select({
			register_sessions: true,
			variance_threshold: null,
			expected_close_time: mockCloseTime,
			capabilities: ['view_woocommerce_pos_reports'],
		}),
}));

const session = {
	id: 'session',
	register_id: 'register',
	status: 'open',
	opened_at_gmt: '2026-09-12T08:00:00.000Z',
	counted_float: '100',
	sync_status: 'synced',
	// The server's figure cannot include a movement it never accepted.
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
	sync_status: 'pending',
};

async function settled() {
	const { result } = renderHook(() => useRegisterSession());
	await waitFor(() => expect(result.current.session).not.toBeNull());
	return result;
}

beforeEach(() => {
	mockHasSessions = true;
	jest.clearAllMocks();
	active = [
		{
			...session,
			getLatest: () => active[0],
			incrementalPatch: async (patch: Row) => {
				active = [{ ...active[0], ...patch }];
				mockSessionChanges.next();
				return active[0];
			},
		},
	];
	mockOrders = new BehaviorSubject<Hit[]>([]);
	mockParentOrders = undefined;
	mockRefunds = new BehaviorSubject<Hit[]>([]);
	closed = [];
	closureRows = [];
	entries = [movement];
	mockCloseTime = null;
});

it('reports not loaded until the combined query first emits, so an open register never reads as closed', async () => {
	const { result } = renderHook(() => useRegisterSession());
	expect(result.current.session).toBeNull();
	expect(result.current.loaded).toBe(false);
	await waitFor(() => expect(result.current.loaded).toBe(true));
	expect(result.current.session?.id).toBe('session');
});

it('reports loaded with no session for a closed register', async () => {
	active = [];
	const { result } = renderHook(() => useRegisterSession());
	await waitFor(() => expect(result.current.loaded).toBe(true));
	expect(result.current.session).toBeNull();
});

it('derives expected locally while a movement is still on its way to the server', async () => {
	const result = await settled();
	expect(result.current.expected.cash).toBe('120.0000');
});

it('keeps deriving expected locally when the server permanently refused the movement', async () => {
	entries = [{ ...movement, sync_status: 'failed', sync_error: 'rest_invalid_param' }];
	const result = await settled();
	// Falling back to server_expected here is the silent revert: the cash is in the drawer, the
	// server's total does not include it, and the cashier wears the variance at the count.
	expect(result.current.expected.cash).toBe('120.0000');
});

it('counts a refused movement as outstanding and keeps it in the list for retry', async () => {
	entries = [{ ...movement, sync_status: 'failed', sync_error: 'rest_invalid_param' }];
	const result = await settled();
	expect(result.current.unsyncedCount).toBe(1);
	expect(result.current.movements.filter((row) => row.sync_status === 'failed')).toHaveLength(1);
	expect(typeof result.current.actions.retryMovement).toBe('function');
});

it.each(['synced', 'pending'])(
	'trusts snapshot movement membership while locally %s',
	async (sync_status) => {
		active = [{ ...active[0], server_movement_ids: [movement.id] }];
		entries = [{ ...movement, sync_status }];
		const result = await settled();
		expect(result.current.expected.cash).toBe('100');
		expect(result.current.unsyncedCount).toBe(sync_status === 'pending' ? 1 : 0);
	}
);

describe('refusedMovements', () => {
	const refused = { ...movement, sync_status: 'failed', sync_error: 'rest_invalid_param' };
	// A session that has been counted and written: the hook stops treating it as current.
	const settledSession = { ...session, status: 'closed', closure_id: session.id };

	const closureRow = {
		id: session.id,
		session_id: session.id,
		sync_status: 'synced',
		closed_at: '2026-09-12T17:00:00.000Z',
	};

	// `session` is deliberately null in these cases, so it cannot be the signal that the
	// observable has emitted — wait on the closure row instead.
	async function rendered() {
		const { result } = renderHook(() => useRegisterSession());
		await waitFor(() => expect(result.current.lastClosure).not.toBeNull());
		return result;
	}

	it('outlives the session it belonged to', async () => {
		active = [];
		closed = [settledSession];
		closureRows = [closureRow];
		entries = [refused];
		const result = await rendered();
		// The session is gone from the panel's point of view, but the cash still moved and the
		// device holds the only record of it — scoping the banner to the current session hid it.
		expect(result.current.session).toBeNull();
		expect(result.current.refusedMovements).toHaveLength(1);
		expect(result.current.refusedMovements[0].id).toBe('movement');
	});

	it('ignores a refused movement belonging to another register', async () => {
		active = [];
		closed = [settledSession];
		closureRows = [closureRow];
		// The movements collection is not register-scoped, so an unfiltered list would put
		// another till's refused cash on this one's pane.
		entries = [refused, { ...refused, id: 'elsewhere', session_id: 'other-register-session' }];
		const result = await rendered();
		expect(result.current.refusedMovements.map((row) => row.id)).toEqual(['movement']);
	});

	it('is empty once the row is accepted', async () => {
		active = [];
		closed = [settledSession];
		closureRows = [closureRow];
		entries = [{ ...movement, sync_status: 'synced' }];
		const result = await rendered();
		expect(result.current.refusedMovements).toHaveLength(0);
	});
});

// Removing any of the action's log calls must lose its typed, cashier-attributed row.
it.each([
	['openSession', 'Register session opened', 'register.session-opened'],
	['startCounting', 'Register session counting started', 'register.counting-started'],
	['backToSelling', 'Register session counting abandoned', 'register.counting-abandoned'],
] as const)('logs %s with the cashier only after it succeeds', async (action, message, type) => {
	jest
		.mocked(
			{
				openSession: actions.openSession,
				startCounting: actions.startCounting,
				backToSelling: actions.backToSelling,
			}[action]
		)
		.mockResolvedValue(session as never);
	const result = await settled();
	if (action === 'openSession') {
		await result.current.actions.openSession({ expectedFloat: null, countedFloat: '100' });
	} else await result.current.actions[action]();
	expect(logger.info).toHaveBeenCalledWith(
		message,
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			context: expect.objectContaining({ type, sessionId: 'session', registerId: 'register' }),
		})
	);
});

it.each(['startCounting', 'backToSelling'] as const)(
	'keeps repeated %s actions as distinct audit attempts',
	async (action) => {
		jest
			.mocked(
				{ startCounting: actions.startCounting, backToSelling: actions.backToSelling }[action]
			)
			.mockResolvedValue(session as never);
		const result = await settled();
		await result.current.actions[action]();
		await result.current.actions[action]();
		expect(logger.info).toHaveBeenCalledTimes(2);
		const ids = logger.info.mock.calls.map(([, options]) => options?.terminal?.operationId);
		for (const id of ids) expect(id).toEqual(expect.stringMatching(/^[0-9a-f]{32}$/));
		expect(new Set(ids).size).toBe(2);
	}
);

it('logs a manual retry with the current cashier and the movement session', async () => {
	jest.mocked(actions.retryMovement).mockResolvedValue({
		...movement,
		session_id: 'earlier-session',
	} as never);
	const result = await settled();
	await expect(result.current.actions.retryMovement('movement')).resolves.toMatchObject({
		id: 'movement',
	});
	expect(actions.retryMovement).toHaveBeenCalledWith(mockStoreSession.storeDB, 'movement');
	expect(logger.info).toHaveBeenCalledWith(
		'Register cash movement retry requested',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			terminal: { operationId: expect.stringMatching(/^[0-9a-f]{32}$/) },
			context: {
				type: 'register.movement-retrying',
				sessionId: 'earlier-session',
				registerId: 'register',
				movementId: 'movement',
			},
		})
	);
});

it('does not log a manual retry when resetting the movement fails', async () => {
	jest.mocked(actions.retryMovement).mockRejectedValueOnce(new Error('disk'));
	const result = await settled();
	await expect(result.current.actions.retryMovement('movement')).rejects.toThrow('disk');
	expect(logger.info).not.toHaveBeenCalled();
});

it('logs the closed snapshot with its count and variance', async () => {
	jest.mocked(actions.closeSession).mockResolvedValue({ ...session, status: 'closed' } as never);
	jest.mocked(actions.writeClosure).mockResolvedValue({
		id: 'closure',
		counted: { cash: '115' },
		variance: { cash: '-5.0000' },
	} as never);
	const result = await settled();
	await result.current.actions.closeSession({ counted: { cash: '115' } });
	expect(logger.info).toHaveBeenCalledWith(
		'Register session closed',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			context: expect.objectContaining({
				type: 'register.session-closed',
				sessionId: 'session',
				registerId: 'register',
				closureId: 'closure',
				counted: { cash: '115' },
				variance: { cash: '-5.0000' },
			}),
		})
	);
});

it.each(['paid_in', 'paid_out'] as const)(
	'records %s under movementType, not the event type',
	async (movementType) => {
		jest.mocked(actions.requireOpenSession).mockResolvedValue('session');
		jest
			.mocked(actions.recordMovement)
			.mockResolvedValue({ ...movement, type: movementType } as never);
		const result = await settled();
		await result.current.actions.recordMovement({
			type: movementType,
			amount: '20',
			reason: 'Private reason',
		});
		expect(logger.info).toHaveBeenCalledWith(
			'Register cash movement recorded',
			expect.objectContaining({
				actor: { id: '7', name: 'Pat' },
				terminal: { operationId: 'movement' },
				context: expect.objectContaining({
					type: 'register.movement-recorded',
					sessionId: 'session',
					registerId: 'register',
					movementId: 'movement',
					movementType,
					amount: '20',
				}),
			})
		);
		expect(JSON.stringify(logger.info.mock.calls)).not.toContain('Private reason');
	}
);

it('logs a void with the reversal id, the current cashier and the amount reversed', async () => {
	// The reversal row carries amount 0 (the server refuses anything else); the audit event
	// must still record the target's amount.
	jest.mocked(actions.readMovement).mockResolvedValue(movement as never);
	jest
		.mocked(actions.voidMovement)
		.mockResolvedValue({ ...movement, id: 'reversal', type: 'void', amount: '0' } as never);
	const result = await settled();
	await result.current.actions.voidMovement('movement');
	expect(logger.info).toHaveBeenCalledWith(
		'Register cash movement voided',
		expect.objectContaining({
			actor: { id: '7', name: 'Pat' },
			context: expect.objectContaining({
				type: 'register.movement-voided',
				movementId: 'reversal',
				sessionId: 'session',
				registerId: 'register',
				movementType: 'void',
				voidedType: 'paid_in',
				amount: '20',
			}),
		})
	);
});

it('does not report an open when its write fails', async () => {
	jest.mocked(actions.openSession).mockRejectedValueOnce(new Error('disk'));
	const result = await settled();
	await expect(
		result.current.actions.openSession({ expectedFloat: null, countedFloat: '100' })
	).rejects.toThrow('disk');
	expect(logger.info).not.toHaveBeenCalled();
});

it('records a no-sale without claiming cash moved', async () => {
	jest.mocked(actions.requireOpenSession).mockResolvedValue('session');
	jest
		.mocked(actions.recordMovement)
		.mockResolvedValue({ ...movement, type: 'no_sale', amount: '0' } as never);
	const result = await settled();
	await expect(
		result.current.actions.recordMovement({ type: 'no_sale', amount: '0', reason: '' })
	).resolves.toMatchObject({ type: 'no_sale' });
	expect(logger.info).not.toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({ type: 'register.movement-recorded' }),
		})
	);
	// ...but the cashier's action is still on the audit, drawer hardware or not.
	expect(logger.info).toHaveBeenCalledWith(
		'Register no-sale recorded',
		expect.objectContaining({
			actor: expect.objectContaining({ id: expect.any(String) }),
			context: expect.objectContaining({
				type: 'register.no-sale-recorded',
				movementId: movement.id,
			}),
		})
	);
});

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

// Remove the refund subscription or pending delta: live edits stay hidden behind server_expected.
it('keeps the initial empty snapshot, then recomputes inserts, updates and deletion and permits server re-anchoring', async () => {
	entries = [];
	const result = await settled();
	expect(result.current.expected).toEqual({ cash: '100' });
	await act(async () => {
		mockRefunds.next([refundHit()]);
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '80.0000' }));
	expect(active[0].server_expected).toEqual({ cash: '100' });
	await act(async () => {
		mockRefunds.next([refundHit('30')]);
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '70.0000' }));
	await act(async () => {
		mockRefunds.next([]);
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '100' }));
	await act(async () => {
		active = [{ ...active[0], server_expected: { cash: '99' } }];
		mockSessionChanges.next();
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '99' }));
});

// Remove parent lookup/merge: an old-session card refund becomes cash and later allocations never arrive.
it('observes old held parents and later allocations without importing their sales count', async () => {
	entries = [];
	mockRefunds.next([refundHit()]);
	const result = await settled();
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '80.0000' }));
	await act(async () => {
		mockOrders.next([parentHit()]);
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '100', stripe: '-20.0000' }));
	expect(result.current.salesCount).toBe(0);
	jest.mocked(actions.closeSession).mockResolvedValue({ ...session, status: 'closed' } as never);
	jest
		.mocked(actions.writeClosure)
		.mockResolvedValue({ id: 'closure', counted: {}, variance: {} } as never);
	await result.current.actions.closeSession({ counted: { cash: '100' } });
	// The closure writer must receive the same old parent and refund that drove the drawer.
	expect(actions.writeClosure).toHaveBeenCalledWith(
		expect.objectContaining({
			orders: [parentHit().record],
			refundRecords: [refundHit().record.payload],
		})
	);
});

// Remove referenced-refund query: A retains its aggregate refund despite the record being stamped to B.
it('loads another session stamp referenced by this session payment allocations', async () => {
	entries = [];
	active = [{ ...active[0], server_expected: null, server_sales_count: null }];
	mockOrders.next([parentHit('session', true, '2026-09-15')]);
	mockRefunds.next([refundHit('20', 'B')]);
	const result = await settled();
	await waitFor(() =>
		expect(result.current.expected).toEqual({ cash: '100.0000', stripe: '100.0000' })
	);
	expect(result.current.salesCount).toBe(1);
});

// Drop uuid deduplication: a parent returned by both reads doubles the captured sale and allocation.
it('deduplicates parents also returned by the recent sales query', async () => {
	entries = [];
	active = [{ ...active[0], server_expected: null, server_sales_count: null }];
	mockOrders.next([parentHit('session', true, '2026-09-15')]);
	mockRefunds.next([refundHit()]);
	const result = await settled();
	await waitFor(() =>
		expect(result.current.expected).toEqual({ cash: '100.0000', stripe: '80.0000' })
	);
	expect(result.current.salesCount).toBe(1);
});

// Remove missing-parent demand: the old card ledger never arrives without another surface opening it.
it('requests missing stamped refund parents, releases on arrival, and keeps resident parents local', async () => {
	entries = [];
	mockRefunds.next([refundHit()]);
	const view = renderHook(() => useRegisterSession());
	await waitFor(() =>
		expect(mockDeclareRequirements).toHaveBeenCalledWith(mockRuntime.engine, [
			{
				id: 'register-session:refund-parents',
				kind: 'targeted-records',
				collection: 'orders',
				remoteIds: ['1'],
			},
		])
	);
	await act(async () => mockOrders.next([parentHit()]));
	await waitFor(() =>
		expect(view.result.current.expected).toEqual({ cash: '100', stripe: '-20.0000' })
	);
	expect(mockReleaseParents).toHaveBeenCalledTimes(1);
	mockDeclareRequirements.mockClear();
	view.unmount();
	const resident = renderHook(() => useRegisterSession());
	await waitFor(() => expect(resident.result.current.session).not.toBeNull());
	expect(mockDeclareRequirements).not.toHaveBeenCalled();
});

// Remove replacement/teardown release: stale requirements outlive their missing set or session.
it('replaces missing parent demand and releases it when the session scope changes or unmounts', async () => {
	mockRefunds.next([refundHit()]);
	const view = renderHook(() => useRegisterSession());
	await waitFor(() => expect(mockDeclareRequirements).toHaveBeenCalledTimes(1));
	await act(async () =>
		mockRefunds.next([
			{
				...refundHit(),
				record: { ...refundHit().record, payload: { ...refundHit().record.payload, parent_id: 2 } },
			},
		])
	);
	await waitFor(() =>
		expect(mockDeclareRequirements).toHaveBeenLastCalledWith(mockRuntime.engine, [
			expect.objectContaining({ remoteIds: ['2'] }),
		])
	);
	expect(mockReleaseParents).toHaveBeenCalledTimes(1);
	await act(async () => {
		active = [];
		mockSessionChanges.next();
	});
	expect(mockReleaseParents).toHaveBeenCalledTimes(2);
	view.unmount();
});

// Revert to pre-await accounting or move the wait before the session write: the late refund loses its card tender.
it.each([false, true])(
	'includes a refund emitted during the session write, with a missing parent %s',
	async (missingParent) => {
		addRxPlugin(RxDBLocalDocumentsPlugin);
		const db: StoreDatabase = await createRxDatabase({
			name: `lateclosure${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		const userDB: UserDatabase = await createRxDatabase({
			name: `lateuser${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		});
		try {
			await db.addCollections({ closures: { schema: closuresLiteral, autoMigrate: false } });
			await remintRegister(userDB);
			entries = [];
			active = [{ ...active[0], server_expected: null }];
			if (!missingParent) mockOrders.next([parentHit()]);
			let resolveParent!: () => void;
			if (missingParent) {
				mockDeclareRequirements.mockReturnValueOnce([
					{
						release: mockReleaseParents,
						ready: new Promise<void>((resolve) => {
							resolveParent = resolve;
						}),
					},
				]);
			}
			let release!: () => void;
			const pending = new Promise<void>((resolve) => {
				release = resolve;
			});
			jest.mocked(actions.closeSession).mockImplementationOnce(async () => {
				await pending;
				return { ...session, status: 'closed', closed_at_gmt: '2026-09-15T11:00:00' } as never;
			});
			const { writeClosure } = jest.requireActual<typeof actions>('@wcpos/query/register-session');
			jest
				.mocked(actions.writeClosure)
				.mockImplementationOnce((input) => writeClosure({ ...input, storeDB: db, userDB }));
			const result = await settled();
			let closing!: ReturnType<typeof result.current.actions.closeSession>;
			await act(async () => {
				closing = result.current.actions.closeSession({ counted: { cash: '100' } });
			});
			expect(actions.closeSession).toHaveBeenCalledTimes(1);
			expect(actions.writeClosure).not.toHaveBeenCalled();
			await act(async () => mockRefunds.next([refundHit()]));
			expect(mockDeclareRequirements).toHaveBeenCalledTimes(missingParent ? 1 : 0);
			await act(async () => {
				release();
			});
			if (missingParent) {
				await act(async () => {
					mockOrders.next([parentHit()]);
					resolveParent();
				});
			}
			await act(async () => {
				await closing;
			});
			expect((await closing).toJSON()).toMatchObject({
				period_refunds_total: '20.0000',
				till_expected: { cash: '100.0000', stripe: '-20.0000' },
				breakdowns: {
					refund_count: 1,
					payment_methods: { stripe: { sales: '0', refunds: '20.0000' } },
				},
			});
		} finally {
			await db.remove();
			await userDB.remove();
		}
	}
);

// The closure must use baseline plus pending deltas, without waiting for an anchor write.
it.each([false, true])(
	'derives the closure with the retained baseline, allocation-only %s',
	async (allocationOnly) => {
		addRxPlugin(RxDBLocalDocumentsPlugin);
		const db: StoreDatabase = await createRxDatabase({
			name: `lateclosure${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		const userDB: UserDatabase = await createRxDatabase({
			name: `lateuser${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		});
		let releasePatch!: () => void;
		const patchPending = new Promise<void>((resolve) => {
			releasePatch = resolve;
		});
		try {
			await db.addCollections({ closures: { schema: closuresLiteral, autoMigrate: false } });
			await remintRegister(userDB);
			entries = [];
			active = [
				{
					...active[0],
					incrementalPatch: async (patch: Row) => {
						await patchPending;
						active = [{ ...active[0], ...patch }];
						mockSessionChanges.next();
						return active[0];
					},
				},
			];
			mockOrders.next([allocationOnly ? parentHit('session', false, '2026-09-15') : parentHit()]);
			jest.mocked(actions.closeSession).mockResolvedValueOnce({
				...session,
				status: 'closed',
				closed_at_gmt: '2026-09-15T11:00:00',
			} as never);
			const { writeClosure } = jest.requireActual<typeof actions>('@wcpos/query/register-session');
			jest
				.mocked(actions.writeClosure)
				.mockImplementationOnce((input) => writeClosure({ ...input, storeDB: db, userDB }));
			const result = await settled();
			expect(result.current.expected).toEqual({ cash: '100' });
			let closing!: ReturnType<typeof result.current.actions.closeSession>;
			await act(async () => {
				if (allocationOnly) {
					// The close already wrote the session, but its closure still needs recovery.
					Object.assign(active[0], { status: 'closed', closed_at_gmt: '2026-09-15T11:00:00' });
					const pending = parentHit('session', true, '2026-09-15', {
						updated_at_gmt: '2026-09-15T10:00:00',
					});
					pending.record.local.dirty = true;
					mockOrders.next([pending]);
				} else {
					mockRefunds.next([refundHit()]);
				}
				closing = result.current.actions.closeSession({ counted: { cash: '100' } });
				await closing;
			});
			expect(active[0].server_expected).toEqual({ cash: '100' });
			expect((await closing).toJSON()).toMatchObject({
				period_refunds_total: '20.0000',
				till_expected: { cash: '100', stripe: '-20.0000' },
				breakdowns: {
					refund_count: 1,
					payment_methods: {
						stripe: { sales: allocationOnly ? '100.0000' : '0', refunds: '20.0000' },
					},
				},
			});
		} finally {
			await act(async () => {
				releasePatch();
			});
			await db.remove();
			await userDB.remove();
		}
	}
);

// Remove the parent wait or use the pre-wait accounting: the closure records cash instead of card.
it.each(['unchanged', 'locale', 'engine'] as const)(
	'waits for missing refund parents before computing the closure tender (%s)',
	async (change) => {
		entries = [];
		mockRefunds.next([refundHit()]);
		let resolve!: () => void;
		const ready = new Promise<void>((done) => {
			resolve = done;
		});
		mockDeclareRequirements.mockReturnValueOnce([{ release: mockReleaseParents, ready }]);
		jest.mocked(actions.closeSession).mockResolvedValue({ ...session, status: 'closed' } as never);
		jest.mocked(actions.writeClosure).mockImplementationOnce(async (input) => {
			const { attributeRefunds } = jest.requireActual<
				typeof import('../../../../query/src/register-session/expected')
			>('../../../../query/src/register-session/expected');
			const { readLedger } =
				jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
			const attributed = attributeRefunds(
				input.session.id,
				input.orders.flatMap((order) => readLedger(order.payload.meta_data)),
				input.refundRecords ?? []
			);
			return {
				id: 'closure',
				counted: {},
				variance: {},
				breakdowns: { payment_methods: attributed.byMethod },
			} as never;
		});
		const { result, rerender } = renderHook(() => useRegisterSession());
		await waitFor(() => expect(result.current.session).not.toBeNull());
		let closing!: ReturnType<typeof result.current.actions.closeSession>;
		await act(async () => {
			closing = result.current.actions.closeSession({ counted: { cash: '100' } });
		});
		expect(actions.writeClosure).not.toHaveBeenCalled();
		const previousRuntime = { ...mockRuntime };
		if (change === 'locale') mockRuntime.locale = 'es';
		if (change === 'engine') mockRuntime.engine = {};
		rerender();
		await act(async () => {
			mockOrders.next([parentHit()]);
			resolve();
			await closing;
		});
		expect((await closing).breakdowns.payment_methods).toEqual({ stripe: 200000 });
		Object.assign(mockRuntime, previousRuntime);
	}
);

// Revert to resolving on any accounting emission: an unchanged missing set closes with cash.
it('ignores an unrelated resident parent emission while awaiting the missing parent tender', async () => {
	entries = [];
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
	jest.mocked(actions.closeSession).mockResolvedValue({ ...session, status: 'closed' } as never);
	jest.mocked(actions.writeClosure).mockImplementationOnce(async (input) => {
		const { attributeRefunds } = jest.requireActual<
			typeof import('../../../../query/src/register-session/expected')
		>('../../../../query/src/register-session/expected');
		const { readLedger } =
			jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
		const attributed = attributeRefunds(
			input.session.id,
			input.orders.flatMap((order) => readLedger(order.payload.meta_data)),
			input.refundRecords ?? []
		);
		return {
			id: 'closure',
			counted: {},
			variance: {},
			breakdowns: { payment_methods: attributed.byMethod },
		} as never;
	});
	const result = await settled();
	let closing!: ReturnType<typeof result.current.actions.closeSession>;
	await act(async () => {
		closing = result.current.actions.closeSession({ counted: { cash: '100' } });
	});
	expect(actions.writeClosure).not.toHaveBeenCalled();
	await act(async () => resolve());
	await act(async () => mockParentOrders!.next([{ ...resident }]));
	const closedEarly = jest.mocked(actions.writeClosure).mock.calls.length > 0;
	await act(async () => {
		mockParentOrders!.next([resident, parentHit()]);
		await closing;
	});
	expect(closedEarly).toBe(false);
	expect((await closing).breakdowns.payment_methods).toEqual({ stripe: 200000, cash: 50000 });
});

// Revert the post-ready accounting wait: closure freezes cash before the fetched card parent emits.
it.each([false, true])(
	'waits for the parent emission after readiness, with same-parent replacement %s',
	async (replace) => {
		entries = [];
		mockRefunds.next([refundHit()]);
		let resolve!: () => void;
		const ready = new Promise<void>((done) => {
			resolve = done;
		});
		mockDeclareRequirements.mockReturnValueOnce([{ release: mockReleaseParents, ready }]);
		jest.mocked(actions.closeSession).mockResolvedValue({ ...session, status: 'closed' } as never);
		jest.mocked(actions.writeClosure).mockImplementationOnce(async (input) => {
			const { attributeRefunds } = jest.requireActual<
				typeof import('../../../../query/src/register-session/expected')
			>('../../../../query/src/register-session/expected');
			const { readLedger } =
				jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
			const attributed = attributeRefunds(
				input.session.id,
				input.orders.flatMap((order) => readLedger(order.payload.meta_data)),
				input.refundRecords ?? []
			);
			return {
				id: 'closure',
				counted: {},
				variance: {},
				breakdowns: { payment_methods: attributed.byMethod },
			} as never;
		});
		const result = await settled();
		let closing!: ReturnType<typeof result.current.actions.closeSession>;
		await act(async () => {
			closing = result.current.actions.closeSession({ counted: { cash: '100' } });
		});
		expect(actions.writeClosure).not.toHaveBeenCalled();
		await act(async () => resolve());
		expect(actions.writeClosure).not.toHaveBeenCalled();
		let resolveReplacement = () => {};
		if (replace) {
			// Revert generation confirmation: an unchanged key from new, unfetched handles closes early.
			const replacementReady = new Promise<void>((done) => {
				resolveReplacement = done;
			});
			mockDeclareRequirements.mockReturnValueOnce([
				{ release: mockReleaseParents, ready: replacementReady },
			]);
			await act(async () => mockRefunds.next([refundHit()]));
			expect(actions.writeClosure).not.toHaveBeenCalled();
		}
		await act(async () => {
			mockOrders.next([parentHit()]);
			resolveReplacement();
			await closing;
		});
		expect((await closing).breakdowns.payment_methods).toEqual({ stripe: 200000 });
	}
);

// Revert to a single-generation wait: releasing the old handles closes before the replacement fetch.
it('follows replacement refund parent handles before computing the closure tender', async () => {
	entries = [];
	mockRefunds.next([refundHit()]);
	let releaseFirst!: () => void;
	const firstReady = new Promise<void>((done) => {
		releaseFirst = done;
	});
	mockDeclareRequirements.mockReturnValueOnce([
		{ release: jest.fn(releaseFirst), ready: firstReady },
	]);
	let resolve!: () => void;
	const ready = new Promise<void>((done) => {
		resolve = done;
	});
	mockDeclareRequirements.mockReturnValueOnce([{ release: mockReleaseParents, ready }]);
	jest.mocked(actions.closeSession).mockResolvedValue({ ...session, status: 'closed' } as never);
	jest.mocked(actions.writeClosure).mockImplementationOnce(async (input) => {
		const { attributeRefunds } = jest.requireActual<
			typeof import('../../../../query/src/register-session/expected')
		>('../../../../query/src/register-session/expected');
		const { readLedger } =
			jest.requireActual<typeof import('@wcpos/order-math')>('@wcpos/order-math');
		const attributed = attributeRefunds(
			input.session.id,
			input.orders.flatMap((order) => readLedger(order.payload.meta_data)),
			input.refundRecords ?? []
		);
		return {
			id: 'closure',
			counted: {},
			variance: {},
			breakdowns: { payment_methods: attributed.byMethod },
		} as never;
	});
	const result = await settled();
	let closing!: ReturnType<typeof result.current.actions.closeSession>;
	await act(async () => {
		closing = result.current.actions.closeSession({ counted: { cash: '100' } });
	});
	expect(actions.writeClosure).not.toHaveBeenCalled();
	const replacementRefund = refundHit();
	replacementRefund.record.payload.parent_id = 2;
	await act(async () => mockRefunds.next([replacementRefund]));
	expect(actions.writeClosure).not.toHaveBeenCalled();
	const replacementParent = parentHit();
	replacementParent.record.payload.id = 2;
	await act(async () => {
		mockOrders.next([replacementParent]);
		resolve();
		await closing;
	});
	expect((await closing).breakdowns.payment_methods).toEqual({ stripe: 200000 });
});

// Restart the deadline for a replacement generation: closing remains blocked beyond the original window.
it('shares one close deadline across replacement refund parent handles', async () => {
	mockRefunds.next([refundHit()]);
	let releaseFirst!: () => void;
	const ready = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	mockDeclareRequirements
		.mockReturnValueOnce([{ release: jest.fn(releaseFirst), ready }])
		.mockReturnValueOnce([{ release: mockReleaseParents, ready: new Promise<void>(() => {}) }]);
	jest.mocked(actions.closeSession).mockResolvedValue({ ...session, status: 'closed' } as never);
	jest.mocked(actions.writeClosure).mockResolvedValueOnce({ id: 'closure' } as never);
	const result = await settled();
	jest.useFakeTimers();
	try {
		let closing!: ReturnType<typeof result.current.actions.closeSession>;
		await act(async () => {
			closing = result.current.actions.closeSession({ counted: { cash: '100' } });
			await jest.advanceTimersByTimeAsync(10_000);
		});
		const replacement = refundHit();
		replacement.record.payload.parent_id = 2;
		await act(async () => mockRefunds.next([replacement]));
		await act(async () => jest.advanceTimersByTimeAsync(4_999));
		expect(actions.writeClosure).not.toHaveBeenCalled();
		await act(async () => jest.advanceTimersByTimeAsync(1));
		expect(actions.writeClosure).toHaveBeenCalledTimes(1);
		await closing;
	} finally {
		jest.useRealTimers();
	}
});

// Refund observation must not write or discard the shared server baseline.
it('keeps the baseline without attempting anchor patches', async () => {
	entries = [];
	const patch = jest.fn().mockRejectedValue(new Error('anchor patch failed'));
	active = [
		{ ...active[0], incrementalPatch: patch, server_expected_at: '2026-09-17T00:00:00.000Z' },
	];
	mockOrders.next([parentHit('session', false, '2026-09-15')]);
	const result = await settled();
	await act(async () => mockOrders.next([parentHit('session', true, '2026-09-15')]));
	expect(patch).not.toHaveBeenCalled();
	await act(async () => mockOrders.next([parentHit('session', true, '2026-09-16')]));
	expect(patch).not.toHaveBeenCalled();
	jest
		.mocked(actions.closeSession)
		.mockResolvedValueOnce({ ...session, status: 'closed' } as never);
	jest.mocked(actions.writeClosure).mockResolvedValueOnce({ id: 'closure' } as never);
	await act(async () => {
		await result.current.actions.closeSession({ counted: { cash: '100' } });
	});
	expect(actions.writeClosure).toHaveBeenLastCalledWith(
		expect.objectContaining({
			tillExpected: { cash: '100', stripe: '-20.0000' },
			orders: [parentHit('session', true, '2026-09-16').record],
			refundRecords: [],
		})
	);
});

// Revert session_id to metadata $elemMatch: every order emission scans refund metadata.
it('queries refunds by the promoted session field and referenced ids', async () => {
	mockOrders.next([parentHit('session', true, '2026-09-15')]);
	await settled();
	expect(mockQueryCalls).toHaveBeenCalledWith(
		expect.objectContaining({
			collection: 'refunds',
			selector: { $or: [{ session_id: 'session' }, { id: { $in: [20] } }] },
		})
	);
});

// Revert: stop passing useStoreDay().today() to the create action.
it('passes the store opening day across the session writer boundary', async () => {
	jest.useFakeTimers().setSystemTime(new Date('2026-09-17T01:00:00Z'));
	try {
		jest
			.mocked(actions.openSession)
			.mockResolvedValueOnce({ id: 'session', register_id: 'register' } as never);
		const { result } = renderHook(() => useRegisterSession());
		await result.current.actions.openSession({ expectedFloat: null, countedFloat: '100' });
		expect(actions.openSession).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ businessDay: { year: 2026, month: 9, day: 16 } })
		);
	} finally {
		jest.useRealTimers();
	}
});

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
		addRxPlugin(RxDBLocalDocumentsPlugin);
		const db: StoreDatabase = await createRxDatabase({
			name: `actornames${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			multiInstance: false,
		});
		const userDB: UserDatabase = await createRxDatabase({
			name: `actoruser${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		});
		try {
			await db.addCollections({ closures: { schema: closuresLiteral, autoMigrate: false } });
			await remintRegister(userDB);
			if (!recovered)
				jest.mocked(actions.closeSession).mockResolvedValueOnce({
					...session,
					opened_by,
					approved_by,
					closed_by: 7,
					status: 'closed',
					closed_at_gmt: '2026-09-17T12:00:00Z',
				} as never);
			const { writeClosure } = jest.requireActual<typeof actions>('@wcpos/query/register-session');
			jest
				.mocked(actions.writeClosure)
				.mockImplementationOnce((input) => writeClosure({ ...input, storeDB: db, userDB }));
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
			const result = await settled();
			if (recovered)
				Object.assign(active[0], {
					opened_by,
					approved_by,
					closed_by: 8,
					status: 'closed',
					closed_at_gmt: '2026-09-17T12:00:00Z',
				});
			await result.current.actions.closeSession({ counted: { cash: '120' } });
			const saved = await db.closures.findOne('session').exec();
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
			// Revert: persist transaction cashier ids instead of credential display names.
			const document = buildClosureDocument(saved!.toMutableJSON(), {
				store: {},
				currency: 'USD',
				timezone: 'UTC',
				locale: 'en-US',
				printedAt: '2026-09-17T12:00:00Z',
				formatMoney: (value) => value,
				i18n: {},
			});
			expect(document.closure.breakdowns.labels.closed_by_name).toBe(recovered ? 'Alex' : 'Pat');
			expect(saved?.sync_status).toBe('pending');
			expect(
				renderLogiclessTemplate(
					'{{#closure.breakdowns.cashiers}}{{name}};{{/closure.breakdowns.cashiers}}',
					document
				)
			).toBe('Pat;Alex;99;');
		} finally {
			await db.close();
			await userDB.close();
		}
	}
);

describe('overdue', () => {
	// Local noon, so the close times below sit either side of it whatever the runner's zone.
	const noon = new Date(2026, 9, 13, 12, 0);

	function rendered() {
		const counter = { renders: 0, overdueWithSession: [] as boolean[] };
		const view = renderHook(() => {
			counter.renders += 1;
			const value = useRegisterSession();
			if (value.session) counter.overdueWithSession.push(value.overdue);
			return value;
		});
		return { ...view, counter };
	}

	async function settle(result: { current: ReturnType<typeof useRegisterSession> }) {
		await waitFor(() => expect(result.current.loaded).toBe(true));
		await act(async () => {
			await jest.advanceTimersByTimeAsync(0);
		});
	}

	// One act per minute: a single act over many minutes batches every tick into one render.
	async function advanceMinutes(minutes: number) {
		for (let minute = 0; minute < minutes; minute += 1) {
			await act(async () => {
				await jest.advanceTimersByTimeAsync(60_000);
			});
		}
	}

	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(noon);
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('never re-renders from the clock when the store has no close time', async () => {
		const { result, counter } = rendered();
		await settle(result);
		const settledRenders = counter.renders;
		await advanceMinutes(10);
		// Put `timer(0, 60_000)` back in the data stream and this counts ten more.
		expect(counter.renders).toBe(settledRenders);
		// Catches a store with no close time reading as overdue.
		expect(result.current.overdue).toBe(false);
	});

	it('is overdue on the first settled render of an open session past close', async () => {
		mockCloseTime = '11:00';
		const { result, counter } = rendered();
		await settle(result);
		// Catches a verdict that waits for the clock's first tick: every render with the session is overdue.
		expect(counter.overdueWithSession.length).toBeGreaterThan(0);
		expect(counter.overdueWithSession.every(Boolean)).toBe(true);
	});

	it('is not overdue past close while counting', async () => {
		mockCloseTime = '11:00';
		active = [{ ...active[0], status: 'counting' }];
		const { result } = rendered();
		await settle(result);
		expect(result.current.session?.status).toBe('counting');
		// Catches dropping `session.status === 'open'` from the verdict.
		expect(result.current.overdue).toBe(false);
	});

	it('is not overdue past close with no session', async () => {
		mockCloseTime = '11:00';
		active = [];
		const { result } = rendered();
		await settle(result);
		expect(result.current.session).toBeNull();
		// Catches dropping `!!session` from the verdict.
		expect(result.current.overdue).toBe(false);
	});

	it('flips to overdue once, with one render, when the clock passes close', async () => {
		mockCloseTime = '12:05';
		const { result, counter } = rendered();
		await settle(result);
		// Catches a close time ahead of now reading as past.
		expect(result.current.overdue).toBe(false);
		const settledRenders = counter.renders;
		await advanceMinutes(30);
		// Catches the flip never re-rendering (no clock at all) ...
		expect(result.current.overdue).toBe(true);
		// ... and a per-minute render (a clock without distinctUntilChanged): one flip, one render.
		expect(counter.renders).toBe(settledRenders + 1);
	});

	it('follows a close time changed mid-session, on the render that carries it', async () => {
		mockCloseTime = '13:00';
		const { result, counter, rerender } = rendered();
		await settle(result);
		// Catches a close time an hour ahead reading as past.
		expect(result.current.overdue).toBe(false);
		mockCloseTime = '11:00';
		rerender();
		// Read the verdict from the stream's state instead of fresh in render and this frame shows the old close time's verdict.
		expect(result.current.overdue).toBe(true);
		mockCloseTime = '12:10';
		rerender();
		// Catches the same stale-state frame in the other direction: a close time moved ahead still reads overdue.
		expect(result.current.overdue).toBe(false);
		await act(async () => {
			await jest.advanceTimersByTimeAsync(0);
		});
		const settledRenders = counter.renders;
		await advanceMinutes(30);
		// Key `pastClose$` on [] instead of [closeTime] and the 13:00 stream never flips inside this window.
		expect(result.current.overdue).toBe(true);
		// Catches the replacement stream re-rendering per minute rather than once at its flip.
		expect(counter.renders).toBe(settledRenders + 1);
	});
});

it.each([true, false])('adds only pending sales with server baseline %s', async (baseline) => {
	entries = [];
	active = [
		{
			...active[0],
			counted_float: '0',
			server_expected: baseline ? { cash: '100' } : null,
			server_sales_count: baseline ? 5 : null,
		},
	];
	mockOrders.next(
		[
			['local', '10', true],
			['synced', '50', false],
		].map(([id, amount, pending]) => {
			const hit = parentHit('session', false, pending ? '2026-09-15T10:00:00' : '2026-09-15', {
				id,
				amount,
				kind: 'cash',
				method_id: 'cash',
			});
			hit.record.uuid = String(id);
			hit.record.local.pendingMutationIds = pending ? ['write'] : [];
			return hit;
		})
	);
	const result = await settled();
	expect(result.current.expected.cash).toBe(baseline ? '110.0000' : '60.0000');
	expect(result.current.salesCount).toBe(baseline ? 6 : 2);
});

it('keeps acknowledged sales, refunds and movements until baseline refresh', async () => {
	active = [{ ...active[0], server_expected_at: '2026-09-15T10:00:00.000Z' }];
	mockOrders.next([parentHit('session', false, '2026-09-15T10:00:01')]);
	const refund = refundHit();
	refund.record.local.dirty = false;
	refund.record.payload.date_created_gmt = '2026-09-15T10:00:01';
	mockRefunds.next([refund]);
	entries = [
		{
			...movement,
			amount: '30',
			sync_status: 'synced',
		},
	];
	const result = await settled();
	const expected = { cash: '110.0000', stripe: '100.0000' };
	expect(result.current.expected).toEqual(expected);
	expect(result.current.salesCount).toBe(1);
	await act(async () => {
		Object.assign(active[0], {
			server_expected: expected,
			server_sales_count: 1,
			server_expected_at: '2026-09-15T10:00:02.000Z',
			server_movement_ids: [movement.id],
		});
		mockSessionChanges.next();
	});
	expect(result.current.expected).toEqual(expected);
	expect(result.current.salesCount).toBe(1);
});

it('derives locally when figures have no snapshot boundary', async () => {
	active = [
		{
			...active[0],
			server_expected: { cash: '999' },
			server_sales_count: 99,
			server_expected_at: null,
		},
	];
	const result = await settled();
	expect(result.current.expected.cash).toBe('120.0000');
	expect(result.current.salesCount).toBe(0);
});

it.each([
	['captured', false],
	['voided', false],
	['captured', true],
	['voided', true],
])('preserves baseline ledger rows on a dirty order (%s, ids %s)', async (status, withIds) => {
	if (withIds) active = [{ ...active[0], server_ledger_row_ids: ['card'] }];
	entries = [];
	const hit = parentHit('session', false, '2026-09-15T10:00:00', {
		kind: 'cash',
		method_id: 'cash',
		amount: '60',
		status,
		created_at_gmt: '2026-09-15T08:00:00',
		updated_at_gmt: '2026-09-15T10:00:00',
	});
	hit.record.local.dirty = true;
	hit.record.payload.date_created_gmt = '2026-09-15T08:00:00';
	const meta = hit.record.payload.meta_data as { value: { payments: Row[] } }[];
	meta[0].value.payments.push({
		...meta[0].value.payments[0],
		id: 'new',
		amount: '10',
		status: 'captured',
		created_at_gmt: '2026-09-15T10:00:00',
	});
	mockOrders.next([hit]);
	const result = await settled();
	expect(mockRequestRefresh).toHaveBeenCalledWith({
		storeDB: mockStoreSession.storeDB,
		registerId: 'register',
	});
	expect(result.current.expected.cash).toBe('110.0000');
	expect(result.current.salesCount).toBe(0);
	await act(async () => {
		Object.assign(active[0], {
			server_expected: { cash: '70' },
			server_expected_at: '2026-09-15T11:00:00.000Z',
			server_ledger_row_ids: withIds ? ['card', 'new'] : null,
		});
		mockSessionChanges.next();
	});
	expect(result.current.expected.cash).toBe('70');
	expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
});

it.each([null, 1])(
	'counts only orders absent from the snapshot (remoteId %s)',
	async (remoteId) => {
		const hit = parentHit('session', false, '2026-09-15T10:00:00');
		hit.record.remoteId = remoteId;
		hit.record.local.dirty = true;
		hit.record.payload.date_created_gmt = '2026-09-15T08:00:00';
		mockOrders.next([hit]);
		const result = await settled();
		expect(result.current.salesCount).toBe(remoteId === null ? 1 : 0);
	}
);

it.each([
	[[1], '2026-09-15T10:00:00', 5],
	[[], '2026-09-15T09:00:00', 6],
	[[], '2026-09-15T08:00:00', 6],
	[undefined, '2026-09-15T10:00:00', 6],
	[null, '2026-09-15T08:00:00', 5],
] as const)(
	'counts sales by snapshot order ids %j at %s',
	async (ids, createdAt, expectedCount) => {
		entries = [];
		active = [{ ...active[0], server_order_ids: ids, server_sales_count: 5 }];
		const hit = parentHit('session', false, createdAt);
		hit.record.remoteId = 1;
		mockOrders.next([hit]);
		const result = await settled();
		expect(result.current.salesCount).toBe(expectedCount);
	}
);

it.each([
	[['card'], '2026-09-15T10:00:00', '100'],
	[[], '2026-09-15T09:00:00', '110.0000'],
	[[], '2026-09-15T08:00:00', '110.0000'],
	[undefined, '2026-09-15T10:00:00', '110.0000'],
	[null, '2026-09-15T08:00:00', '100'],
] as const)(
	'uses snapshot ledger ids %j at %s for display and closure',
	async (ids, createdAt, cash) => {
		entries = [];
		active = [{ ...active[0], server_ledger_row_ids: ids }];
		mockOrders.next([
			parentHit('session', false, createdAt, {
				kind: 'cash',
				method_id: 'cash',
				amount: '10',
			}),
		]);
		const result = await settled();
		expect(result.current.expected.cash).toBe(cash);
		jest
			.mocked(actions.closeSession)
			.mockResolvedValueOnce({ ...session, status: 'closed' } as never);
		jest.mocked(actions.writeClosure).mockResolvedValueOnce({ id: 'closure' } as never);
		await act(async () => {
			await result.current.actions.closeSession({ counted: { cash: '100' } });
		});
		expect(actions.writeClosure).toHaveBeenCalledWith(
			expect.objectContaining({
				tillExpected: { cash },
			})
		);
	}
);

it.each([
	[[], '2026-09-15T09:00:00', '80.0000'],
	[[20], '2026-09-15T10:00:00', '100'],
	[null, '2026-09-15T10:00:00', '80.0000'],
	[null, '2026-09-15T08:00:00', '100'],
] as const)(
	'uses snapshot refund ids %j at %s for display and closure',
	async (ids, createdAt, cash) => {
		entries = [];
		active = [{ ...active[0], server_refund_ids: ids }];
		const refund = refundHit();
		refund.record.payload.date_created_gmt = createdAt;
		mockOrders.next([parentHit('old-session', false)]);
		mockRefunds.next([refund]);
		const result = await settled();
		expect(result.current.expected.cash).toBe(cash);
		jest
			.mocked(actions.closeSession)
			.mockResolvedValueOnce({ ...session, status: 'closed' } as never);
		jest.mocked(actions.writeClosure).mockResolvedValueOnce({ id: 'closure' } as never);
		await act(async () => {
			await result.current.actions.closeSession({ counted: { cash: '100' } });
		});
		expect(actions.writeClosure).toHaveBeenCalledWith(
			expect.objectContaining({ tillExpected: { cash } })
		);
	}
);

it.each([
	[[], undefined, '-20.0000'],
	[[20], undefined, undefined],
	[null, undefined, '-20.0000'],
	[null, '2026-09-15T10:00:00', '-20.0000'],
	[null, '2026-09-15T08:00:00', undefined],
] as const)('accounts for allocation-only refund ids %j at %s', async (ids, at, stripe) => {
	entries = [];
	active = [{ ...active[0], server_refund_ids: ids, server_ledger_row_ids: ['card'] }];
	mockOrders.next([
		parentHit('session', true, '2026-09-15', {
			refunds: [{ id: 20, amount: '20', status: 'succeeded', created_at_gmt: at }],
		}),
	]);
	const result = await settled();
	expect(result.current.expected.stripe).toBe(stripe);
});

it.each([
	['ledger', '2026-09-15T08:00:01', 1],
	['refund', '2026-09-15T08:00:01', 1],
	['ledger', '2026-09-15T10:00:00', 0],
	['refund', '2026-09-15T10:00:00', 0],
] as const)(
	'refreshes edited %s version %s, not snapshot time',
	async (kind, updated, requests) => {
		entries = [];
		const version = requests ? '2026-09-15T08:00:00' : updated;
		active = [
			{
				...active[0],
				server_ledger_row_ids: ['card'],
				server_refund_ids: [20],
				server_ledger_rows: [{ id: 'card', updated_at_gmt: version, status: 'captured' }],
				server_refunds: [{ id: 20, updated_at_gmt: version }],
			},
		];
		mockOrders.next([parentHit('session', false, kind === 'ledger' ? updated : version)]);
		const refund = refundHit('30');
		refund.record.payload.date_created_gmt = '2026-09-15T08:00:00';
		refund.record.payload.date_modified_gmt = kind === 'refund' ? updated : version;
		mockRefunds.next([refund]);
		const result = await settled();
		expect(result.current.expected.cash).toBe('100');
		expect(mockRequestRefresh).toHaveBeenCalledTimes(requests);
	}
);

it.each([
	['before-tip', 1],
	['after-tip', 0],
	[undefined, 0],
] as const)(
	'compares opaque ledger version %s at the same timestamp',
	async (version, requests) => {
		entries = [];
		const updated = '2026-09-15T08:00:00';
		active = [
			{
				...active[0],
				server_ledger_row_ids: ['card'],
				server_ledger_rows: [{ id: 'card', status: 'captured', updated_at_gmt: updated, version }],
			},
		];
		mockOrders.next([
			parentHit('session', false, updated, { amount: '110', version: 'after-tip' }),
		]);
		const result = await settled();
		expect(result.current.expected).toEqual({ cash: '100' });
		expect(mockRequestRefresh).toHaveBeenCalledTimes(requests);
	}
);

// ADR 0040 D6: only a captured leg ever counted, so failing or voiding a captured leg debits it
// exactly once, and failing or voiding an authorized leg changes nothing.
it.each([
	['cash', 'captured', 'voided', '50.0000', '50'],
	['cash', 'authorized', 'failed', '100', '100'],
	['cheque', 'authorized', 'voided', '100', '100'],
	['cheque', 'captured', 'failed', '50.0000', '50'],
])(
	'a snapshotted %s %s leg changed offline to %s leaves the till expecting %s',
	async (method, before, status, tillExpected, serverExpected) => {
		entries = [];
		const snapshot = { id: 'card', updated_at_gmt: '2026-09-15T08:00:00', status: before };
		active = [
			{
				...active[0],
				server_expected: { [method]: '100' },
				server_ledger_row_ids: ['card'],
				server_ledger_rows: [snapshot],
			},
		];
		const hit = parentHit('session', false, '2026-09-15T10:00:00', {
			kind: method === 'cash' ? 'cash' : 'manual',
			method_id: method,
			amount: '50',
			status,
			created_at_gmt: snapshot.updated_at_gmt,
		});
		hit.record.local.dirty = true;
		mockOrders.next([hit]);
		const result = await settled();
		expect(result.current.expected).toEqual({ [method]: tillExpected });
		expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
		jest
			.mocked(actions.closeSession)
			.mockResolvedValueOnce({ ...session, status: 'closed' } as never);
		jest.mocked(actions.writeClosure).mockResolvedValueOnce({ id: 'closure' } as never);
		await act(async () => {
			await result.current.actions.closeSession({ counted: { [method]: '50' } });
		});
		expect(actions.writeClosure).toHaveBeenCalledWith(
			expect.objectContaining({ tillExpected: { [method]: tillExpected } })
		);
		await act(async () => {
			Object.assign(active[0], {
				server_expected: { [method]: serverExpected },
				server_expected_at: '2026-09-15T11:00:00',
				server_ledger_rows: [{ ...snapshot, status, updated_at_gmt: '2026-09-15T10:00:00' }],
			});
			mockSessionChanges.next();
		});
		expect(result.current.expected).toEqual({ [method]: serverExpected });
		expect(mockRequestRefresh).toHaveBeenCalledTimes(1);
	}
);

it.each(['startCounting', 'backToSelling', 'closeSession'] as const)(
	'%s rejects with the domain error when the session is missing',
	async (action) => {
		active = [{ ...session, sync_status: 'failed' }];
		const { result } = renderHook(() => useRegisterSession());
		await act(async () => {});
		await expect(
			result.current.actions[action]({ counted: { cash: '100' } })
		).rejects.toBeInstanceOf(actions.RegisterSessionRequiredError);
		mockHasSessions = false;
		const missing = renderHook(() => useRegisterSession());
		await expect(
			missing.result.current.actions[action]({ counted: { cash: '100' } })
		).rejects.toBeInstanceOf(actions.RegisterSessionRequiredError);
		expect(actions.startCounting).not.toHaveBeenCalled();
		expect(actions.backToSelling).not.toHaveBeenCalled();
		expect(actions.closeSession).not.toHaveBeenCalled();
	}
);

// Removing any one of the three guard keys exposes the outgoing drawer during this render.
it.each(['store', 'register', 'generation'] as const)(
	'hides stale session data during a %s switch',
	async (scope) => {
		const previousStore = mockStoreSession.storeDB;
		const previousRegister = mockBinding.registerId;
		const renders: ReturnType<typeof useRegisterSession>[] = [];
		const view = renderHook(() => {
			const value = useRegisterSession();
			renders.push(value);
			return value;
		});
		await waitFor(() => expect(view.result.current.session?.id).toBe('session'));
		renders.length = 0;
		try {
			if (scope === 'store') mockStoreSession.storeDB = {};
			if (scope === 'register') mockBinding.registerId = 'other';
			if (scope === 'generation') mockGeneration = {};
			view.rerender();
			expect(renders[0].session).toBeNull();
			expect(renders[0].loaded).toBe(false);
			await expect(renders[0].actions.startCounting()).rejects.toBeInstanceOf(
				actions.RegisterSessionRequiredError
			);
		} finally {
			view.unmount();
			mockStoreSession.storeDB = previousStore;
			mockBinding.registerId = previousRegister;
		}
	}
);

it('records the live session and the counting mark on the device as the session moves', async () => {
	const row = { ...session, opened_by: 7, expected_float: '90', business_day: '2026-10-28' };
	jest.mocked(actions.openSession).mockResolvedValue(row as never);
	jest.mocked(actions.startCounting).mockResolvedValue({ ...row, status: 'counting' } as never);
	jest.mocked(actions.backToSelling).mockResolvedValue(row as never);
	jest.mocked(actions.closeSession).mockResolvedValue({ ...row, status: 'closed' } as never);
	jest.mocked(actions.writeClosure).mockResolvedValue({ id: 'closure' } as never);
	const result = await settled();
	await act(() => result.current.actions.openSession({ expectedFloat: '90', countedFloat: '100' }));
	expect(actions.recordLiveSession).toHaveBeenLastCalledWith(
		mockStoreSession.userDB,
		'site',
		'register',
		{
			session_id: 'session',
			status: 'open',
			opened_at_gmt: session.opened_at_gmt,
			opened_by: { id: 7, name: 'Pat' },
			acknowledged: false,
			expected_float: '90',
			counted_float: '100',
			business_day: '2026-10-28',
		}
	);
	await act(() => result.current.actions.startCounting());
	expect(actions.recordLiveSession).toHaveBeenLastCalledWith(
		mockStoreSession.userDB,
		'site',
		'register',
		expect.objectContaining({
			status: 'counting',
			acknowledged: true,
			opened_by: { id: 7, name: 'Pat' },
		})
	);
	expect(actions.markCountingHere).toHaveBeenLastCalledWith(
		mockStoreSession.userDB,
		'site',
		'register',
		true
	);
	expect(jest.mocked(actions.recordLiveSession).mock.invocationCallOrder.at(-1)).toBeLessThan(
		jest.mocked(actions.markCountingHere).mock.invocationCallOrder.at(-1)!
	);
	await act(() => result.current.actions.backToSelling());
	expect(actions.recordLiveSession).toHaveBeenLastCalledWith(
		mockStoreSession.userDB,
		'site',
		'register',
		expect.objectContaining({ status: 'open', acknowledged: true })
	);
	await act(() => result.current.actions.closeSession({ counted: { cash: '100' } }));
	expect(actions.recordLiveSession).toHaveBeenLastCalledWith(
		mockStoreSession.userDB,
		'site',
		'register',
		null
	);
	expect(jest.mocked(actions.writeClosure).mock.invocationCallOrder.at(-1)).toBeLessThan(
		jest.mocked(actions.recordLiveSession).mock.invocationCallOrder.at(-1)!
	);
});

it.each(['synced', 'pending'])(
	"refuses to start counting while a seeded session's figures are pending (%s)",
	async (sync_status) => {
		addRxPlugin(RxDBLocalDocumentsPlugin);
		const userDB: UserDatabase = await createRxDatabase({
			name: `figures${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			localDocuments: true,
			multiInstance: false,
		});
		const previousUserDB = mockStoreSession.userDB;
		const previousStoreDB = mockStoreSession.storeDB;
		const storeDB = { name: 'seeded-store' };
		mockStoreSession.userDB = userDB;
		mockStoreSession.storeDB = storeDB;
		try {
			await remintRegister(userDB);
			await recordLiveSession(userDB, 'site', 'register', {
				session_id: 'session',
				status: 'open',
				opened_at_gmt: session.opened_at_gmt,
				opened_by: { id: 7, name: 'Cached Pat' },
				acknowledged: sync_status === 'synced',
				expected_float: '100',
				counted_float: '100',
				business_day: '2026-10-28',
			});
			active = [{ ...active[0], server_expected_at: null, sync_status }];
			const result = await settled();
			expect(result.current).toHaveProperty('figuresPending', false);
			await act(() => markSeededIn(userDB, 'site', 'register', 'another-store'));
			expect(result.current).toHaveProperty('figuresPending', false);
			await act(() => markSeededIn(userDB, 'site', 'register', storeDB.name));
			await waitFor(() => expect(result.current).toHaveProperty('figuresPending', true));
			await expect(result.current.actions.startCounting()).rejects.toThrow(
				'register.figures_after_sync'
			);
			expect(actions.startCounting).not.toHaveBeenCalled();
			await expect(
				result.current.actions.closeSession({ counted: { cash: '100' } })
			).rejects.toThrow('register.figures_after_sync');
			expect(actions.closeSession).not.toHaveBeenCalled();
			await act(async () => {
				active = [{ ...active[0], server_expected_at: session.server_expected_at }];
				mockSessionChanges.next();
			});
			await waitFor(() => expect(result.current).toHaveProperty('figuresPending', false));
			jest
				.mocked(actions.startCounting)
				.mockResolvedValue({ ...session, status: 'counting' } as never);
			await act(() => result.current.actions.startCounting());
			expect(actions.startCounting).toHaveBeenCalledWith(storeDB, 'session');
			await act(async () => {
				active = [{ ...active[0], server_expected_at: null }];
				mockSessionChanges.next();
			});
			await waitFor(() => expect(result.current).toHaveProperty('figuresPending', true));
			await act(() => recordLiveSession(userDB, 'site', 'register', null));
			await waitFor(() => expect(result.current).toHaveProperty('figuresPending', false));
		} finally {
			mockStoreSession.userDB = previousUserDB;
			mockStoreSession.storeDB = previousStoreDB;
			await userDB.remove();
		}
	}
);
