import {
	type APIRequestContext,
	type APIResponse,
	request as playwrightRequest,
} from '@playwright/test';

import { storeRequestOptions } from './probe-credential';
import { storeLoginAuthorization } from './search-probe';

import type { StoreRequestAuth } from './order-cleanup';

/**
 * E2E register-session cleanup: close the stale register sessions the run's cashiers left open.
 *
 * `ensureRegisterOpen` (fixtures.ts) opens a real session through the POS UI and leaves it open
 * for later runs, and nothing closed it, so every E2E sale landed on one session for hours or
 * days. The X-report the POS fetches at boot sums that session's expected figures: on 2026-11-09
 * a session open since 09:36 held ~700 sales by 15:00, the sum took 6.8 s at 150 MB peak against
 * PHP's 128 MB, and every boot's receipt request on dev-pro 5xx'd (on 11-08: ~2,500 sales, 9.6 s,
 * 206 MB, 311 5xx in six hours).
 *
 * The close goes through the plugin's own routes, in the order the app's outbox sends it
 * (`packages/query/src/register-session/queue.ts`): POST `sessions/{id}/status` `counting`, then
 * `closed` with `counted` equal to the `expected` the session detail serves (the figures the
 * X-report reads). The server re-sums `expected` when the close lands, so the variance is zero
 * unless a sale lands between the two reads; then a store with a variance threshold refuses the
 * close (logged as failed) and one without closes it with that variance.
 *
 * It runs once per run, in the shared `e2e-setup` job before any shard sells (global-setup.ts),
 * with the first shard's cashier login: that job carries `E2E_CASHIER_PASS` but no writer secret.
 * Best-effort like order-cleanup.ts: every miss is logged and swallowed, never thrown. It cannot
 * clear a session already too big to sum: both the detail read and the close sum it again.
 */

/**
 * Only a session opened at least this long ago is closed. A till has ONE open session that every
 * run shares, and only PR runs queue for the shared store, so a close can land under another run
 * still selling on it. Two hours bounds that to once per two hours and a session to roughly 250
 * E2E sales (~130 an hour on 11-09), well under the ~700 that broke the 128 MB limit.
 */
const SESSION_MIN_AGE_MS = 2 * 60 * 60 * 1000;

/** Per request: the setup job has a 20-minute budget, and a stalled store must not eat it. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface SessionResponse {
	status: number;
	body: unknown;
}

/** Routes are relative to `wp-json/`, e.g. `wcpos/v2/sessions`. */
export interface SessionTransport {
	get(route: string, params?: Record<string, string>): Promise<SessionResponse>;
	post(route: string, data: unknown): Promise<SessionResponse>;
}

interface SessionRow {
	id: string;
	register_id: string;
	status: string;
	opened_by: number | null;
	opened_at_gmt: string;
}

export interface CloseSessionsResult {
	closed: string[];
	failed: string[];
	/** Why nothing was attempted on this store, or null. */
	skipped: string | null;
}

const LOG = '[register-cleanup]';

/** A refusal of the list or user lookup means this store cannot be cleaned by this credential. */
function skipReason(route: string, response: SessionResponse): string | null {
	if (response.status === 404 && route.startsWith('wcpos/'))
		return `${route} is absent (plugin predates it)`;
	if (response.status === 401 || response.status === 403)
		return `${route} refused the cashier credential (HTTP ${response.status})`;
	return response.status >= 300 ? `${route} answered HTTP ${response.status}` : null;
}

/** `counted` is unsigned on the server; a negative expected tender (refunds over sales) counts 0. */
export function countedFromExpected(expected: Record<string, string>): Record<string, string> {
	const counted: Record<string, string> = { cash: '0' };
	for (const [tender, amount] of Object.entries(expected)) {
		counted[tender] = amount.startsWith('-') ? '0' : amount;
	}
	return counted;
}

async function ok(response: Promise<SessionResponse>, step: string): Promise<unknown> {
	const { status, body } = await response;
	if (status >= 300) throw new Error(`${step}: HTTP ${status} ${JSON.stringify(body)}`);
	return body;
}

