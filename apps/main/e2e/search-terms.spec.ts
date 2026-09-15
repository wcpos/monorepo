import { expect } from '@playwright/test';

import { fakeUuid, searchFixturePayload, searchFixtureProduct } from '@wcpos/sync-core/testing';

import { authenticatedTest as test, wcposRestRoute } from './fixtures';
import { mintSearchProbeToken } from './search-probe';

test('preserves MY in cold and warm Georgian all-term searches', async ({
	posPage: page,
}, testInfo) => {
	const probe = mintSearchProbeToken(testInfo.workerIndex);
	const searchTerms = `MY საბარგული ${probe}`;
	const offset = 900_000_000 + Math.floor(Math.random() * 90_000_000);
	const names = [
		`xxxx ${searchTerms} xxxx`,
		`M3 საბარგული ${probe}`,
		`საბარგული MY ${probe}`,
		`MY xxxx საბარგული ${probe}`,
	];
	const rows = names.map((name, i) => {
		const id = offset + i;
		return {
			...searchFixturePayload(searchFixtureProduct(2001)),
			id,
			name,
			slug: `fixture-${id}`,
			sku: `fixture-${id}`,
			meta_data: [{ id: id + 5_000_000, key: '_woocommerce_pos_uuid', value: fakeUuid(id) }],
		};
	});
	const seen: string[] = [];
	await page.route(
		(url) => /^\/wcpos\/v2\/products\/?$/.test(wcposRestRoute(url.toString()) ?? ''),
		async (route) => {
			const url = new URL(route.request().url());
			const search = url.searchParams.get('search');
			const sku = url.searchParams.get('sku');
			if (!search?.includes(probe) && !sku?.includes(probe)) return route.fallback();
			if (search) seen.push(search);
			// Broad response intentionally exercises local all-term filtering, not PHP SQL.
			const matches = search ? rows : [];
			const size = Number(url.searchParams.get('per_page') ?? 10);
			const pageNo = Number(url.searchParams.get('page') ?? 1);
			await route.fulfill({
				status: 200,
				headers: {
					'content-type': 'application/json; charset=UTF-8',
					'x-wp-total': String(matches.length),
					'x-wp-totalpages': String(Math.ceil(matches.length / size)),
					'access-control-allow-origin': '*',
					'access-control-expose-headers': 'X-WP-Total, X-WP-TotalPages',
				},
				body: JSON.stringify(matches.slice((pageNo - 1) * size, pageNo * size)),
			});
		}
	);
	const input = page.getByTestId('search-products').first();
	const row = (id: number) =>
		page.getByTestId(new RegExp(`^(product-tile|data-table-row-fixture)-${id}$`));
	for (const visit of ['cold', 'warm']) {
		await input.fill(searchTerms);
		for (const i of [0, 2, 3]) await expect(row(offset + i).first(), visit).toBeVisible();
		await expect(page.getByTestId('data-table-loaded-count').first()).toHaveText('3');
		await expect(row(offset + 1)).toHaveCount(0);
		await input.fill('');
		await expect(input).toHaveValue('');
		// Wait for the debounced clear before the second visit.
		await page.waitForTimeout(500);
	}
	expect(seen).toContain(searchTerms);
});

test('finds a product when the typed words are reordered or separated', async ({
	posPage: page,
}, testInfo) => {
	const probe = mintSearchProbeToken(testInfo.workerIndex);
	const offset = 900_000_000 + Math.floor(Math.random() * 90_000_000);
	const names = [
		`Pala Bullpadel Vertex 05 ${probe}`,
		`Pala Bullpadel Vertex 05 Geo ${probe}`,
		`Bullpadel Comfort Grip ${probe}`,
	];
	const rows = names.map((name, i) => {
		const id = offset + i;
		return {
			...searchFixturePayload(searchFixtureProduct(2001)),
			id,
			name,
			slug: `fixture-${id}`,
			sku: `fixture-${id}`,
			meta_data: [{ id: id + 5_000_000, key: '_woocommerce_pos_uuid', value: fakeUuid(id) }],
		};
	});
	const seen: string[] = [];
	await page.route(
		(url) => /^\/wcpos\/v2\/products\/?$/.test(wcposRestRoute(url.toString()) ?? ''),
		async (route) => {
			const url = new URL(route.request().url());
			const search = url.searchParams.get('search');
			const sku = url.searchParams.get('sku');
			if (!search?.includes(probe) && !sku?.includes(probe)) return route.fallback();
			if (search) seen.push(search);
			// Broad response intentionally exercises local all-term filtering, not PHP SQL.
			const matches = search ? rows : [];
			const size = Number(url.searchParams.get('per_page') ?? 10);
			const pageNo = Number(url.searchParams.get('page') ?? 1);
			await route.fulfill({
				status: 200,
				headers: {
					'content-type': 'application/json; charset=UTF-8',
					'x-wp-total': String(matches.length),
					'x-wp-totalpages': String(Math.ceil(matches.length / size)),
					'access-control-allow-origin': '*',
					'access-control-expose-headers': 'X-WP-Total, X-WP-TotalPages',
				},
				body: JSON.stringify(matches.slice((pageNo - 1) * size, pageNo * size)),
			});
		}
	);
	const input = page.getByTestId('search-products').first();
	const row = (id: number) =>
		page.getByTestId(new RegExp(`^(product-tile|data-table-row-fixture)-${id}$`));
	for (const searchTerms of [`pala vertex ${probe}`, `bullpadel pala ${probe}`]) {
		for (const visit of ['cold', 'warm']) {
			await input.fill(searchTerms);
			for (const i of [0, 1]) await expect(row(offset + i).first(), visit).toBeVisible();
			await expect(page.getByTestId('data-table-loaded-count').first()).toHaveText('2');
			await expect(row(offset + 2)).toHaveCount(0);
			await input.fill('');
			await expect(input).toHaveValue('');
			// Wait for the debounced clear before the second visit.
			await page.waitForTimeout(500);
		}
		expect(seen).toContain(searchTerms);
	}
});
