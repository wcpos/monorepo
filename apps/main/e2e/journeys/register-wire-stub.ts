/**
 * The register wire for J1 (roadmap#539): `registerSessionsOn` turns sessions on for a real
 * store, `stubRegisterWire` also answers the register routes in memory. Built from the stubs in
 * `register-session.spec.ts` and `register-closure.spec.ts`.
 */
import { randomUUID } from 'node:crypto';

import { getStoreUrl, hydrateAuthenticatedPage } from '../fixtures';

import type { Page, Route, TestInfo } from '@playwright/test';

type Row = Record<string, unknown>;

/** The request bodies the app pushed, in order: what a spec asserts after the walk. */
export interface RegisterWrites {
	sessions: Row[];
	statuses: Row[];
	movements: Row[];
	closures: Row[];
}

const REGISTER_ROUTES = /\/wcpos\/v2\/(cashier\/|registers|sessions|movements|closures)/;

/** The REST route of a request, sent as `?rest_route=` or as a pathname. */
export function wirePath(url: URL): string {
	return url.searchParams.get('rest_route') ?? url.pathname;
}

/** The server's `opened_at_gmt` form: `YYYY-MM-DD HH:MM:SS`, UTC, no zone, no fraction. */
const serverGmt = (iso: unknown) =>
	new Date(String(iso)).toISOString().slice(0, 19).replace('T', ' ');

/** Four-decimal minor units, the app's own precision for register money. */
const minor = (amount: unknown) => Math.round(Number(amount ?? 0) * 10_000);

async function flagCashier(route: Route, extra: Row = {}) {
	const response = await route.fetch();
	// A transient non-2xx (token refresh, rate limit) is the app's problem to retry,
	// not a spec failure: pass it through untouched.
	if (!response.ok()) return route.fulfill({ response });
	const body = await response.json();
	body.stores = body.stores.map((store: Row) => ({ ...store, register_sessions: true, ...extra }));
	return route.fulfill({ response, json: body });
}

/** Sessions on for every store row; everything else reaches the real server. */
export async function registerSessionsOn(page: Page, testInfo: TestInfo): Promise<void> {
	const origin = new URL(getStoreUrl(testInfo)).origin;
	await hydrateAuthenticatedPage(page, testInfo, {
		waitForCatalogue: false,
		beforeBoot: async () => {
			await page.route('**/*', async (route) => {
				const url = new URL(route.request().url());
				if (url.origin !== origin || !wirePath(url).includes('/wcpos/v2/cashier/'))
					return route.fallback();
				return flagCashier(route);
			});
		},
	});
}

/**
 * Sessions on, and the register, session, movement and closure routes answered in memory for a
 * fresh register, so no real till or cash ledger is changed. Returns the writes as they land.
 */
export async function stubRegisterWire(page: Page, testInfo: TestInfo): Promise<RegisterWrites> {
	const origin = new URL(getStoreUrl(testInfo)).origin;
	const registerId = randomUUID();
	const writes: RegisterWrites = { sessions: [], statuses: [], movements: [], closures: [] };
	let session: Row | null = null;
	const movements: Row[] = [];
	// What the drawer holds: the float, plus pay ins, less pay outs, voided rows left out.
	const expectedCash = () => {
		const live = movements.filter((row) => !row.voids && !row.voided_by);
		const sum = live.reduce(
			(total, row) =>
				total + (row.type === 'paid_in' ? 1 : row.type === 'paid_out' ? -1 : 0) * minor(row.amount),
			minor(session?.counted_float)
		);
		return String(sum / 10_000);
	};
	await hydrateAuthenticatedPage(page, testInfo, {
		waitForCatalogue: false,
		beforeBoot: async () => {
			await page.route('**/*', async (route) => {
				const request = route.request();
				const url = new URL(request.url());
				const path = wirePath(url);
				if (url.origin !== origin || !REGISTER_ROUTES.test(path)) return route.fallback();
				const headers = {
					'access-control-allow-origin': '*',
					'access-control-allow-methods': 'GET, POST, OPTIONS',
					'access-control-allow-headers':
						request.headers()['access-control-request-headers'] ?? '*',
				};
				const post = request.method() === 'POST';
				if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
				// No close time: an Overdue pill would hang on the store's clock, not on the walk.
				if (path.includes('/cashier/')) return flagCashier(route, { expected_close_time: '' });
				if (path.endsWith('/registers'))
					return route.fulfill({
						headers,
						json: [{ id: registerId, name: 'J1 probe', status: 'active', default_float: '100' }],
					});
				if (path.includes('/registers/'))
					return route.fulfill({
						headers,
						json: {
							id: registerId,
							counters: {
								last_closure_number: 0,
								perpetual_sales_total: '0',
								perpetual_refunds_total: '0',
							},
						},
					});
				if (path.endsWith('/closures')) {
					if (!post) return route.fulfill({ headers, json: [] });
					const body = request.postDataJSON();
					writes.closures.push(body);
					// The real route's refusal of a non-ISO `opened_at` (monorepo#3251).
					if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(String(body.opened_at)))
						return route.fulfill({ status: 400, headers, json: { code: 'rest_invalid_param' } });
					const cash = expectedCash();
					const counted = (body.counted as Row | undefined)?.cash;
					return route.fulfill({
						status: 201,
						headers,
						json: {
							...body,
							print_count: 0,
							findings: {},
							expected: { cash },
							variance: { cash: String((minor(counted) - minor(cash)) / 10_000) },
						},
					});
				}
				if (path.endsWith('/movements')) {
					const body = request.postDataJSON();
					writes.movements.push(body);
					const target = movements.find((row) => row.id === body.voids);
					if (target) target.voided_by = body.id;
					movements.push({ ...body, created_at_gmt: body.created_at });
					return route.fulfill({ status: 201, headers, json: movements.at(-1) });
				}
				if (post && path.endsWith('/status')) {
					const body = request.postDataJSON();
					writes.statuses.push(body);
					session = {
						...session,
						...body,
						...(body.status === 'closed' ? { closed_at_gmt: body.at } : {}),
					};
					return route.fulfill({ status: 201, headers, json: session });
				}
				if (post) {
					const body = request.postDataJSON();
					writes.sessions.push(body);
					session = {
						...body,
						opened_at_gmt: serverGmt(body.opened_at),
						opened_by: 0,
						status: 'open',
					};
					return route.fulfill({ status: 201, headers, json: session });
				}
				return route.fulfill({
					headers,
					json: path.endsWith('/sessions')
						? session
							? [session]
							: []
						: { ...session, movements, expected: { cash: expectedCash() }, sales_count: 0 },
				});
			});
		},
	});
	return writes;
}
