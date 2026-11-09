import { expect, test } from './test';
import {
	closeOpenRegisterSessions,
	countedFromExpected,
	type SessionResponse,
	type SessionTransport,
} from './register-session-cleanup';

/**
 * Unit tests for the register-session teardown over a mocked transport. These touch no
 * store; they run standalone under every project, like order-cleanup.spec.ts.
 */

const NOW = Date.parse('2026-11-09T15:00:00Z');
const CASHIER_ID = 7;
const STALE = '2026-11-09 09:36:00';
const FRESH = '2026-11-09 14:30:00';

type Call = { method: 'GET' | 'POST'; route: string; body?: unknown };

function session(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		register_id: `reg-${id}`,
		status: 'open',
		opened_by: CASHIER_ID,
		opened_at_gmt: STALE,
		...overrides,
	};
}

/** A store with the given sessions; `respond` overrides any route's answer. */
function mockStore(
	sessions: ReturnType<typeof session>[],
	respond: (call: Call) => SessionResponse | undefined = () => undefined
) {
	const calls: Call[] = [];
	const answer = (call: Call): SessionResponse => {
		calls.push(call);
		const override = respond(call);
		if (override) return override;
		if (call.route === 'wp/v2/users')
			return { status: 200, body: [{ id: CASHIER_ID, slug: 'e2e-cashier-1' }] };
		if (call.route.endsWith('/status')) return { status: 200, body: {} };
		if (call.route.startsWith('wcpos/v2/sessions/'))
			return { status: 200, body: { expected: { cash: '412.5000', card: '88.0000' } } };
		return { status: 404, body: { code: 'rest_no_route' } };
	};
	const transport: SessionTransport = {
		get: async (route, params) => {
			if (route === 'wcpos/v2/sessions') {
				calls.push({ method: 'GET', route, body: params });
				const override = respond({ method: 'GET', route, body: params });
				if (override) return override;
				return { status: 200, body: sessions.filter((row) => row.status === params?.status) };
			}
			return answer({ method: 'GET', route, body: params });
		},
		post: async (route, body) => answer({ method: 'POST', route, body }),
	};
	return { transport, calls, posts: () => calls.filter((call) => call.method === 'POST') };
}

test.describe('register-session-cleanup', () => {
	test('closes each open session with counted equal to expected, through counting', async () => {
		const store = mockStore([session('a'), session('b')]);
		const result = await closeOpenRegisterSessions(store.transport, ['e2e-cashier-1'], NOW);
		expect(result).toEqual({ closed: ['a', 'b'], failed: [], skipped: null });
		const at = new Date(NOW).toISOString();
		const counted = { cash: '412.5000', card: '88.0000' };
		expect(store.posts()).toEqual([
			{ method: 'POST', route: 'wcpos/v2/sessions/a/status', body: { status: 'counting', at } },
			{
				method: 'POST',
				route: 'wcpos/v2/sessions/a/status',
				body: { status: 'closed', at, counted },
			},
			{ method: 'POST', route: 'wcpos/v2/sessions/b/status', body: { status: 'counting', at } },
			{
				method: 'POST',
				route: 'wcpos/v2/sessions/b/status',
				body: { status: 'closed', at, counted },
			},
		]);
	});

	test('a session already counting goes straight to closed', async () => {
		const store = mockStore([session('c', { status: 'counting' })]);
		const result = await closeOpenRegisterSessions(store.transport, ['e2e-cashier-1'], NOW);
		expect(result.closed).toEqual(['c']);
		expect(store.posts().map((call) => (call.body as { status: string }).status)).toEqual([
			'closed',
		]);
	});

	test('leaves closed, fresh and other people’s sessions alone', async () => {
		const store = mockStore([], (call) =>
			call.route === 'wcpos/v2/sessions' && (call.body as { status: string }).status === 'open'
				? {
						status: 200,
						body: [
							session('closed', { status: 'closed' }),
							session('fresh', { opened_at_gmt: FRESH }),
							session('human', { opened_by: 1 }),
						],
					}
				: undefined
		);
		const result = await closeOpenRegisterSessions(store.transport, ['e2e-cashier-1'], NOW);
		expect(result).toEqual({ closed: [], failed: [], skipped: null });
		expect(store.posts()).toEqual([]);
	});

	test('a 404 sessions route (older plugin) is skipped with the reason', async () => {
		const store = mockStore([], (call) =>
			call.route === 'wcpos/v2/sessions'
				? { status: 404, body: { code: 'rest_no_route' } }
				: undefined
		);
		const result = await closeOpenRegisterSessions(store.transport, ['e2e-cashier-1'], NOW);
		expect(result.skipped).toBe('wcpos/v2/sessions is absent (plugin predates it)');
		expect(store.posts()).toEqual([]);
	});

	test('a credential refused by the route is skipped with the reason', async () => {
		const store = mockStore([session('a')], (call) =>
			call.route === 'wcpos/v2/sessions'
				? { status: 403, body: { code: 'rest_forbidden' } }
				: undefined
		);
		const result = await closeOpenRegisterSessions(store.transport, ['e2e-cashier-1'], NOW);
		expect(result.skipped).toBe('wcpos/v2/sessions refused the cashier credential (HTTP 403)');
		expect(store.posts()).toEqual([]);
	});

	test('a failure on one session does not stop the next', async () => {
		const store = mockStore([session('bad'), session('good')], (call) =>
			call.route === 'wcpos/v2/sessions/bad' ? { status: 500, body: { code: 'oom' } } : undefined
		);
		const result = await closeOpenRegisterSessions(store.transport, ['e2e-cashier-1'], NOW);
		expect(result).toEqual({ closed: ['good'], failed: ['bad'], skipped: null });
		expect(store.posts().every((call) => call.route === 'wcpos/v2/sessions/good/status')).toBe(
			true
		);
	});

	test('a refused close counts as failed', async () => {
		const store = mockStore([session('a')], (call) =>
			call.method === 'POST' && (call.body as { status: string }).status === 'closed'
				? { status: 403, body: { code: 'wcpos_override_refused' } }
				: undefined
		);
		const result = await closeOpenRegisterSessions(store.transport, ['e2e-cashier-1'], NOW);
		expect(result).toEqual({ closed: [], failed: ['a'], skipped: null });
	});

	test('countedFromExpected keeps cash and counts a negative tender as zero', () => {
		expect(countedFromExpected({ cash: '10.0000', card: '-5.0000' })).toEqual({
			cash: '10.0000',
			card: '0',
		});
		expect(countedFromExpected({ card: '3.0000' })).toEqual({ cash: '0', card: '3.0000' });
		expect(countedFromExpected({ cash: '-2.0000' })).toEqual({ cash: '0' });
	});
});
