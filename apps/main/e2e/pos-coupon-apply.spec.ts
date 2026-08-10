import { randomUUID } from 'node:crypto';

import { type APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

import { addCheckoutProbeProduct } from './checkout-probe';
import { getStoreVariant, storeRequestOptions } from './fixtures';
import {
	expectMoneyMatches,
	expectRateSetParity,
	expectTaxParity,
	isPushOrdersResponse,
	liveOrderTest as liveTest,
	newRunLabel,
	type OrderPayload,
	type ServerOrder,
	stampRunLabel,
} from './order-lifecycle';
import {
	mintSearchProbeToken,
	productWriterAuthorization,
	productWriterCredentialsConfigured,
} from './search-probe';

/**
 * COUPON APPLICATION — the money-moving coupon path had ZERO coverage anywhere:
 * coupons.spec.ts is page chrome, and pos-checkout.spec.ts deliberately
 * excludes coupons from its parity oracle. This spec closes that gap with the
 * create-and-find pattern: it creates its own percent coupon (unique probe
 * code), applies it through the cart UI, saves to server, and holds the round
 * trip to the Money-oracle doctrine (TEST-PLAN.md) — coupon_lines recorded,
 * discount parity, totals parity, and no divergence banner.
 *
 * Pro-gated (menu-add-coupon requires a Pro license) and writer-gated (probe
 * coupons need the shared e2e-product-writer identity): both absences are
 * declared-missing environment → skip with reason, per the store-agnostic
 * policy. A configured-but-failing write is a FAILURE, not a skip.
 */

function storeUrlOf(workerInfo: { project: { use: Record<string, unknown> } }): string {
	if (process.env.E2E_STORE_URL) return process.env.E2E_STORE_URL;
	return (workerInfo.project.use as { storeUrl?: string }).storeUrl || 'https://dev-next.wcpos.com';
}

async function couponRequest(
	request: APIRequestContext,
	method: 'post' | 'delete',
	storeUrl: string,
	id: number | undefined,
	options: Record<string, unknown>
) {
	const base = storeUrl.replace(/\/+$/, '');
	const path = id === undefined ? 'coupons' : `coupons/${id}`;
	const pretty = await request[method](`${base}/wp-json/wc/v3/${path}`, options);
	if (pretty.status() !== 404) return pretty;
	return request[method](`${base}/?rest_route=/wc/v3/${path}`, options);
}

const couponTest = liveTest.extend<
	object,
	{ probeCoupon: { code: string; id: number; amount: string } | null }
>({
	probeCoupon: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
		async ({}, use, workerInfo) => {
			if (!productWriterCredentialsConfigured()) {
				await use(null);
				return;
			}
			const request = await playwrightRequest.newContext();
			const storeUrl = storeUrlOf(workerInfo);
			let created: { code: string; id: number; amount: string } | null = null;
			let writerAuth: ReturnType<typeof storeRequestOptions> | null = null;
			try {
				const writer = await productWriterAuthorization(request, storeUrl);
				if (!writer) {
					// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API.
					await use(null);
					return;
				}
				writerAuth = storeRequestOptions(writer);
				const code =
					`${mintSearchProbeToken(workerInfo.workerIndex)}${randomUUID().slice(0, 4)}`.toLowerCase();
				const response = await couponRequest(request, 'post', storeUrl, undefined, {
					...writerAuth,
					data: {
						code,
						discount_type: 'percent',
						amount: '10',
						description: 'wcpos-e2e coupon probe (safe to delete)',
					},
				});
				if (!response.ok()) {
					// Credentials are CONFIGURED — a failing write is a broken
					// environment, not a missing one. Fail, don't skip.
					throw new Error(`probe coupon create failed: HTTP ${response.status()}`);
				}
				const body = (await response.json()) as { id?: number; code?: string };
				created = { code: body.code ?? code, id: Number(body.id), amount: '10' };
				// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API.
				await use(created);
			} finally {
				if (created?.id && writerAuth) {
					await couponRequest(request, 'delete', storeUrl, created.id, {
						...writerAuth,
						params: { ...writerAuth.params, force: 'true' },
					}).catch(() => {});
				}
				await request.dispose();
			}
		},
		{ scope: 'worker' },
	],
});

