/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { getLogger } from '@wcpos/utils/logger';

import { useRegisterSession } from './use-register-session';
import { RegisterSessionBridge } from './bridge';
import { drainRegisterSessionQueue } from './queue';
import { refreshSessions } from './refresh';

const sessions = { find: () => ({ $: of([]) }) };
let observed: unknown = null;
jest.mock('observable-hooks', () => ({ useObservableState: () => observed }));
const engine = { active: () => null };
const site = { uuid: 'site' };
const userDB = {};
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine }),
	engineCollection: () => null,
	observeEngineQuery: () => of({ hits: [] }),
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../contexts/app-state', () => ({
	useStoreSession: () => ({
		userDB,
		site,
		store: { id: 1, register_sessions: true },
		wpCredentials: { capabilities: [] },
	}),
}));
jest.mock('../register/register-document', () => ({ readRegister: async () => ({ sites: {} }) }));
const movements = sessions;
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
jest.mock('./use-register-session-collections', () => ({
	useClosureCollection: () => sessions,
	useRegisterSessionCollection: () => sessions,
	useCashMovementCollection: () => movements,
}));
jest.mock('./queue', () => ({ drainRegisterSessionQueue: jest.fn() }));
jest.mock('./refresh', () => ({ refreshSessions: jest.fn() }));

const log = jest.mocked(getLogger(['wcpos', 'registerSession']));
const drain = jest.mocked(drainRegisterSessionQueue);
const refresh = jest.mocked(refreshSessions);

beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	drain.mockReset().mockResolvedValue(undefined);
	refresh.mockReset().mockResolvedValue(undefined);
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
	expect(log.debug).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({
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

	// Still broken a cycle later: this is the row that fires every minute today with nothing in it.
	expect(log.warn).toHaveBeenCalledWith(
		expect.any(String),
		expect.objectContaining({
			context: expect.objectContaining({ stage: 'refresh', status: 401, consecutiveFailures: 2 }),
		})
	);
});

it('distinguishes a drain failure from a refresh failure', async () => {
	drain.mockRejectedValue(Object.assign(new Error('Storage is full'), {}));
	render(<RegisterSessionBridge />);

	await waitFor(() => expect(log.debug).toHaveBeenCalledTimes(1));
	expect(refresh).not.toHaveBeenCalled();
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
		sessions,
		registerId: 'register',
		active: [] as unknown[],
		closed: [closed] as unknown[],
		entries: [],
		orders: { hits: [] },
		closureRows: [] as unknown[],
	};
	observed = data;
	const view = renderHook(() => useRegisterSession());
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
