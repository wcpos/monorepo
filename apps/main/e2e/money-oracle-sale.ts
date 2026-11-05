// A saved sale's two sides and the money oracle's parity, banner and divergence-log checks on it.
// Shared by `pos-money-oracle.spec.ts` and `journeys/sell-to-a-guest.spec.ts`.
import { expect, type Page, type TestInfo } from '@playwright/test';

import { log } from '@wcpos/utils/logger';

import { getStoreUrl, openOrderSheet } from './fixtures';
import { assertDiscriminating, linesOf } from './money-oracle-guards';
import {
	createPushOrdersResponseMatcher,
	expectMoneyMatches,
	expectRateSetParity,
	expectTaxParity,
	type OrderPayload,
	posAppliedRateIds,
	readCartMoney,
	type ServerOrder,
} from './order-lifecycle';

/**
 * Catalogue fixtures provisioned by `e2e/scripts/tax-class-fixtures.php`.
 *
 * Keyed by well-known SKU, never by id — the same contract as the `e2e-product-writer`
 * identity, so a new or moved store needs one command and the specs below skip with a
 * reason until it has been run.
 */
export const TAX_CLASS_SKU = {
	standard: 'e2e-tax-standard',
	reduced: 'e2e-tax-reduced',
	nonTaxable: 'e2e-tax-none',
};

export type SavedSale = {
	sent: OrderPayload;
	doc: ServerOrder;
	cartTotal: string;
	priceDecimals: number;
};

/** Save the open cart and return both sides of the sale. */
export async function saveAndCapture(
	page: Page,
	trackOrder: (order: { id: number; uuid?: string; label?: string }) => void,
	label: string,
	testInfo: TestInfo
): Promise<SavedSale> {
	// The till's own aggregate, captured BEFORE the click: the ack is adopted into
	// the resident order, so a read taken afterwards can compare the server's total
	// against itself and go green whatever the server did (pos-cart.spec.ts).
	const cart = await readCartMoney(page);

	const saved = page.waitForResponse(createPushOrdersResponseMatcher(), {
		timeout: 90_000,
	});
	saved.catch(() => {});

	await openOrderSheet(page);
	await page.getByTestId('save-to-server-button').click();
	const response = await saved;
	expect(response.status(), 'save to server must succeed').toBeLessThan(400);
	const pushUrl = new URL(response.url());
	// OPTIONAL. Multi-store is a Pro feature: dev-pro's push carries `store_id` because
	// the cashier is in one of two outlets, and dev-free's does not because the free
	// plugin has exactly one store. Requiring it failed all six free-lane tests.
	const storeId = pushUrl.searchParams.get('store_id');
	const authorization = pushUrl.searchParams.get('authorization');
	const authorizationHeader = response.request().headers().authorization;
	const storeBaseUrl = getStoreUrl(testInfo).replace(/\/+$/, '');
	const storeRequestOptions = {
		headers: {
			'X-WCPOS': '1',
			...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
		},
		params: {
			...(storeId ? { store_id: storeId } : {}),
			...(authorization ? { authorization } : {}),
		},
		failOnStatusCode: false,
	};
	let storeResponse = await page.request.get(
		`${storeBaseUrl}/wp-json/wcpos/v1/stores`,
		storeRequestOptions
	);
	if (storeResponse.status() === 404) {
		storeResponse = await page.request.get(`${storeBaseUrl}/index.php`, {
			...storeRequestOptions,
			params: { ...storeRequestOptions.params, rest_route: '/wcpos/v1/stores' },
		});
	}
	expect(storeResponse.ok(), `store settings request returned ${storeResponse.status()}`).toBe(
		true
	);
	const stores = (await storeResponse.json()) as {
		id?: unknown;
		price_num_decimals?: unknown;
	}[];
	// With a store_id, take that outlet. Without one, the free plugin serves exactly one
	// store and that is the till's — but assert the count rather than taking [0] blindly,
	// so a plugin that starts serving several here fails loudly instead of silently
	// measuring against the wrong outlet's decimals.
	const store = storeId
		? stores.find(({ id }) => String(id) === storeId)
		: (expect(stores, 'a single-store push must resolve exactly one store').toHaveLength(1),
			stores[0]);
	expect(
		store,
		storeId ? `store settings must include POS store ${storeId}` : 'no store settings returned'
	).toBeTruthy();
	const priceDecimals = Number(store!.price_num_decimals);
	expect(
		Number.isInteger(priceDecimals) && priceDecimals >= 0,
		`store ${storeId ?? '(single)'} reported price_num_decimals ` +
			`${JSON.stringify(store!.price_num_decimals)}`
	).toBe(true);

	const envelope = (response.request().postDataJSON() ?? {}) as {
		recordId?: string;
		payload?: OrderPayload;
	};
	const sent = envelope.payload ?? {};
	const ack = (await response.json().catch(() => null)) as { document?: ServerOrder } | null;
	const doc = ack?.document;
	expect(doc?.id, 'ack must carry the created order').toBeTruthy();
	trackOrder({ id: Number(doc!.id), uuid: envelope.recordId, label });

	// The TAX REGIME this run actually exercised, recorded on every sale.
	//
	// Every money bug this file exists for is parameterised by the store's tax
	// configuration — inclusive vs exclusive pricing, how many rates match a
	// location, the currency's decimal places. A green run means nothing until you
	// know which of those it ran against, and a fixture store's settings drift
	// without anyone announcing it. Printing the regime turns "it passed" into "it
	// passed on THIS configuration", which is the only form of that claim worth
	// keeping.
	const regime = doc as unknown as Record<string, unknown>;
	const rates = (
		(regime.tax_lines ?? []) as { rate_id?: unknown; rate_percent?: unknown; compound?: unknown }[]
	)
		.map((line) => `#${line.rate_id}@${line.rate_percent}%${line.compound ? ' compound' : ''}`)
		.join(' + ');
	log.info(
		`[money-oracle] REGIME ${label} currency=${regime.currency} ` +
			`prices_include_tax=${regime.prices_include_tax} rates=[${rates || 'none'}]`
	);

	return { sent, doc: doc!, cartTotal: cart.total, priceDecimals };
}

