/**
 * Search-walk politeness seam (spec: docs/superpowers/specs/2026-09-10-search-test-suite-design.md,
 * Phase 0). Two customer reports on 1.10.7 came from the product-search walk: the logical window
 * was capped at 100 records, so a search with more server hits than that re-walked the same two
 * pages forever, and every grid extension re-walked from page 1.
 *
 * The server is a Playwright route, not a store: it answers the two-word term with a synthetic
 * OR-superset (almost every row matches only ONE of the words, the way plugin <= 1.10.7 matched),
 * so the client's local AND read keeps the grid short while the server keeps reporting more. The
 * assertions are on the REQUEST LOG, which is what the merchant's host pays for:
 *   - no identical search request is ever repeated within the window;
 *   - the whole walk costs at most one request per wire page plus the exact-SKU leg;
 *   - clearing the box leaves at most the walk already in flight.
 * Store-agnostic by construction: the stub never depends on catalogue contents.
 */
import { expect, type Page } from '@playwright/test';

import {
	authenticatedTest,
	isRouteTeardownError,
	STORE_REQUEST,
	waitForCadenceStart,
	wcposRestRoute,
} from './fixtures';

// dev-pro carries about 2,150 refunds in the app's 92-day history window. Paging them on every
// pro boot held cadence.start or the quiet window past the 60 s budget (#3806). The walk never
// reads refunds, so an empty index is the store state this test needs. The boot cost itself is a
// product bug tracked in #3340 (search must not wait behind the refund history walk, and a second
// walk pages only what changed). This stub is allowed only while #3340 is open and carries its own
// acceptance tests; remove it when #3340 lands.
async function installEmptyRefundHistory(page: Page): Promise<void> {
	await page.route(
		(url) => /^\/wcpos\/v2\/refunds\/?$/.test(wcposRestRoute(url.toString()) ?? ''),
		async (route) => {
			try {
				const method = route.request().method();
				if (method === 'OPTIONS') {
					await route.fulfill({
						status: 204,
						headers: {
							'access-control-allow-origin': '*',
							'access-control-allow-headers': '*',
							'access-control-allow-methods': 'GET, OPTIONS',
						},
					});
					return;
				}
				if (method !== 'GET') {
					await route.fallback();
					return;
				}
				await route.fulfill({
					status: 200,
					headers: {
						'content-type': 'application/json; charset=UTF-8',
						'x-wp-total': '0',
						'x-wp-totalpages': '0',
						'access-control-allow-origin': '*',
						'access-control-expose-headers': 'X-WP-Total, X-WP-TotalPages',
					},
					body: '[]',
				});
			} catch (error) {
				if (!isRouteTeardownError(error)) throw error;
			}
		}
	);
}

const test = authenticatedTest.extend({
	page: async ({ page }, use) => {
		await installEmptyRefundHistory(page);
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook
		await use(page);
	},
});

const TERM = 'banana berry';
const SERVER_ROWS = 240;
const BOTH_WORDS_EVERY = 40;
const OBSERVE_MS = 30_000;
const AFTER_CLEAR_MS = 10_000;

interface SeenRequest {
	atMs: number;
	phase: 'typed' | 'cleared';
	kind: 'search' | 'sku';
	perPage: number;
	page: number;
}

function syntheticProduct(template: Record<string, unknown>, index: number) {
	const id = 900_000 + (SERVER_ROWS - index); // id desc, like the server's orderby=id&order=desc
	const both = index % BOTH_WORDS_EVERY === 0;
	const name = both
		? `Banana Berry probe ${id}`
		: index % 2
			? `Banana probe ${id}`
			: `Berry probe ${id}`;
	const hex = id.toString(16);
	return {
		...template,
		id,
		name,
		slug: `probe-${id}`,
		sku: `probe-${id}`,
		type: 'simple',
		status: 'publish',
		parent_id: 0,
		date_created_gmt: '2026-09-01T00:00:00',
		date_modified_gmt: '2026-09-01T00:00:00',
		permalink: `https://example.invalid/product/probe-${id}`,
		images: [],
		categories: [],
		tags: [],
		attributes: [],
		variations: [],
		meta_data: [
			{
				id: 5_000_000 + id,
				key: '_woocommerce_pos_uuid',
				value: `${hex.padStart(8, '0')}-0000-4000-8000-${hex.padStart(12, '0')}`,
			},
		],
	};
}

