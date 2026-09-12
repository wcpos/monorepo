/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, renderHook, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

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

const drain = jest.mocked(drainRegisterSessionQueue);
const refresh = jest.mocked(refreshSessions);

beforeEach(() => {
	jest.useFakeTimers();
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

it('never recovers imported closed history, but retains pending local closures and counting', () => {
	const closed = { id: 'history', closure_id: 'history', status: 'closed', sync_status: 'synced' };
	const data = {
		sessions,
		registerId: 'register',
		active: [] as unknown[],
		closed: [closed],
		entries: [],
		orders: { hits: [] },
		closureRows: [] as unknown[],
	};
	observed = data;
	const view = renderHook(() => useRegisterSession());
	expect(view.result.current.session).toBeNull();
	data.closureRows = [{ id: 'history', session_id: 'history', sync_status: 'pending' }];
	view.rerender();
	expect(view.result.current.session?.id).toBe('history');
	data.closureRows = [{ id: 'history', session_id: 'history', sync_status: 'synced' }];
	view.rerender();
	expect(view.result.current.session).toBeNull();
	data.active = [{ id: 'counting', status: 'counting' }];
	view.rerender();
	expect(view.result.current.session?.id).toBe('counting');
});
