/**
 * @jest-environment jsdom
 *
 * Wiring-level regression test for the redirect-return fallback (#see PR):
 * on the reload after the fallback redirect, early useWcposAuth mounts strip
 * the auth params from the URL, but the consumer for the initiating site
 * (AddUserButton) mounts later — after the Sites screen's Suspense resolves —
 * and must still receive the parsed result.
 */
import { act, renderHook } from '@testing-library/react';

import { useWcposAuth } from './index.web';
import { __resetRedirectResultForTesting, saveRedirectState } from './redirect-result';
import { buildAuthUrl } from './utils';

/** expo's own popup request state for the login attempt */
const EXPO_STATE = 'Expo1234AB';
const mockRequest = { state: EXPO_STATE };
const mockPrompt = jest.fn();

jest.mock('expo-auth-session', () => ({
	makeRedirectUri: jest.fn(() => 'http://localhost/'),
	ResponseType: { Token: 'token' },
	// request with a fixed state / no live response / controllable prompt
	useAuthRequest: jest.fn(() => [mockRequest, null, mockPrompt]),
}));

// Real helpers; buildAuthUrl is spied on to read the fallback's navigation URL
// (jsdom cannot navigate, so window.location.href never takes it).
jest.mock('./utils', () => {
	const actual = jest.requireActual('./utils');
	return { ...actual, buildAuthUrl: jest.fn(actual.buildAuthUrl) };
});

jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: { platform: 'web', version: '0.0.0', buildNumber: '0' },
}));

const LOGIN_URL = 'https://example.com/wcpos-login';
const CSRF = 'c'.repeat(64);

function setUrl(pathAndQuery: string) {
	window.history.replaceState({}, '', pathAndQuery);
}

function simulateRedirectReturn(csrf: string = CSRF, claimKey?: string) {
	setUrl('/pos');
	saveRedirectState(LOGIN_URL, csrf, claimKey);
	setUrl(
		`/pos?access_token=at123&refresh_token=rt456&uuid=uuid-1&id=7` +
			`&display_name=Paul&expires_at=1755648000&state=${CSRF}`
	);
}

const siteFor = (loginUrl: string) => ({ wcpos_login_url: loginUrl, name: 'Test' });

beforeEach(() => {
	__resetRedirectResultForTesting();
	sessionStorage.clear();
	setUrl('/pos');
	mockPrompt.mockReset();
	(buildAuthUrl as jest.Mock).mockClear();
});

const savedCsrf = () => sessionStorage.getItem('wcpos_auth_csrf_state');
const savedRouting = () => JSON.parse(sessionStorage.getItem('wcpos_auth_state') ?? 'null');

describe('useWcposAuth (web) one login state per attempt (POS-317, POS-301)', () => {
	it('saves the request state and routing before the popup opens', async () => {
		let atPrompt: { csrf: string | null; routing: unknown } | null = null;
		mockPrompt.mockImplementation(async () => {
			atPrompt = { csrf: savedCsrf(), routing: savedRouting() };
			return { type: 'success', params: {} };
		});

		const { result } = renderHook(() =>
			useWcposAuth({ site: siteFor(LOGIN_URL), claimKey: 'add-user' })
		);
		await act(async () => {
			await result.current.promptAsync();
		});

		expect(mockPrompt).toHaveBeenCalledTimes(1);
		expect(atPrompt).toEqual({
			csrf: EXPO_STATE,
			routing: { returnPath: '/pos', loginUrl: LOGIN_URL, claimKey: 'add-user' },
		});
	});

	it('a dismissed popup falls back to a redirect carrying the same request state', async () => {
		mockPrompt.mockResolvedValue({ type: 'dismiss' });
		// jsdom reports the unimplemented cross-document navigation on console.error.
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

		const { result } = renderHook(() => useWcposAuth({ site: siteFor(LOGIN_URL) }));
		await act(async () => {
			await result.current.promptAsync();
		});
		consoleError.mockRestore();

		const { results } = (buildAuthUrl as jest.Mock).mock;
		expect(results).toHaveLength(1);
		const navigated = results[0].value as string;
		expect(new URL(navigated).searchParams.get('state')).toBe(EXPO_STATE);
		expect(savedCsrf()).toBe(EXPO_STATE);
	});

	it('a crossed return in the still-open popup is accepted for the initiating consumer', () => {
		// The poll wrongly reports the popup closed while it is still alive.
		mockPrompt.mockImplementation(() => new Promise(() => {}));
		const opener = renderHook(() =>
			useWcposAuth({ site: siteFor(LOGIN_URL), claimKey: 'add-user' })
		);
		act(() => {
			void opener.result.current.promptAsync();
		});
		expect(mockPrompt).toHaveBeenCalledTimes(1);
		opener.unmount();

		// The popup boots the app (a fresh page load) holding the sessionStorage
		// copy it got at window.open, and lands with expo's state.
		__resetRedirectResultForTesting();
		setUrl(
			`/pos?access_token=at123&refresh_token=rt456&uuid=uuid-1&id=7` +
				`&display_name=Paul&expires_at=1755648000&state=${EXPO_STATE}`
		);

		const reauthRow = renderHook(() =>
			useWcposAuth({ site: siteFor(LOGIN_URL), claimKey: 'reauth:alice-uuid' })
		);
		expect(reauthRow.result.current.response).toBeNull();

		const consumer = renderHook(() =>
			useWcposAuth({ site: siteFor(LOGIN_URL), claimKey: 'add-user' })
		);
		expect(consumer.result.current.response).toEqual(
			expect.objectContaining({
				type: 'success',
				params: expect.objectContaining({ access_token: 'at123', uuid: 'uuid-1' }),
			})
		);
	});
});

