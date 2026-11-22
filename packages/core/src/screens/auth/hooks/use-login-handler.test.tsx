/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { getLogger, isErrorReported } from '@wcpos/utils/logger';

import { useLoginHandler } from './use-login-handler';

const mockSaveLoginCredentials = jest.fn();
const mockGet = jest.fn();

jest.mock('expo-router', () => ({ router: { canGoBack: () => false, back: jest.fn() } }));
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	saveLoginCredentials: (...args: unknown[]) => mockSaveLoginCredentials(...args),
}));
jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => ({ get: mockGet }),
}));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ userDB: {} }),
}));

const site = { uuid: 's-1', name: 'Store' } as never;
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
	beforeEach(() => {
		jest.clearAllMocks();
		mockSaveLoginCredentials.mockResolvedValue({
			created: true,
			linked: true,
			credentials: { stores: [] },
		});
	});

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
		mockSaveLoginCredentials.mockRejectedValueOnce(new Error('disk full'));
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

describe('useLoginHandler: Pro version and licence from the signed-in index', () => {
	const publicLicense = { key: 'PUBLIC-KEY', status: 'active', instance: 'i-1', expires: '' };

	/** The saved site as discovery left it: the public index's Pro version and licence. */
	function savedSite() {
		const latest = {
			uuid: 's-1',
			name: 'Store',
			wp_api_url: 'https://shop.test/wp-json/',
			wcpos_version: '2.0.0',
			wcpos_pro_version: '2.0.0',
			license: publicLicense,
			deleted: false,
		};
		return { ...latest, getLatest: () => latest, incrementalPatch: jest.fn() };
	}

	async function logIn(site: ReturnType<typeof savedSite>) {
		mockSaveLoginCredentials.mockResolvedValue({
			created: true,
			linked: true,
			credentials: { stores: [] },
			site,
		});
		const { result } = renderHook(() => useLoginHandler(site as never));
		await act(async () => {
			await result.current.handleLoginSuccess({ params });
		});
		await waitFor(() => expect(mockGet).toHaveBeenCalled());
		// Let the fire-and-forget read settle before asserting on the write.
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}

	beforeEach(() => {
		jest.clearAllMocks();
		mockGet.mockReset();
	});

	it('writes the Pro version and licence the signed-in index returns onto the site', async () => {
		const signedInLicense = {
			key: 'SIGNED-IN-KEY',
			status: 'active',
			instance: 'i-2',
			expires: '',
		};
		mockGet.mockResolvedValue({
			status: 200,
			data: { name: 'Store', wcpos_pro_version: '2.0.3', license: signedInLicense },
		});
		const site = savedSite();

		await logIn(site);

		// The same index discovery reads, sent with the new cashier's token.
		expect(mockGet).toHaveBeenCalledWith(
			'https://shop.test/wp-json/wcpos/v2/site',
			expect.objectContaining({
				wcposPreamble: expect.objectContaining({ purpose: 'cashier', accessToken: 'a' }),
			})
		);
		expect(mockGet.mock.calls[0][1]).not.toHaveProperty('unauthenticated');
		expect(site.incrementalPatch).toHaveBeenCalledTimes(1);
		expect(site.incrementalPatch).toHaveBeenCalledWith({
			wcpos_pro_version: '2.0.3',
			license: signedInLicense,
		});
	});

	it('reads the REST index when the store has no wcpos/v2/site route, as discovery does', async () => {
		mockGet
			.mockRejectedValueOnce(Object.assign(new Error('Not found'), { response: { status: 404 } }))
			.mockResolvedValueOnce({ status: 200, data: { wcpos_pro_version: '2.0.3' } });
		const site = savedSite();

		await logIn(site);
		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

		expect(mockGet.mock.calls[1][0]).toBe('https://shop.test/wp-json/');
		expect(mockGet.mock.calls[1][1]).toEqual(
			expect.objectContaining({
				wcposPreamble: expect.objectContaining({ purpose: 'cashier', accessToken: 'a' }),
			})
		);
		await waitFor(() =>
			expect(site.incrementalPatch).toHaveBeenCalledWith({ wcpos_pro_version: '2.0.3' })
		);
	});

	it('keeps the public values when the signed-in index carries neither field', async () => {
		mockGet.mockResolvedValue({ status: 200, data: { name: 'Store', wcpos_version: '2.0.0' } });
		const site = savedSite();

		await logIn(site);

		expect(site.incrementalPatch).not.toHaveBeenCalled();
	});

	it('keeps the public values and logs when the signed-in read fails', async () => {
		mockGet.mockRejectedValue(new Error('Network Error'));
		const site = savedSite();

		await logIn(site);

		expect(site.incrementalPatch).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			'Could not read the Pro version and licence as the signed-in cashier',
			expect.objectContaining({ context: expect.objectContaining({ error: 'Network Error' }) })
		);
	});
});
