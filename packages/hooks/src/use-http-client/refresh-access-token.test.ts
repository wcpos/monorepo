import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { refreshAccessToken } from './refresh-access-token';
import { requestStateManager } from './request-state-manager';

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({
		debug: jest.fn(),
		warn: jest.fn(),
	}),
}));

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function makeConfig(
	post: jest.Mock,
	site: { wcpos_api_url?: string; wp_api_url?: string } = {
		wcpos_api_url: 'https://example.test/wp-json/wcpos/v1/',
	}
) {
	const wpUser = {
		id: 1,
		refresh_token: 'refresh-token',
		incrementalPatch: jest.fn().mockResolvedValue(undefined),
		getLatest() {
			return this;
		},
	};
	return {
		config: {
			site,
			wpUser,
			getHttpClient: () => ({ post }),
		},
		wpUser,
	};
}

describe('refreshAccessToken', () => {
	beforeEach(() => {
		requestStateManager.reset();
	});

	it('includes the POS namespace header and persists the refreshed token', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config, wpUser } = makeConfig(post);

		const token = await refreshAccessToken(config);

		expect(token).toBe('new-token');
		expect(post).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v1/auth/refresh',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
		expect(wpUser.incrementalPatch).toHaveBeenCalledWith({
			access_token: 'new-token',
			expires_at: 9999,
		});
	});

	it('returns null and marks authentication failed when refresh fails', async () => {
		const post = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));
		const { config } = makeConfig(post);

		await expect(refreshAccessToken(config)).resolves.toBeNull();

		expect(requestStateManager.checkCanProceed()).toEqual(
			expect.objectContaining({ ok: false, errorCode: ERROR_CODES.AUTH_REQUIRED })
		);
	});

	it('keeps a transient failure retryable without latching authFailed', async () => {
		const post = jest.fn().mockRejectedValue(new Error('HTTP 503: Service Unavailable'));
		const { config } = makeConfig(post);

		await expect(refreshAccessToken(config)).resolves.toBeNull();

		// A 5xx (or network) blip must not force re-authentication.
		expect(requestStateManager.isAuthFailed()).toBe(false);
	});

	it('does not attempt a refresh once authentication has terminally failed', async () => {
		const post = jest.fn();
		const { config } = makeConfig(post);
		requestStateManager.setAuthFailed(true);

		await expect(refreshAccessToken(config)).resolves.toBeNull();

		expect(post).not.toHaveBeenCalled();
	});

	it('falls back to wp_api_url when wcpos_api_url is unset', async () => {
		const post = jest.fn().mockResolvedValue({
			data: { access_token: 'new-token', expires_at: 9999 },
			status: 200,
		});
		const { config } = makeConfig(post, { wp_api_url: 'https://example.test/wp-json/' });

		await expect(refreshAccessToken(config)).resolves.toBe('new-token');
		expect(post).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v1/auth/refresh',
			{ refresh_token: 'refresh-token' },
			{ headers: { 'X-WCPOS': '1' } }
		);
	});

	it('awaits an in-flight refresh instead of posting a duplicate', async () => {
		const response = createDeferred<{
			data: { access_token: string; expires_at: number };
			status: number;
		}>();
		const post = jest.fn(() => response.promise);
		const { config, wpUser } = makeConfig(post);

		const firstRefresh = refreshAccessToken(config);
		const secondRefresh = refreshAccessToken(config);
		response.resolve({
			data: { access_token: 'shared-token', expires_at: 9999 },
			status: 200,
		});

		await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
			'shared-token',
			'shared-token',
		]);
		expect(post).toHaveBeenCalledTimes(1);
		expect(wpUser.incrementalPatch).toHaveBeenCalledTimes(1);
	});
});