describe('useWcposAuth (web) redirect-return delivery', () => {
	it('delivers the token to the initiating site consumer that mounts after early instances', () => {
		simulateRedirectReturn();

		// Early mounts (e.g. DemoButton with no site yet) strip the URL…
		const early = renderHook(() => useWcposAuth({ site: null }));
		expect(early.result.current.response).toBeNull();
		expect(window.location.search).toBe('');

		// …but the consumer for the initiating site, mounting later against the
		// already-clean URL, still receives the result.
		const consumer = renderHook(() => useWcposAuth({ site: siteFor(LOGIN_URL) }));
		expect(consumer.result.current.response).toEqual(
			expect.objectContaining({
				type: 'success',
				params: expect.objectContaining({ access_token: 'at123', uuid: 'uuid-1' }),
			})
		);

		// One-shot: a second consumer for the same site must not double-process.
		const duplicate = renderHook(() => useWcposAuth({ site: siteFor(LOGIN_URL) }));
		expect(duplicate.result.current.response).toBeNull();
	});

	it('does not hand the result to a consumer for a different site', () => {
		simulateRedirectReturn();

		const otherSite = renderHook(() =>
			useWcposAuth({ site: siteFor('https://other.com/wcpos-login') })
		);
		expect(otherSite.result.current.response).toBeNull();

		const consumer = renderHook(() => useWcposAuth({ site: siteFor(LOGIN_URL) }));
		expect(consumer.result.current.response?.type).toBe('success');
	});

	it('surfaces a CSRF mismatch as an error on the initiating site consumer', () => {
		simulateRedirectReturn('d'.repeat(64));

		const consumer = renderHook(() => useWcposAuth({ site: siteFor(LOGIN_URL) }));
		expect(consumer.result.current.response?.type).toBe('error');
		expect(consumer.result.current.response?.error).toMatch(/State parameter mismatch/);
	});

	it('routes an add-user login past earlier-mounting re-auth consumers', () => {
		// On a site with existing users, WpUser rows mount (and would claim)
		// before AddUserButton. The claimKey keeps the add-user result out of the
		// re-auth rows, which adopt the returned token for active requests.
		simulateRedirectReturn(CSRF, 'add-user');

		const reauthRow = renderHook(() =>
			useWcposAuth({ site: siteFor(LOGIN_URL), claimKey: 'reauth:alice-uuid' })
		);
		expect(reauthRow.result.current.response).toBeNull();

		const addUser = renderHook(() =>
			useWcposAuth({ site: siteFor(LOGIN_URL), claimKey: 'add-user' })
		);
		expect(addUser.result.current.response?.type).toBe('success');
	});

	it('returns no response when the URL has no auth params', () => {
		const consumer = renderHook(() => useWcposAuth({ site: siteFor(LOGIN_URL) }));
		expect(consumer.result.current.response).toBeNull();
	});
});