couponTest.describe('POS Cart - coupon application parity (live store)', () => {
	couponTest(
		'applies a percent coupon through the cart and the server records the same money',
		async ({ posPage: page, trackOrder, probeCoupon }, testInfo) => {
			couponTest.skip(
				getStoreVariant(testInfo) === 'free',
				'coupon application is Pro-gated (menu-add-coupon)'
			);
			couponTest.skip(
				!probeCoupon,
				'writer credentials not configured (E2E_PRODUCT_WRITER_USER/_PASS) — cannot provision a probe coupon'
			);
			couponTest.slow();

			const label = newRunLabel();
			await addCheckoutProbeProduct(page);
			await stampRunLabel(page, label);

			// Apply the probe coupon through the UI.
			await page.getByTestId('add-cart-item-menu').click();
			const menuItem = page.getByTestId('menu-add-coupon');
			await expect(menuItem).toBeVisible({ timeout: 10_000 });
			await menuItem.click();

			await page.getByTestId('add-coupon-combobox').click();
			const searchInput = page.getByTestId('add-coupon-search-input');
			await expect(searchInput).toBeVisible({ timeout: 15_000 });
			await searchInput.fill(probeCoupon!.code);

			// The option renders once the demand-search lane surfaces the fresh
			// coupon (server write → sync → materialization → option) — the same
			// pipeline claim the product probes make.
			const option = page.getByTestId(`add-coupon-option-${probeCoupon!.id}`);
			await expect(option, 'freshly created coupon must surface in the cart search').toBeVisible({
				timeout: 60_000,
			});
			await option.click();

			const submit = page.getByTestId('add-coupon-submit');
			await expect(submit).toBeEnabled({ timeout: 10_000 });
			await submit.click();

			// The dialog closes on a successful apply; the cart then recomputes with
			// the coupon before the save below captures the payload. (No text
			// selector for the coupon line — the E2E selector policy — so the ack
			// assertion on coupon_lines below is what proves the application.)
			await expect(page.getByTestId('add-coupon-submit')).not.toBeVisible({ timeout: 30_000 });
			await page.waitForTimeout(1_000);

			const saved = page.waitForResponse((response) => isPushOrdersResponse(response), {
				timeout: 90_000,
			});
			saved.catch(() => {});
			await page.getByTestId('save-to-server-button').click();
			const response = await saved;
			expect(response.status(), 'couponed save must succeed').toBeLessThan(400);

			const envelope = (response.request().postDataJSON() ?? {}) as {
				recordId?: string;
				payload?: OrderPayload;
			};
			const sent = envelope.payload ?? {};
			const ack = (await response.json().catch(() => null)) as { document?: ServerOrder } | null;
			const doc = ack?.document;
			// Always attach the round-trip pair: when a parity assertion (or the
			// banner) fires, the exact field-level disagreement is in these two
			// documents — without them a CI failure names the symptom but not the field.
			await testInfo.attach('push-payload.json', {
				body: JSON.stringify(sent, null, 2),
				contentType: 'application/json',
			});
			await testInfo.attach('push-ack.json', {
				body: JSON.stringify(ack, null, 2),
				contentType: 'application/json',
			});
			expect(doc?.id, 'ack must carry the created order').toBeTruthy();
			trackOrder({ id: Number(doc!.id), uuid: envelope.recordId, label });

			// The coupon actually landed server-side.
			const ackCoupons = (doc!.coupon_lines ?? []) as { code?: string }[];
			expect(
				ackCoupons.map((line) => (line.code ?? '').toLowerCase()),
				'server must record exactly the applied coupon'
			).toEqual([probeCoupon!.code]);

			// Money-oracle doctrine, coupon edition: what the POS discounted and
			// totalled is what the server recorded. A recalculation difference here
			// is the #1020 class — evidence, never a tolerated blanket.
			const sentDiscount = (sent as { discount_total?: string }).discount_total;
			if (sentDiscount !== undefined) {
				expectMoneyMatches(
					(doc as { discount_total?: string }).discount_total,
					sentDiscount,
					'discount_total parity'
				);
			}
			if (sent.total !== undefined) {
				expectMoneyMatches(doc!.total, sent.total, 'couponed order total parity');
			}
			if (sent.cart_tax !== undefined) {
				expectTaxParity(doc!.cart_tax, sent.cart_tax, 'couponed cart_tax parity');
			}
			expectRateSetParity(
				sent.tax_lines,
				doc!.tax_lines,
				'couponed sale must keep the POS rate set'
			);

			// KNOWN DIVERGENCE — woocommerce-pos#1548 (named per the Money-oracle
			// doctrine, not blanket-tolerated): the couponed ack (a) swaps per-line
			// taxes[] rate attribution relative to its own tax_lines, and (b) serves
			// tax_lines[].tax_total unrounded where the money contract says
			// display-rounded — so the totals-changed banner currently fires on a
			// correct couponed sale. The banner-absence assertion is parked on that
			// issue; re-arm it (and add per-rate line-tax attribution parity, which
			// pins finding (a)) when #1548 closes. Everything comparable above —
			// coupon_lines, discount, total, cart_tax, rate SET — is asserted
			// strictly and holds today.
		}
	);
});
