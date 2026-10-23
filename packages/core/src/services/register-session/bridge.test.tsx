/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, renderHook, waitFor } from '@testing-library/react';
import { of, Subject } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';
import { refreshSessions } from '@wcpos/query/register-session';

import { useRegisterSession } from './use-register-session';
import { RegisterSessionBridge } from './bridge';
import { sameStore } from '../../../../query/src/register-session/cycle';
import { drainRegisterSessionQueue } from '../../../../query/src/register-session/queue';

const sessions = {
	find: () => ({ $: of([]) }),
	findOne: () => ({ exec: async () => ({ id: 'session' }) }),
};
let observed: unknown = null;
let registerDoc: unknown = { sites: {} };
let storeId: number | null = 1;
const closure = jest.fn();
jest.mock('observable-hooks', () => ({ useObservableState: () => observed }));
const engine = { active: () => null };
const site = { uuid: 'site' };
const userDB = {};
const storeDB = {
	collections: { register_sessions: sessions, cash_movements: sessions, closures: sessions },
};
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine }),
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../contexts/app-state', () => {
	const session = () => ({
		userDB,
		storeDB,
		site,
		store: { id: storeId, register_sessions: true },
		wpCredentials: { capabilities: [] },
	});
	return { useStoreSession: session, useAppState: session };
});
const http = {};

jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => http,
}));
jest.mock('../register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'register' }),
}));
const mockRefreshRequests = new Subject<unknown>();
jest.mock('@wcpos/query/register-session', () => ({
	...jest.requireActual('@wcpos/query/register-session'),
	observeSessionAccounting: () => ({ stream: of({ orders: { hits: [] } }) }),
	get sessionRefreshRequests() {
		return mockRefreshRequests;
	},
}));

jest.mock('../../../../query/src/register-session/register-document', () => ({
	...jest.requireActual('../../../../query/src/register-session/register-document'),
	readRegister: async () => registerDoc,
}));
jest.mock('../../../../query/src/register-session/session-store', () => ({
	...jest.requireActual('../../../../query/src/register-session/session-store'),
	writeClosure: (...args: unknown[]) => closure(...args),
}));
jest.mock('../../../../query/src/register-session/queue', () => ({
	...jest.requireActual('../../../../query/src/register-session/queue'),
	drainRegisterSessionQueue: jest.fn(),
}));
jest.mock('../../../../query/src/register-session/refresh', () => ({ refreshSessions: jest.fn() }));

const log = jest.mocked(getLogger(['wcpos', 'registerSession']));
const drain = jest.mocked(drainRegisterSessionQueue);
const refresh = jest.mocked(refreshSessions);

beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	drain.mockReset().mockResolvedValue(undefined);
	refresh.mockReset().mockResolvedValue(undefined);
	closure.mockReset().mockResolvedValue(undefined);
	registerDoc = { sites: {} };
	storeId = 1;
});

const reservationFor = (store_id: number | null) => ({
	sites: {
		site: {
			registers: {
				register: {
					closure_reservation: {
						applied: false,
						row: { store_id, session_id: 'session', counted: { cash: '10' } },
					},
				},
			},
		},
	},
});

it.each([
	['NULL, as the server returns it for an unassigned register', null],
	['0, as the local draft wrote it', 0],
])(
	'recovers an interrupted close on the single store whose reservation carries %s',
	async (_, store_id) => {
		storeId = 0;
		registerDoc = reservationFor(store_id);
		render(<RegisterSessionBridge />);

		await waitFor(() => expect(closure).toHaveBeenCalledTimes(1));
		expect(closure.mock.calls[0][0]).toMatchObject({ session: { id: 'session' }, counted: '10' });
	}
);

it('leaves a reservation that belongs to another store alone', async () => {
	storeId = 2;
	registerDoc = reservationFor(3);
	render(<RegisterSessionBridge />);

	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	expect(closure).not.toHaveBeenCalled();
});

it.each([
	[null, 0, true],
	[0, null, true],
	[undefined, 0, true],
	[null, null, true],
	[2, 2, true],
	[null, 2, false],
	[2, 0, false],
	[2, 3, false],
])('sameStore(%p, %p) is %p', (a, b, expected) => {
	expect(sameStore(a, b)).toBe(expected);
});

afterEach(() => {
	jest.useRealTimers();
});

it('refreshes shared register state after every periodic drain', async () => {
	render(<RegisterSessionBridge />);
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

	await act(async () => {
		jest.advanceTimersByTime(60_000);
		await Promise.resolve();
	});

	expect(drain).toHaveBeenCalledTimes(2);
	expect(refresh).toHaveBeenCalledTimes(2);
});

