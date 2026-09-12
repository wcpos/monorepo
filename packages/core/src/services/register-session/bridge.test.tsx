/** @jest-environment jsdom */
import * as React from 'react';

import { act, render, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

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
