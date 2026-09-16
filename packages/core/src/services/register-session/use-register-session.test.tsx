/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { BehaviorSubject, map, merge, of, Subject } from 'rxjs';
import { Query } from 'mingo';

import { getLogger } from '@wcpos/utils/logger';

import * as actions from './session-store';
import { useRegisterSession } from './use-register-session';

jest.mock('./session-store');
const logger = jest.mocked(getLogger(['wcpos', 'registerSession']));

type Row = Record<string, unknown>;

let active: Row[] = [];
let closed: Row[] = [];
let entries: Row[] = [];
let closureRows: Row[] = [];
const mockSessionChanges = new Subject<void>();
type Hit = { record: { uuid: string; local: { dirty: boolean }; payload: Row } };
let mockOrders = new BehaviorSubject<Hit[]>([]);
let mockRefunds = new BehaviorSubject<Hit[]>([]);
function mockObserve(
	_engine: unknown,
	_locale: string,
	query: { collection: string; selector: Row }
) {
	return (query.collection === 'refunds' ? mockRefunds : mockOrders).pipe(
		map((hits) => ({
			hits: hits.filter(({ record }) => new Query(query.selector).test(record.payload)),
		}))
	);
}

// The hook only trusts an emission whose collections are identical to the ones it holds now,
// so these have to be stable across renders. Both session queries are register-scoped, so
// whatever they return IS this register's set of sessions.
const mockSessions = {
	find: (query?: { selector?: { status?: unknown } }) => ({
		$: merge(of(null), mockSessionChanges).pipe(
			map(() => (query?.selector?.status === 'closed' ? closed : active))
		),
	}),
};
const mockMovements = { find: () => ({ $: of(entries) }) };
const mockClosures = { find: () => ({ $: of(closureRows) }) };
const mockBinding = { registerId: 'register', registerName: 'Front' };
const mockRuntime = { engine: {}, locale: 'en' };
const mockStoreSession = {
	store: { id: 1 },
	wpCredentials: { id: 7, display_name: 'Pat', username: 'pat' },
	userDB: {},
	site: { uuid: 'site' },
};

jest.mock('./use-register-session-collections', () => ({
	useRegisterSessionCollection: () => mockSessions,
	useCashMovementCollection: () => mockMovements,
	useClosureCollection: () => mockClosures,
}));
jest.mock('../register/use-register-binding', () => ({
	useRegisterBinding: () => mockBinding,
}));
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => mockStoreSession,
}));
jest.mock('@wcpos/query', () => ({
	observeEngineQuery: (...args: Parameters<typeof mockObserve>) => mockObserve(...args),
	useQueryRuntime: () => mockRuntime,
	useDocField: (_doc: unknown, select: (value: Record<string, unknown>) => unknown) =>
		select({
			register_sessions: true,
			variance_threshold: null,
			expected_close_time: null,
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
	mockRefunds = new BehaviorSubject<Hit[]>([]);
	closed = [];
	closureRows = [];
	entries = [movement];
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

it('trusts the server total once every local row is delivered', async () => {
	entries = [{ ...movement, sync_status: 'synced' }];
	const result = await settled();
	expect(result.current.expected.cash).toBe('100');
	expect(result.current.unsyncedCount).toBe(0);
});

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
	expect(actions.retryMovement).toHaveBeenCalledWith(mockMovements, 'movement');
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

it('logs a void with the reversal id and the current cashier', async () => {
	jest
		.mocked(actions.voidMovement)
		.mockResolvedValue({ ...movement, id: 'reversal', type: 'void' } as never);
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
			local: { dirty: false },
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
function parentHit(saleSession = 'old-session', allocated = true, modified = '2026-09-01'): Hit {
	return {
		record: {
			uuid: 'parent',
			local: { dirty: false },
			payload: {
				id: 1,
				date_modified_gmt: modified,
				meta_data: [
					{
						key: '_wcpos_payments',
						value: {
							schema: 1,
							payments: [
								{
									id: 'card',
									session_id: saleSession,
									kind: 'card',
									method_id: 'stripe',
									status: 'captured',
									amount: '100',
									refunded_amount: allocated ? '20' : '0',
									refunds: allocated ? [{ id: 20, amount: '20', status: 'succeeded' }] : [],
								},
							],
						},
					},
				],
			},
		},
	};
}

// Remove the refund subscription or snapshot nulling: live edits stay hidden behind server_expected.
it('keeps the initial empty snapshot, then recomputes inserts, updates and deletion and permits server re-anchoring', async () => {
	entries = [];
	const result = await settled();
	expect(result.current.expected).toEqual({ cash: '100' });
	await act(async () => {
		mockRefunds.next([refundHit()]);
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '80.0000' }));
	expect(active[0].server_expected).toBeNull();
	await act(async () => {
		mockRefunds.next([refundHit('30')]);
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '70.0000' }));
	await act(async () => {
		mockRefunds.next([]);
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '100.0000' }));
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
		active = [{ ...active[0], server_expected: { cash: '80' } }];
		mockSessionChanges.next();
	});
	await waitFor(() => expect(result.current.expected).toEqual({ cash: '80' }));
	await act(async () => {
		mockOrders.next([parentHit()]);
	});
	await waitFor(() =>
		expect(result.current.expected).toEqual({ cash: '100.0000', stripe: '-20.0000' })
	);
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
	active = [{ ...active[0], server_sales_count: null }];
	mockOrders.next([parentHit('session', true, '2026-09-15')]);
	mockRefunds.next([refundHit()]);
	const result = await settled();
	await waitFor(() =>
		expect(result.current.expected).toEqual({ cash: '100.0000', stripe: '80.0000' })
	);
	expect(result.current.salesCount).toBe(1);
});