/** The line-level money slots the POS authors and the server must keep verbatim. */
const LINE_MONEY_KEYS = ['total', 'subtotal'] as const;
/** Line-level slots that are SERVER-COMPUTED, so they carry the rounding-tie tolerance. */
const LINE_TAX_KEYS = ['total_tax', 'subtotal_tax'] as const;

/**
 * Line-by-line, field-by-field parity — deliberately INDEPENDENT of the app's own
 * `compareOrderMoney`.
 *
 * The app runs that comparator on every push and raises the banner from its result;
 * `expectNoBanner` below is therefore already an end-to-end check of it. Importing
 * it here as well would make this oracle inherit its blind spots: if it ever stopped
 * walking `fee_lines[].taxes[]`, both the app AND the test would go quiet together.
 * This walk is hand-rolled for exactly that reason — two independent witnesses.
 *
 * `expectTaxParity` carries the measured one-microunit rounding-tie tolerance for
 * computed taxes; 0.090000 against 0.090909 is 909 microunits and fails. Amounts the
 * POS authored outright (`total`, `subtotal`) get `expectMoneyMatches` — exact.
 */
export function expectPerRateTaxParity(sale: SavedSale, label: string) {
	for (const key of ['line_items', 'fee_lines', 'shipping_lines']) {
		const sentLines = linesOf(sale.sent as Record<string, unknown>, key);
		const serverLines = linesOf(sale.doc as unknown as Record<string, unknown>, key);
		expect(serverLines.length, `${label}: server ${key} count`).toBe(sentLines.length);

		sentLines.forEach((sentLine, index) => {
			const serverLine = serverLines[index];
			const sentRecord = sentLine as Record<string, unknown>;
			const serverRecord = serverLine as unknown as Record<string, unknown>;

			for (const money of LINE_MONEY_KEYS) {
				if (sentRecord[money] === undefined) continue;
				expectMoneyMatches(
					serverRecord[money],
					sentRecord[money],
					`${label}: ${key}[${index}].${money}`
				);
			}
			for (const tax of LINE_TAX_KEYS) {
				if (sentRecord[tax] === undefined) continue;
				expectTaxParity(serverRecord[tax], sentRecord[tax], `${label}: ${key}[${index}].${tax}`);
			}

			const serverByRate = new Map(
				(serverLine?.taxes ?? []).map((tax) => [String(tax?.id ?? ''), tax])
			);
			const sentRateIds = (sentLine.taxes ?? []).map((tax) => String(tax?.id ?? '')).sort();
			const serverRateIds = (serverLine?.taxes ?? []).map((tax) => String(tax?.id ?? '')).sort();
			expect(serverRateIds, `${label}: ${key}[${index}] client/server rate IDs`).toEqual(
				sentRateIds
			);

			// The per-rate values BOTH sides hold, logged for every run whether it
			// passes or fails. Paul's ask: every important calculation grounded in
			// tests AND logs. A silent green run cannot be audited after the fact —
			// this line is how you check the oracle actually compared something.
			log.info(
				`[money-oracle] ${label} ${key}[${index}] ` +
					`sent=${JSON.stringify(sentLine.taxes ?? null)} ` +
					`server=${JSON.stringify(serverLine?.taxes ?? null)}`
			);

			// Both sides must AGREE about having taxes. An untaxed line legitimately has
			// none on either side — a non-taxable misc product is exactly that, and it is
			// how the negative-fee case builds its class mix. What must never pass quietly
			// is one side carrying taxes the other does not: a client that stopped sending
			// line taxes would otherwise sail through the per-rate loop below, which
			// iterates the CLIENT's array and would simply have nothing to iterate.
			expect(
				(sentLine.taxes ?? []).length === 0,
				`${label}: ${key}[${index}] — the client sent ` +
					`${(sentLine.taxes ?? []).length} per-rate taxes and the server holds ` +
					`${(serverLine?.taxes ?? []).length}. One side is taxing this line and the ` +
					`other is not.`
			).toBe((serverLine?.taxes ?? []).length === 0);

			for (const sentTax of sentLine.taxes ?? []) {
				const rate = String(sentTax?.id ?? '');
				const serverTax = serverByRate.get(rate);
				expect(
					serverTax,
					`${label}: ${key}[${index}] rate ${rate} missing from the ack`
				).toBeTruthy();
				expectTaxParity(
					serverTax!.total,
					sentTax.total,
					`${label}: ${key}[${index}].taxes[${rate}].total`
				);
			}
		});
	}
}

