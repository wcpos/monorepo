/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { useRegisterSession } from './use-register-session';

type Row = Record<string, unknown>;

let active: Row[] = [];
let closed: Row[] = [];
let entries: Row[] = [];
let closureRows: Row[] = [];

// The hook only trusts an emission whose collections are identical to the ones it holds now,
// so these have to be stable across renders. Both session queries are register-scoped, so
// whatever they return IS this register's set of sessions.
const mockSessions = {
	find: (query?: { selector?: { status?: unknown } }) => ({
		$: of(query?.selector?.status === 'closed' ? closed : active),
	}),
};
const mockMovements = { find: () => ({ $: of(entries) }) };
const mockClosures = { find: () => ({ $: of(closureRows) }) };
const mockBinding = { registerId: 'register', registerName: 'Front' };
const mockRuntime = { engine: {}, locale: 'en' };
const mockStoreSession = {
	store: { id: 1 },
	wpCredentials: { id: 7 },
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
	observeEngineQuery: () => of({ hits: [] }),
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
	active = [session];
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
