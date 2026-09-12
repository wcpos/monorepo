/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { useRegisterSession } from './use-register-session';

type Row = Record<string, unknown>;

let active: Row[] = [];
let entries: Row[] = [];

// The hook only trusts an emission whose collections are identical to the ones it holds now,
// so these have to be stable across renders.
const collection = (rows: () => Row[]) => ({
	find: (query?: { selector?: { status?: unknown } }) => ({
		$: of(query?.selector?.status === 'closed' ? [] : rows()),
	}),
});
const mockSessions = collection(() => active);
const mockMovements = collection(() => entries);
const mockBinding = { registerId: 'register', registerName: 'Front' };
const mockRuntime = { engine: {}, locale: 'en' };
const mockStoreSession = { store: { id: 1 }, wpCredentials: { id: 7 } };

jest.mock('./use-register-session-collections', () => ({
	useRegisterSessionCollection: () => mockSessions,
	useCashMovementCollection: () => mockMovements,
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
