/**
 * @jest-environment node
 */
import {
	__resetRedirectResultForTesting,
	captureRedirectResult,
	claimRedirectResult,
	peekRedirectLoginUrl,
	saveRedirectState,
} from './redirect-result';

// Mock expo-auth-session (ESM) pulled in transitively via ./utils
jest.mock('expo-auth-session', () => ({
	makeRedirectUri: jest.fn(() => 'wcpos://callback'),
}));

const LOGIN_URL = 'https://example.com/wcpos-login';
const OTHER_LOGIN_URL = 'https://other.com/wcpos-login';
const CSRF = 'a'.repeat(64);

const TOKEN_QUERY =
	`access_token=at123&refresh_token=rt456&uuid=uuid-1&id=7&display_name=Paul` +
	`&expires_at=1755648000&state=${CSRF}`;

/**
 * Minimal browser globals for the node test environment. The module only
 * touches location/history/document.title/sessionStorage.
 */
function createSessionStorage() {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
		clear: () => store.clear(),
	};
}

function setLocation(href: string) {
	const url = new URL(href);
	(globalThis as any).window.location = {
		href,
		pathname: url.pathname,
		search: url.search,
		hash: url.hash,
	};
}

let replaceState: jest.Mock;

beforeEach(() => {
	__resetRedirectResultForTesting();
	replaceState = jest.fn();
	(globalThis as any).window = {
		location: {},
		history: { replaceState },
	};
	(globalThis as any).document = { title: 'WCPOS' };
	(globalThis as any).sessionStorage = createSessionStorage();
	setLocation('https://app.test/pos');
});

afterEach(() => {
	delete (globalThis as any).window;
	delete (globalThis as any).document;
	delete (globalThis as any).sessionStorage;
});

/** Simulate the pre-redirect save, then the post-redirect reload URL. */
function simulateRedirectReturn({
	loginUrl = LOGIN_URL,
	csrf = CSRF,
	claimKey,
	returnUrl = `https://app.test/pos?${TOKEN_QUERY}`,
}: { loginUrl?: string; csrf?: string; claimKey?: string; returnUrl?: string } = {}) {
	setLocation('https://app.test/pos?foo=bar');
	saveRedirectState(loginUrl, csrf, claimKey);
	setLocation(returnUrl);
}

