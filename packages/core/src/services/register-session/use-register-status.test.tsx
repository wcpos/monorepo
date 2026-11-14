/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { map, merge, of, startWith, Subject } from 'rxjs';

import { useRegisterStatus } from './use-register-status';

type Row = Record<string, unknown>;
let active: Row[] = [];
let closed: Row[] = [];
let closureRows: Row[] = [];
let mockHasSessions = true;
let mockGeneration = {};
const mockSessionChanges = new Subject<void>();
// The status read composes these; query's own suites own the reads (drawer.test.ts the rule).
jest.mock('../../../../query/src/register-session/reads', () => ({
	...jest.requireActual('../../../../query/src/register-session/reads'),
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
	observeRegisterClosures: () => of(closureRows),
}));
const mockBinding = { registerId: 'register' as string | null };
jest.mock('../register/use-register-binding', () => ({ useRegisterBinding: () => mockBinding }));
let mockSessionsOn = true;
let mockCloseTime: string | null = null;
const mockStoreSession = { store: { id: 1 }, storeDB: {} as object };
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => mockStoreSession,
	useAppState: () => ({ ...mockStoreSession, store: { timezone: 'UTC' } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (_doc: unknown, select: (value: Record<string, unknown>) => unknown) =>
		select({ register_sessions: mockSessionsOn, expected_close_time: mockCloseTime }),
}));

const session = {
	id: 'session',
	register_id: 'register',
	status: 'open',
	opened_at_gmt: '2026-09-12T08:00:00.000Z',
	sync_status: 'synced',
};

beforeEach(() => {
	active = [session];
	closed = [];
	closureRows = [];
	mockHasSessions = true;
	mockSessionsOn = true;
	mockCloseTime = null;
	mockBinding.registerId = 'register';
	mockStoreSession.storeDB = {};
});

it('is not loaded while the sessions read has no answer, so an open register never reads closed', () => {
	mockHasSessions = false;
	const { result } = renderHook(() => useRegisterStatus());
	expect(result.current).toMatchObject({ session: null, loaded: false, registerId: 'register' });
});

it('answers the current session once the read emits', async () => {
	const { result } = renderHook(() => useRegisterStatus());
	await waitFor(() => expect(result.current.session?.id).toBe('session'));
	expect(result.current.loaded).toBe(true);
	expect(result.current.overdue).toBe(false);
});

it('applies the drawer’s rule: an interrupted local close is current, a written one is not', async () => {
	active = [];
	closed = [{ ...session, status: 'closed', closure_id: 'session', sync_status: 'pending' }];
	const { result, unmount } = renderHook(() => useRegisterStatus());
	await waitFor(() => expect(result.current.session?.status).toBe('closed'));
	unmount();
	closureRows = [{ id: 'session', sync_status: 'pending' }];
	mockStoreSession.storeDB = {};
	const written = renderHook(() => useRegisterStatus());
	await waitFor(() => expect(written.result.current.loaded).toBe(true));
	expect(written.result.current.session).toBeNull();
});

it('is loaded with no session, and reads nothing, while register sessions are off', () => {
	mockSessionsOn = false;
	const { result } = renderHook(() => useRegisterStatus());
	expect(result.current).toMatchObject({ session: null, loaded: true, sessionsOn: false });
});

// Removing any one of the three guard keys shows the outgoing register's session on this render.
it.each(['store', 'register', 'generation'] as const)(
	'hides the outgoing session during a %s switch',
	async (scope) => {
		const renders: ReturnType<typeof useRegisterStatus>[] = [];
		const view = renderHook(() => {
			const value = useRegisterStatus();
			renders.push(value);
			return value;
		});
		await waitFor(() => expect(view.result.current.session?.id).toBe('session'));
		renders.length = 0;
		if (scope === 'store') mockStoreSession.storeDB = {};
		if (scope === 'register') mockBinding.registerId = 'other';
		if (scope === 'generation') mockGeneration = {};
		view.rerender();
		expect(renders[0].session).toBeNull();
		expect(renders[0].loaded).toBe(false);
		view.unmount();
	}
);

it('is overdue for an open session past the store’s close time', async () => {
	mockCloseTime = '00:01';
	const { result } = renderHook(() => useRegisterStatus());
	await waitFor(() => expect(result.current.session?.id).toBe('session'));
	expect(result.current.overdue).toBe(true);
	active = [{ ...session, status: 'counting' }];
	mockSessionChanges.next();
	await waitFor(() => expect(result.current.session?.status).toBe('counting'));
	expect(result.current.overdue).toBe(false);
});
