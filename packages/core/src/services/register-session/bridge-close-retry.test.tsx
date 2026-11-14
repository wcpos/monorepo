/** @jest-environment jsdom */
/**
 * #3289: a close recovery that keeps failing is retried on a bounded schedule per start, and each
 * failure reaches the error log (Sentry) with the session id; nothing is shown to the cashier.
 */
import * as React from 'react';

import { render } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { RegisterSessionBridge } from './bridge';

const mockClose = jest.fn();
jest.mock('@wcpos/query/register-session', () => {
	const { of, Subject } = jest.requireActual('rxjs');
	return {
		...jest.requireActual('@wcpos/query/register-session'),
		runRegisterSessionCycle: async () => undefined,
		observeRegisterSessionAvailability: () => of(true),
		sessionRefreshRequests: new Subject(),
		findUnwrittenCloses: async () => [{ id: 's1', counted: { cash: '96' } }],
		closeRegister: (...args: unknown[]) => mockClose(...args),
	};
});
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: {} }),
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));
jest.mock('../../contexts/app-state', () => {
	const session = () => ({
		userDB: {},
		storeDB: {},
		site: { uuid: 'site' },
		store: { id: null, register_sessions: true },
		wpCredentials: { id: 7, display_name: 'Pat' },
	});
	return { useStoreSession: session, useAppState: session };
});
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: 'online-website-available' }),
}));
jest.mock('../../screens/main/hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({}),
}));
jest.mock('../register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'register', registerName: 'Front' }),
}));
jest.mock('../../hooks/use-store-day', () => ({ useStoreDay: () => ({ timezone: 'device' }) }));

const log = jest.mocked(getLogger(['wcpos', 'registerSession']));

it('retries a failing recovery 1, 2, 5 and 10 minutes on, logs each failure, then stops', async () => {
	jest.useFakeTimers();
	mockClose.mockRejectedValue(new Error('accounting wait timed out'));
	const view = render(<RegisterSessionBridge />);
	const at = async (ms: number) => {
		await jest.advanceTimersByTimeAsync(ms);
		return mockClose.mock.calls.length;
	};
	expect(await at(0)).toBe(1);
	expect(await at(59_999)).toBe(1);
	expect(await at(1)).toBe(2);
	expect(await at(119_999)).toBe(2);
	expect(await at(1)).toBe(3);
	expect(await at(299_999)).toBe(3);
	expect(await at(1)).toBe(4);
	expect(await at(599_999)).toBe(4);
	expect(await at(1)).toBe(5);
	// The fifth failure is the last until the next start.
	expect(await at(3_600_000)).toBe(5);
	view.unmount();

	const failures = log.error.mock.calls.filter(
		([message]) => message === 'Register close recovery failed'
	);
	expect(failures.map(([, options]) => options?.context)).toEqual(
		[1, 2, 3, 4, 5].map((attempt) =>
			expect.objectContaining({
				stage: 'close-recovery',
				sessionId: 's1',
				attempt,
				message: 'accounting wait timed out',
			})
		)
	);
	expect(failures.every(([, options]) => !options?.showToast)).toBe(true);
	jest.useRealTimers();
});