test.describe('Product search walk politeness', () => {
	test('a search with more server hits than the window never repeats a request and stops after release', async ({
		posPage: page,
	}, testInfo) => {
		test.setTimeout(180_000);
		const seen: SeenRequest[] = [];
		let phase: SeenRequest['phase'] = 'typed';
		let template: Record<string, unknown> | null = null;
		const startedAt = Date.now();

		const inFlight = new Map<string, number>();
		page.on('request', (r) => {
			if (STORE_REQUEST.test(r.url())) inFlight.set(r.url(), Date.now());
		});
		page.on('requestfinished', (r) => inFlight.delete(r.url()));
		page.on('requestfailed', (r) => inFlight.delete(r.url()));

		await page.route(
			(url) => {
				const route = wcposRestRoute(url.toString());
				return route !== null && /^\/wcpos\/v2\/products\/?$/.test(route);
			},
			async (route) => {
				const url = new URL(route.request().url());
				const search = url.searchParams.get('search');
				const sku = url.searchParams.get('sku');
				if (!search && !sku) return route.fallback();
				if (!template) {
					// One real row as the payload template, so the stub carries every field the
					// materialization contract requires (identity meta included) for THIS server.
					const templateUrl = new URL(url.toString());
					templateUrl.searchParams.delete('search');
					templateUrl.searchParams.delete('sku');
					templateUrl.searchParams.set('per_page', '1');
					templateUrl.searchParams.set('page', '1');
					const real = await route.fetch({ url: templateUrl.toString() });
					const body = (await real.json()) as Record<string, unknown>[];
					template = body[0] ?? {};
				}
				const perPage = Number(url.searchParams.get('per_page') ?? 10);
				const pageNo = Number(url.searchParams.get('page') ?? 1);
				const kind: SeenRequest['kind'] = sku ? 'sku' : 'search';
				const matches =
					kind === 'search' && (search ?? '').trim().toLowerCase() === TERM ? SERVER_ROWS : 0;
				const rows =
					matches === 0
						? []
						: Array.from({ length: matches }, (_, index) =>
								syntheticProduct(template!, index)
							).slice((pageNo - 1) * perPage, pageNo * perPage);
				seen.push({ atMs: Date.now() - startedAt, phase, kind, perPage, page: pageNo });
				await route.fulfill({
					status: 200,
					headers: {
						'content-type': 'application/json; charset=UTF-8',
						'x-wp-total': String(matches),
						'x-wp-totalpages': String(Math.ceil(matches / perPage)),
						'access-control-allow-origin': '*',
						'access-control-expose-headers': 'X-WP-Total, X-WP-TotalPages',
					},
					body: JSON.stringify(rows),
				});
			}
		);

		const searchInput = page.getByTestId('search-products').first();
		await expect(searchInput).toBeVisible({ timeout: 30_000 });
		// Type after the startup pulls drain: the serial require plane queues a search behind them.
		try {
			await waitForCadenceStart(page);
		} catch (error) {
			// Path only: the full URL's query can carry an authorization parameter.
			const body =
				[...inFlight]
					.map(([url, at]) => `${Date.now() - at} ms  ${wcposRestRoute(url) ?? url}`)
					.join('\n') || 'none';
			await testInfo.attach('store-requests-in-flight', { body, contentType: 'text/plain' });
			throw error;
		}
		await searchInput.fill(TERM);
		await page.waitForTimeout(OBSERVE_MS);
		phase = 'cleared';
		await searchInput.fill('');
		await page.waitForTimeout(AFTER_CLEAR_MS);

		const typed = seen.filter((request) => request.phase === 'typed');
		const cleared = seen.filter((request) => request.phase === 'cleared');
		// The tail is what diagnoses a storm; a 3,000-line log only hides the assertion.
		const log = seen
			.slice(-40)
			.map((r) => `${r.atMs}ms ${r.phase} ${r.kind} per_page=${r.perPage} page=${r.page}`)
			.join('\n');

		expect(typed.length, `no search request reached the stub:\n${log}`).toBeGreaterThan(0);

		// The wire page is whatever the app chose (its Performance dial); the walk must not cost
		// more than one request per page of the server's hit set plus the exact-SKU leg.
		const wirePage = Math.max(...typed.map((request) => request.perPage));
		const pagesNeeded = Math.ceil(SERVER_ROWS / wirePage);
		expect(
			typed.length,
			`walk cost ${typed.length} requests for ${SERVER_ROWS} hits at per_page=${wirePage}:\n${log}`
		).toBeLessThanOrEqual(pagesNeeded + 1);

		const identities = typed.map((request) => `${request.kind}:${request.perPage}:${request.page}`);
		expect(
			new Set(identities).size,
			`an identical search request was repeated within ${OBSERVE_MS} ms:\n${log}`
		).toBe(identities.length);

		// Release aborts the declaration; only the walk already in flight may still land.
		expect(
			cleared.length,
			`requests kept landing after the box was cleared:\n${log}`
		).toBeLessThanOrEqual(2);
	});
});