export function assertSaleParity(sale: SavedSale, page: Page, underTest: string, label: string) {
	assertDiscriminating(sale.doc, underTest, label, sale.priceDecimals);
	expectRateSetParity(
		posAppliedRateIds(sale.sent),
		sale.doc.tax_lines,
		`${label}: server tax rates must equal the rates the POS applied`
	);
	expectPerRateTaxParity(sale, label);
	expectMoneyMatches(sale.doc.total, sale.cartTotal, `${label}: order total (cart vs server)`);
	return page;
}

/**
 * The cashier-facing alarm. Parity is the invariant; this banner is what the
 * merchant actually sees when it breaks — the yellow "your store changed this
 * order's totals" box. Asserted after the save button re-enables so the
 * reconciliation that raises it has already run.
 */
export async function expectNoBanner(page: Page, label: string, divergence: () => string[]) {
	await openOrderSheet(page);
	await expect(page.getByTestId('save-to-server-button')).toBeEnabled({ timeout: 30_000 });
	const logged = divergence();
	await expect(
		page.getByTestId('order-totals-changed-banner'),
		`${label}: a correctly rung sale must not trigger the totals-changed banner.\n` +
			(logged.length
				? `The app's own comparator named these fields:\n  ${logged.join('\n  ')}`
				: `No push.money-divergence entry was logged — the banner is up for another reason.`)
	).not.toBeVisible();
}

/**
 * Collect the app's own `push.money-divergence` entries from the browser console.
 *
 * The independent walk above compares the slots this spec knows to look at; the app's
 * comparator walks EVERY money slot and is what actually raises the banner. When the
 * two disagree — parity green, banner up — the fields the app named are the whole
 * diagnosis, and without them the failure reads "a banner appeared" and tells you
 * nothing. That is the difference between a test that reports a symptom and one that
 * reports a cause.
 */
export function captureDivergenceLog(page: Page): () => string[] {
	const entries: string[] = [];
	page.on('console', (message) => {
		const text = message.text();
		if (!text.includes('money-divergence')) return;
		// The log line carries `divergentFields` / `detail`; keep it whole rather than
		// re-parsing a shape that is free to change.
		entries.push(text.replace(/\s+/g, ' ').trim());
	});
	return () => [...entries];
}
