/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { getLogger, isErrorReported } from '@wcpos/utils/logger';

import { useLoginHandler } from './use-login-handler';

const mockInsert = jest.fn();

jest.mock('expo-router', () => ({ router: { canGoBack: () => false, back: jest.fn() } }));
jest.mock('@wcpos/database', () => ({ sanitizeWPCredentialsData: (data: unknown) => data }));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		userDB: {
			wp_credentials: {
				findOne: () => ({ exec: async () => null }),
				insert: (...args: unknown[]) => mockInsert(...args),
			},
		},
	}),
}));
jest.mock('../../../utils/site-writes', () => ({
	linkCredentialsToSite: jest.fn(async () => true),
}));

const site = { name: 'Store' } as never;
const logger = getLogger([]) as unknown as Record<'error' | 'warn', jest.Mock>;
const params = {
	access_token: 'a',
	refresh_token: 'r',
	uuid: 'u-1',
	id: '7',
	display_name: 'Ada',
	expires_at: 1,
};

describe('useLoginHandler', () => {
	beforeEach(() => jest.clearAllMocks());

	it('reports an invalid login response once and rethrows it, so no caller says "Session renewed"', async () => {
		const { result } = renderHook(() => useLoginHandler(site));

		let thrown: unknown;
		await act(async () => {
			await result.current
				.handleLoginSuccess({ params: { ...params, access_token: '' } })
				.catch((error: unknown) => {
					thrown = error;
				});
		});

		// One toast: AUTH999 for the missing parameters — not a second SYNC101 "do not
		// clear local data" for the same failure.
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			'Invalid login response - missing required parameters',
			expect.objectContaining({ code: 'AUTH999', showToast: true })
		);
		expect(thrown).toBeInstanceOf(Error);
		expect(isErrorReported(thrown)).toBe(true);
	});

	it('reports a failed credential write once as SYNC101 and rethrows it marked', async () => {
		mockInsert.mockRejectedValueOnce(new Error('disk full'));
		const { result } = renderHook(() => useLoginHandler(site));

		let thrown: unknown;
		await act(async () => {
			await result.current.handleLoginSuccess({ params }).catch((error: unknown) => {
				thrown = error;
			});
		});

		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			'Failed to save WordPress credentials: disk full',
			expect.objectContaining({ code: 'SYNC101', showToast: true })
		);
		expect(isErrorReported(thrown)).toBe(true);
	});
});
