/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

const mockHandleLoginSuccess = jest.fn(async () => undefined);
let mockAuthResponse: Record<string, unknown> | null = null;

jest.mock('../../../../contexts/translations', () => ({
	// The real English catalogue, so the assertions below name the exact sentence
	// a cashier reads — not a key, and not a copy of the string.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	useT: () => require('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../auth/hooks/use-login-handler', () => ({
	useLoginHandler: () => ({ handleLoginSuccess: mockHandleLoginSuccess }),
}));
jest.mock('../../../../hooks/use-wcpos-auth', () => ({
	useWcposAuth: () => ({
		isReady: true,
		response: mockAuthResponse,
		promptAsync: jest.fn(async () => undefined),
	}),
}));

// eslint-disable-next-line import/first -- Jest mocks must be registered before importing the hook.
import { useAuthErrorHandler } from './auth-error-handler';

// eslint-disable-next-line import/first
import type { Site, WPCredentials } from './types';

const authLogger = getLogger(['wcpos', 'auth', 'error']) as unknown as {
	success: jest.Mock;
	warn: jest.Mock;
	info: jest.Mock;
};

const site = { name: 'Test Store', wcpos_login_url: 'https://example.com/login' } as Site;
const wpCredentials = { id: 7 } as WPCredentials;

function renderWithResponse(response: Record<string, unknown> | null) {
	mockAuthResponse = response;
	return renderHook(() => useAuthErrorHandler(site, wpCredentials));
}

/**
 * These two toasts carry no error code — a `success` and a `warn` — so the
 * logger's code-to-sentence resolution cannot reach them. An explicit
 * `toast.title` is the only thing standing between the cashier and the raw
 * developer log message, so it is asserted here as rendered English.
 */
describe('useAuthErrorHandler interactive re-authentication toasts', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('tells the cashier the session was renewed, not the developer string', async () => {
		renderWithResponse({ type: 'success', params: { access_token: 'abc', id: 7 } });

		await waitFor(() => expect(authLogger.success).toHaveBeenCalled());

		const [message, options] = authLogger.success.mock.calls[0];
		expect(message).toBe('Successfully logged in');
		expect(options.showToast).toBe(true);
		// The same noun the silent refresh path uses, so one mechanism reads as
		// one story.
		expect(options.toast.title).toBe('Session renewed');
		expect(options.code).toBeUndefined();
	});

	it.each(['dismiss', 'cancel', 'locked'])(
		'warns that the store is unreachable after a %s, naming the consequence',
		async (type) => {
			renderWithResponse({ type });

			await waitFor(() => expect(authLogger.warn).toHaveBeenCalled());

			const [, options] = authLogger.warn.mock.calls[0];
			expect(options.showToast).toBe(true);
			expect(options.toast.title).toBe('Session expired — sign in to reconnect to the store.');
			// `warn` carries no error code, and none was minted for it.
			expect(options.code).toBeUndefined();
			// `locked` is the device screen locking — nothing the cashier chose —
			// so this branch must not be reported at `info` as a mere cancellation.
			expect(authLogger.info).not.toHaveBeenCalled();
		}
	);
});