async function closeSession(transport: SessionTransport, row: SessionRow, at: string) {
	const route = `wcpos/v2/sessions/${row.id}`;
	const detail = (await ok(transport.get(route), 'detail')) as {
		expected?: Record<string, string>;
	};
	if (!detail?.expected)
		throw new Error('detail serves no expected figures (no reports capability)');
	if (row.status === 'open')
		await ok(transport.post(`${route}/status`, { status: 'counting', at }), 'counting');
	const counted = countedFromExpected(detail.expected);
	await ok(transport.post(`${route}/status`, { status: 'closed', at, counted }), 'close');
}

/**
 * Close every open or counting session that one of `usernames` opened over `SESSION_MIN_AGE_MS`
 * ago. Sessions other people opened are never touched: the store may be shared with humans.
 */
export async function closeOpenRegisterSessions(
	transport: SessionTransport,
	usernames: readonly string[],
	now = Date.now()
): Promise<CloseSessionsResult> {
	const result: CloseSessionsResult = { closed: [], failed: [], skipped: null };
	const skip = (reason: string) => {
		result.skipped = reason;
		console.log(`${LOG} skipped: ${reason}`);
		return result;
	};
	const users = await transport.get('wp/v2/users', {
		slug: usernames.join(','),
		_fields: 'id,slug',
	});
	const usersSkip = skipReason('wp/v2/users', users);
	if (usersSkip) return skip(usersSkip);
	const openers = new Set((Array.isArray(users.body) ? users.body : []).map((user) => user?.id));
	if (openers.size === 0) return skip(`no user named ${usernames.join(', ')}`);

	// One page, newest first: E2E runs on a handful of tills, each with at most one open session.
	const rows: SessionRow[] = [];
	for (const status of ['open', 'counting']) {
		const listed = await transport.get('wcpos/v2/sessions', { status, per_page: '100' });
		const listSkip = skipReason('wcpos/v2/sessions', listed);
		if (listSkip) return skip(listSkip);
		if (Array.isArray(listed.body)) rows.push(...(listed.body as SessionRow[]));
	}
	const at = new Date(now).toISOString();
	for (const row of rows) {
		const openedAt = Date.parse(`${row.opened_at_gmt?.replace(' ', 'T')}Z`);
		if (row.status !== 'open' && row.status !== 'counting') continue;
		if (!openers.has(row.opened_by) || !(now - openedAt >= SESSION_MIN_AGE_MS)) continue;
		try {
			await closeSession(transport, row, at);
			result.closed.push(row.id);
			console.log(
				`${LOG} closed session ${row.id} (register ${row.register_id}, opened ${row.opened_at_gmt} GMT)`
			);
		} catch (error) {
			result.failed.push(row.id);
			console.warn(
				`${LOG} session ${row.id} not closed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
	return result;
}

/** The transport over a Playwright request context and a resolved store credential. */
function requestTransport(
	request: APIRequestContext,
	storeUrl: string,
	auth: StoreRequestAuth
): SessionTransport {
	const url = (route: string) => `${storeUrl.replace(/\/+$/, '')}/wp-json/${route}`;
	const answer = async (response: APIResponse) => ({
		status: response.status(),
		body: await response.json().catch(() => null),
	});
	return {
		get: async (route, params = {}) =>
			answer(
				await request.get(url(route), {
					headers: auth.headers,
					params: { ...auth.params, ...params },
				})
			),
		post: async (route, data) =>
			answer(await request.post(url(route), { headers: auth.headers, params: auth.params, data })),
	};
}

export interface StoreLogin {
	storeUrl: string;
	username: string;
	password: string;
	/** The cashiers whose sessions may be closed. */
	openers: string[];
}

/** For each store: log in as `username`, then close the stale sessions `openers` opened. */
export async function closeStaleRegisterSessions(stores: readonly StoreLogin[]): Promise<void> {
	const warn = (where: string, error: unknown) =>
		console.warn(`${LOG} ${where}: ${error instanceof Error ? error.message : String(error)}`);
	let request: APIRequestContext | null = null;
	try {
		request = await playwrightRequest.newContext({ timeout: REQUEST_TIMEOUT_MS });
		for (const { storeUrl, username, password, openers } of stores) {
			try {
				const login = await storeLoginAuthorization(
					request,
					storeUrl,
					username,
					password,
					'cashier'
				);
				await closeOpenRegisterSessions(
					requestTransport(request, storeUrl, storeRequestOptions(login)),
					openers
				);
			} catch (error) {
				warn(storeUrl, error);
			}
		}
	} catch (error) {
		warn('cleanup', error);
	} finally {
		await request?.dispose().catch(() => undefined);
	}
}
