/**
 * @jest-environment jsdom
 *
 * Wiring-level regression test for the redirect-return fallback (#see PR):
 * on the reload after the fallback redirect, early useWcposAuth mounts strip
 * the auth params from the URL, but the consumer for the initiating site
 * (AddUserButton) mounts later — after the Sites screen's Suspense resolves —
 * and must still receive the parsed result.
 */
import { renderHook } from '@testing-library/react';

import { useWcposAuth } from './index.web';
import { __resetRedirectResultForTesting, saveRedirectState } from './redirect-result';

jest.mock('expo-auth-session', () => ({
	makeRedirectUri: jest.fn(() => 'http://localhost/'),
	ResponseType: { Token: 'token' },
	// request truthy / no live response / prompt unused in these tests
	useAuthRequest: jest.fn(() => [{}, null, jest.fn()]),
}));

jest.mock('@wcpos/utils/app-info', () => ({
	AppInfo: { platform: 'web', version: '0.0.0', buildNumber: '0' },
}));

const LOGIN_URL = 'https://example.com/wcpos-login';
const CSRF = 'c'.repeat(64);

function setUrl(pathAndQuery: string) {
	window.history.replaceState({}, '', pathAndQuery);
}

function simulateRedirectReturn(csrf: string = CSRF) {
	setUrl('/pos');
	saveRedirectState(LOGIN_URL, csrf);
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

	it('returns no response when the URL has no auth params', () => {
		const consumer = renderHook(() => useWcposAuth({ site: siteFor(LOGIN_URL) }));
		expect(consumer.result.current.response).toBeNull();
	});
});