describe('redirect-result', () => {
	it('delivers the token to a late-mounting consumer for the initiating site', () => {
		simulateRedirectReturn();

		// Early mounts: capture runs first (strips the URL), then consumers for
		// other/no sites try to claim — none of them may consume the result.
		captureRedirectResult();
		expect(claimRedirectResult(null)).toBeNull();
		expect(claimRedirectResult(OTHER_LOGIN_URL)).toBeNull();

		// The consumer for the initiating site mounts much later and still wins.
		const result = claimRedirectResult(LOGIN_URL);
		expect(result).toEqual(
			expect.objectContaining({
				type: 'success',
				params: expect.objectContaining({
					access_token: 'at123',
					refresh_token: 'rt456',
					uuid: 'uuid-1',
				}),
			})
		);

		// One-shot: a second consumer for the same site gets nothing.
		expect(claimRedirectResult(LOGIN_URL)).toBeNull();
	});

	it('strips the auth params from the URL and clears sessionStorage exactly once', () => {
		simulateRedirectReturn();

		captureRedirectResult();
		captureRedirectResult();

		expect(replaceState).toHaveBeenCalledTimes(1);
		// Restores the pre-redirect returnPath saved by saveRedirectState.
		expect(replaceState).toHaveBeenCalledWith({}, 'WCPOS', '/pos?foo=bar');
		expect((globalThis as any).sessionStorage.getItem('wcpos_auth_state')).toBeNull();
		expect((globalThis as any).sessionStorage.getItem('wcpos_auth_csrf_state')).toBeNull();
	});

	it('accepts a matching CSRF state (regression: state was compared against undefined)', () => {
		// The old per-hook parser read `state` off WcposAuthParams — which never
		// carries it — so a matching state still produced "State parameter
		// mismatch" whenever the saved state survived to the comparison.
		simulateRedirectReturn({ csrf: CSRF });

		const result = claimRedirectResult(LOGIN_URL);
		expect(result?.type).toBe('success');
	});

	it('rejects a CSRF state mismatch with an error result for the consumer', () => {
		simulateRedirectReturn({ csrf: 'b'.repeat(64) });

		const result = claimRedirectResult(LOGIN_URL);
		expect(result?.type).toBe('error');
		expect(result?.error).toMatch(/State parameter mismatch/);
	});

	it('rejects tokens that arrive without a saved state (login-CSRF guard)', () => {
		// No saveRedirectState — the flow did not originate from this tab (e.g. a
		// crafted link). The tokens must never be accepted; the error is handed to
		// the first site-bearing consumer so the failure is visible.
		setLocation(`https://app.test/pos?${TOKEN_QUERY}`);

		expect(claimRedirectResult(null)).toBeNull();
		const result = claimRedirectResult(OTHER_LOGIN_URL);
		expect(result?.type).toBe('error');
		expect(result?.error).toMatch(/did not originate/);
		expect(result?.params).toBeUndefined();
	});

	it('delivers only to the consumer with the initiating claimKey', () => {
		// WpUser rows mount (and claim) before AddUserButton; without the key an
		// add-user login would be swallowed by a re-auth row, which adopts the
		// returned token for active requests — cross-user attribution.
		simulateRedirectReturn({ claimKey: 'add-user' });

		expect(claimRedirectResult(LOGIN_URL, 'reauth:alice-uuid')).toBeNull();
		expect(claimRedirectResult(LOGIN_URL)).toBeNull();
		expect(claimRedirectResult(LOGIN_URL, 'add-user')?.type).toBe('success');
	});

	it('a result saved without a claimKey is not claimable by a keyed consumer', () => {
		simulateRedirectReturn();

		expect(claimRedirectResult(LOGIN_URL, 'reauth:alice-uuid')).toBeNull();
		expect(claimRedirectResult(LOGIN_URL)?.type).toBe('success');
	});

	it('peekRedirectLoginUrl reveals the initiating site without consuming', () => {
		simulateRedirectReturn();

		expect(peekRedirectLoginUrl()).toBe(LOGIN_URL);
		expect(peekRedirectLoginUrl()).toBe(LOGIN_URL);
		expect(claimRedirectResult(LOGIN_URL)?.type).toBe('success');
		expect(peekRedirectLoginUrl()).toBeNull();
	});

	it('delivers a server error response to the initiating site', () => {
		simulateRedirectReturn({
			returnUrl: 'https://app.test/pos?error=access_denied&error_description=Denied',
		});

		const result = claimRedirectResult(LOGIN_URL);
		expect(result?.type).toBe('error');
		expect(result?.error).toBe('Denied');
	});

	it('reports incomplete token returns as an error', () => {
		simulateRedirectReturn({
			returnUrl: `https://app.test/pos?access_token=at123&state=${CSRF}`,
		});

		const result = claimRedirectResult(LOGIN_URL);
		expect(result?.type).toBe('error');
		expect(result?.error).toBe('Missing required auth parameters');
	});

	it('supports tokens returned in the hash fragment', () => {
		simulateRedirectReturn({ returnUrl: `https://app.test/pos#${TOKEN_QUERY}` });

		const result = claimRedirectResult(LOGIN_URL);
		expect(result?.type).toBe('success');
	});

	it('does nothing when the URL has no auth params', () => {
		setLocation('https://app.test/pos?foo=bar');
		saveRedirectState(LOGIN_URL, CSRF);

		captureRedirectResult();
		expect(claimRedirectResult(LOGIN_URL)).toBeNull();
		expect(replaceState).not.toHaveBeenCalled();
		// Saved state stays put — the redirect may still be in flight elsewhere.
		expect((globalThis as any).sessionStorage.getItem('wcpos_auth_state')).not.toBeNull();
	});

	it('captures at most once per page load even if the URL later changes', () => {
		setLocation('https://app.test/pos');
		captureRedirectResult();

		// Tokens appearing after the first capture (impossible in a real reload,
		// but pins the once-per-load contract) are ignored.
		setLocation(`https://app.test/pos?${TOKEN_QUERY}`);
		expect(claimRedirectResult(LOGIN_URL)).toBeNull();
	});
});
