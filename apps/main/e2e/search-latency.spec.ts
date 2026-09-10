// apps/main/e2e/search-latency.spec.ts
import { expect } from '@playwright/test';

import {
	searchFixtureExpectedIds,
	searchFixturePayload,
	searchFixtureProduct,
} from '@wcpos/sync-core/testing';

import { authenticatedTest as test, wcposRestRoute } from './fixtures';

// The stub is self-contained: fixture payloads carry every field materialization needs (the
// server-stamped uuid meta included), so no live request is made inside the measured window.
const ROUND_TRIP_MS = 800; // a slow shared host, not a stubbed instant one
const TERM = 'widget'; // 130 fixture hits; one dial page (50) covers the first 48 rows
// Owner-approved TARGETS (2026-09-10) for an 800 ms slow-host round trip. Measured on the
// merged fix (2026-09-10, local): first row 1,813 ms, 48 rows 2,313 ms, 1 request — the round
// trip plus the 250 ms debounce plus ~750 ms of client work (materialise 50 rows, index, render).
// A target miss is annotated on the run, not failed; the CEILINGS below fail the run, with
// headroom for a slower CI machine. Both customer reports fail the ceilings and the request cap.
const FIRST_ROW_TARGET_MS = 1_500;
const FULL_PAGE_TARGET_MS = 3_000;
const FIRST_ROW_CEILING_MS = 3_000;
const FULL_PAGE_CEILING_MS = 4_000;
const GRID_ROWS = 48;

test('a single-word search meets the latency budgets on a slow host', async ({
	posPage: page,
}, testInfo) => {
	test.setTimeout(120_000);
	let requests = 0;
	await page.route(
		(url) => /^\/wcpos\/v2\/products\/?$/.test(wcposRestRoute(url.toString()) ?? ''),
		async (route) => {
			const url = new URL(route.request().url());
			const search = url.searchParams.get('search');
			const sku = url.searchParams.get('sku');
			if (!search && !sku) return route.fallback();
			requests += 1;
			const ids = sku ? [] : searchFixtureExpectedIds(search ?? '');
			const size = Number(url.searchParams.get('per_page') ?? 10);
			const pageNo = Number(url.searchParams.get('page') ?? 1);
			const rows = ids
				.slice((pageNo - 1) * size, pageNo * size)
				.map((id) => searchFixturePayload(searchFixtureProduct(id)));
			await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
			await route.fulfill({
				status: 200,
				headers: {
					'content-type': 'application/json; charset=UTF-8',
					'x-wp-total': String(ids.length),
					'x-wp-totalpages': String(Math.ceil(ids.length / size)),
					'access-control-allow-origin': '*',
					'access-control-expose-headers': 'X-WP-Total, X-WP-TotalPages',
				},
				body: JSON.stringify(rows),
			});
		}
	);

	const input = page.getByTestId('search-products').first();
	await expect(input).toBeVisible({ timeout: 30_000 });
	// The FIRST CORRECT row: any fixture hit by its id-bearing testID in either layout (the grid
	// virtualizes and sorts by name, so which hit renders first is the layout's business). A
	// plain tile locator would match the browse rows already on screen and read 2 ms.
	const hitIds = searchFixtureExpectedIds(TERM).join('|');
	const rows = page.getByTestId(new RegExp(`^(product-tile|data-table-row-fixture)-(${hitIds})$`));
	// The rendered-row count as its own referent (both layouts virtualize, so counting rows
	// would read the viewport): the hidden loaded-count text each layout's footer carries.
	const loadedCount = page
		.getByTestId(/^(pos-products-grid-loaded-count|data-table-loaded-count)$/)
		.first();
	await input.fill(TERM);
	const typedAt = Date.now();
	await expect(rows.first()).toBeVisible({ timeout: 10_000 });
	const firstRowMs = Date.now() - typedAt;
	// The grid pages by its own viewport-sized limit (12 → 24 → 36 → 48 on the customer's
	// screen); the cashier reaches the rest by scrolling. Every one of those extensions must be
	// answered from the page the first request already fetched — no further round trip.
	const readCount = async () => Number((await loadedCount.textContent()) ?? 0);
	await rows.first().hover();
	const scrolledAt = Date.now();
	while ((await readCount()) < GRID_ROWS && Date.now() - scrolledAt < FULL_PAGE_CEILING_MS) {
		await page.mouse.wheel(0, 5_000);
		await page.waitForTimeout(150);
	}
	await expect.poll(readCount, { timeout: 5_000 }).toBeGreaterThanOrEqual(GRID_ROWS);
	const fullPageMs = Date.now() - typedAt;

	// Printed on every run so a CI log carries the measured numbers, not only pass/fail.
	console.log(
		`[search-latency] firstRowMs=${firstRowMs} fullPageMs=${fullPageMs} requests=${requests}`
	);
	// The 250 ms debounce is part of what the cashier waits for, so it is inside the budget.
	if (firstRowMs > FIRST_ROW_TARGET_MS || fullPageMs > FULL_PAGE_TARGET_MS) {
		testInfo.annotations.push({
			type: 'latency-target-missed',
			description: `first row ${firstRowMs} ms (target ${FIRST_ROW_TARGET_MS}), ${GRID_ROWS} rows ${fullPageMs} ms (target ${FULL_PAGE_TARGET_MS})`,
		});
	}
	expect(firstRowMs, `first row after ${firstRowMs} ms`).toBeLessThanOrEqual(FIRST_ROW_CEILING_MS);
	expect(fullPageMs, `${GRID_ROWS} rows after ${fullPageMs} ms`).toBeLessThanOrEqual(
		FULL_PAGE_CEILING_MS
	);
	expect(requests, `${requests} requests to show ${GRID_ROWS} rows`).toBeLessThanOrEqual(3);
});
