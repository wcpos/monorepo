/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';

import { RegisterSessionBridge } from './bridge';
import { drainRegisterSessionQueue } from './queue';
import { refreshSessions } from './refresh';

const sessions = {};
const movements = {};
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