it('names the failing stage and the rejection, and only escalates once it persists', async () => {
	refresh.mockRejectedValue(
		Object.assign(new Error('Request failed'), {
			response: { status: 401, data: { code: 'jwt_auth_invalid_token' } },
		})
	);
	render(<RegisterSessionBridge />);

	// One 60-second cycle is a blip; the rubric keeps a single transient failure forensic.
	await waitFor(() => expect(log.debug).toHaveBeenCalledTimes(1));
	expect(log.warn).not.toHaveBeenCalled();
	expect(log.debug.mock.calls[0][1]).not.toHaveProperty('actor');
	expect(log.debug).toHaveBeenCalledWith(
		'Register session refresh/drain failed',
		expect.objectContaining({
			context: expect.objectContaining({
				type: 'register.session-refresh-failed',
				registerId: 'register',
				stage: 'refresh',
				status: 401,
				errorCode: 'jwt_auth_invalid_token',
				message: 'Request failed',
			}),
		})
	);

	await act(async () => {
		jest.advanceTimersByTime(60_000);
		await Promise.resolve();
	});

	expect(log.warn.mock.calls[0][1]).not.toHaveProperty('actor');
	// Still broken a cycle later: this is the row that fires every minute today with nothing in it.
	expect(log.warn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({
				type: 'register.session-refresh-failed',
				stage: 'refresh',
				status: 401,
				consecutiveFailures: 2,
			}),
		})
	);
});

it('distinguishes a drain failure from a refresh failure', async () => {
	drain.mockRejectedValue(Object.assign(new Error('Storage is full'), {}));
	render(<RegisterSessionBridge />);

	await waitFor(() => expect(log.debug).toHaveBeenCalledTimes(1));
	expect(refresh).not.toHaveBeenCalled();
	expect(log.debug.mock.calls[0][1]?.context).not.toHaveProperty('type');
	expect(log.debug).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({ stage: 'drain', message: 'Storage is full' }),
		})
	);
});

it('forgets the failure streak once a cycle succeeds', async () => {
	refresh.mockRejectedValueOnce(new Error('Request failed'));
	render(<RegisterSessionBridge />);
	await waitFor(() => expect(log.debug).toHaveBeenCalledTimes(1));

	await act(async () => {
		jest.advanceTimersByTime(60_000);
		await Promise.resolve();
	});
	refresh.mockRejectedValueOnce(new Error('Request failed'));
	await act(async () => {
		jest.advanceTimersByTime(60_000);
		await Promise.resolve();
	});

	expect(log.warn).not.toHaveBeenCalled();
	expect(log.debug).toHaveBeenCalledTimes(2);
});

it('recovers only an interrupted local close; imported history and written closures are never current', () => {
	const closed = { id: 'history', closure_id: 'history', status: 'closed', sync_status: 'synced' };
	const data = {
		storeDB,
		isCurrent: () => true,
		registerId: 'register',
		active: [] as unknown[],
		closed: [closed] as unknown[],
		entries: [],
		orders: { hits: [] },
		closureRows: [] as unknown[],
		refundRecords: [],
	};
	observed = data;
	const view = renderHook(() => useRegisterSession());
	// An older emission without refund records must also remain usable.
	observed = { ...data, refundRecords: undefined };
	view.rerender();
	observed = data;
	// Imported closed history: synced, no local closure row.
	expect(view.result.current.session).toBeNull();
	// A close this till made whose closure write was interrupted: pending, no closure row.
	const interrupted = { id: 'mine', closure_id: 'mine', status: 'closed', sync_status: 'pending' };
	data.closed = [closed, interrupted];
	view.rerender();
	expect(view.result.current.session?.id).toBe('mine');
	// Once the closure row exists the closed session is history, whatever its sync state.
	data.closureRows = [{ id: 'mine', session_id: 'mine', sync_status: 'pending' }];
	view.rerender();
	expect(view.result.current.session).toBeNull();
	data.active = [{ id: 'counting', status: 'counting' }];
	view.rerender();
	expect(view.result.current.session?.id).toBe('counting');
});

it('debounces snapshot refresh requests through the existing bridge cycle', async () => {
	render(<RegisterSessionBridge />);
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	await act(async () => {
		mockRefreshRequests.next({ storeDB, registerId: 'register' });
		mockRefreshRequests.next({ storeDB, registerId: 'register' });
		await jest.advanceTimersByTimeAsync(500);
	});
	expect(refresh).toHaveBeenCalledTimes(2);
});

it('coalesces mid-cycle invalidations without overlapping or overwriting the later snapshot', async () => {
	const finish: (() => void)[] = [];
	let snapshot = 0;
	let active = 0;
	let peak = 0;
	refresh.mockImplementation(() => {
		const version = refresh.mock.calls.length;
		peak = Math.max(peak, ++active);
		return new Promise<void>((resolve) =>
			finish.push(() => {
				snapshot = version;
				active--;
				resolve();
			})
		);
	});
	render(<RegisterSessionBridge />);
	await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
	for (let i = 0; i < 2; i++) {
		await act(async () => {
			mockRefreshRequests.next({ storeDB, registerId: 'register' });
			await jest.advanceTimersByTimeAsync(250);
		});
	}
	expect(refresh).toHaveBeenCalledTimes(1);
	await act(async () => finish[0]());
	expect(refresh).toHaveBeenCalledTimes(2);
	expect(snapshot).toBe(1);
	await act(async () => finish[1]());
	expect(peak).toBe(1);
	expect(snapshot).toBe(2);
	expect(refresh).toHaveBeenCalledTimes(2);
});
