import { randomUUID } from 'node:crypto';

import { type APIRequestContext, expect, request as playwrightRequest } from '@playwright/test';

import { addCheckoutProbeProduct } from './checkout-probe';
import { getStoreVariant, listStoreIds, storeRequestOptions } from './fixtures';
import {
	expectMoneyMatches,
	expectRateSetParity,
	isPushOrdersResponse,
	liveOrderTest as liveTest,
	newRunLabel,
	type OrderPayload,
	posAppliedRateIds,
	readCartMoney,
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

/**
 * Run this spec against EVERY store the cashier can open, not one of them.
 *
 * A store's tax configuration decides what this test can even detect: a
 * single-rate store cannot exercise compound sequencing, and two compound rates
 * whose `tax_rate_order` already ascends with `priority` cannot exercise the
 * ordering tie. Running against one store meant the answer depended on which
 * store the picker happened to list first, and a green run proved nothing about
 * the others (woocommerce-pos#1548 — a run on a single-rate store passed while
 * the compound path was completely broken).
 *
 * Falls back to a single unparameterized run when globalSetup did not record a
 * store list (a spec run locally) or the cashier has one store.
 */
const storeTargets: (string | null)[] = (() => {
	const ids = listStoreIds('pro');
	return ids.length > 1 ? ids : [null];
})();

for (const targetStoreId of storeTargets) {
	couponTest.describe(
		`POS Cart - coupon application parity (live store${targetStoreId ? ` — store ${targetStoreId}` : ''})`,
		() => {
			if (targetStoreId) couponTest.use({ targetStoreId });
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
					await expect(
						option,
						'freshly created coupon must surface in the cart search'
					).toBeVisible({
						timeout: 60_000,
					});
					await option.click();

					const submit = page.getByTestId('add-coupon-submit');
					await expect(submit).toBeEnabled({ timeout: 10_000 });
					await submit.click();

					// The dialog closes on a successful apply. (No text selector for the
					// coupon line — the E2E selector policy — so the ack assertion on
					// coupon_lines below is what proves the application.)
					await expect(page.getByTestId('add-coupon-submit')).not.toBeVisible({ timeout: 30_000 });

					// The till's own money, captured before the save. Since #1507 the POS
					// does not push the aggregate — WooCommerce authors it from the
					// lines — so the push body cannot witness what this cart discounted
					// and totalled. These are the figures the cashier is looking at,
					// which is the referent ADR 0032 §2 is about.
					//
					// `discounted: true` waits for the SETTLED discount rather than for a
					// fixed delay. `useAddCoupon` patches the coupon and line arrays and
					// the aggregate follows asynchronously, so a sleep here is a guess
					// about how long that takes — and the total wait alone is no help,
					// since the product had already given it a digit.
					const cart = await readCartMoney(page, { discounted: true });
					expect(
						Number(cart.discountTotal),
						'the cart must have discounted the applied coupon before saving'
					).toBeGreaterThan(0);

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
					const ack = (await response.json().catch(() => null)) as {
						document?: ServerOrder;
					} | null;
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
					//
					// Compared against the CART, not against the push body. This is the
					// regression guard for the defect that produced ADR 0032: settleCart
					// computed the discount correctly and the aggregate never reached the
					// document, so the store recorded `discount_total: 0`. Since #1507 the
					// server computes that figure from the lines, so the same defect now
					// shows up as a cart that discounts while the server does not — which
					// is exactly what these two assertions catch.
					expectMoneyMatches(
						(doc as { discount_total?: string }).discount_total,
						cart.discountTotal,
						'discount_total parity (cart vs server)'
					);
					expectMoneyMatches(
						doc!.total,
						cart.total,
						'couponed order total parity (cart vs server)'
					);
					// The client's rate set comes from the LINE taxes it pushes: the
					// order's `tax_lines` are readonly aggregate and no longer on the wire.
					expectRateSetParity(
						posAppliedRateIds(sent),
						doc!.tax_lines,
						'couponed sale must keep the POS rate set'
					);

					// RE-ARMED (was parked on woocommerce-pos#1548). Both halves of that bug
					// are now fixed in order-math: the #1117 rounding half (tax_lines emitted
					// at WooCommerce STORAGE precision) and the compound half (mono#1120 —
					// compound rates sequence by `tax_rate_priority`, not the display-only
					// `order` field, which ties at 0 on a real store and inverted the
					// sequence). On dev-next's GB store — VAT 20% priority 1 + Surcharge 2%
					// priority 2, BOTH compound — a couponed line used to split client VAT
					// 3.750000 / Surcharge 0.367647 against server 3.676471 / 0.441176: the
					// same 4.117647 total, redistributed, so only this banner caught it.
					// That redistribution is what the assertion below re-arms against, so it
					// is only meaningful on a MULTI-COMPOUND-RATE store — a single-rate store
					// passes it without ever exercising the compound path. The
					// push-payload/push-ack attachments above stay as the field-level
					// detector and record which rates a given run actually applied.
					//
					// So that "did this run exercise the compound path?" is answerable from
					// the REPORT rather than by opening an attachment, annotate the rate set
					// the sale actually applied. This is the lesson of the parked period: a
					// lab pinned to a single US rate reported 30/30 green while the compound
					// path was completely broken, because a pass count says nothing about
					// which rates ran. Annotation, not assertion — the store-agnostic policy
					// forbids requiring any particular store's rate set.
					const appliedRates = (doc!.tax_lines ?? []).map((line) => {
						const percent = (line as { rate_percent?: unknown }).rate_percent;
						const compound = (line as { compound?: unknown }).compound;
						const label = (line as { label?: unknown }).label ?? line.rate_id;
						return `${String(label)}@${String(percent ?? '?')}%${compound === true ? ' compound' : ''}`;
					});
					const compoundCount = (doc!.tax_lines ?? []).filter(
						(line) => (line as { compound?: unknown }).compound === true
					).length;
					// Two compound rates exercise the compound SEQUENCE. Whether they also
					// exercise the #1120 sort key depends on the store's `tax_rate_order`
					// values, which the ack does not carry: rates whose `order` already
					// ascends with `priority` sort identically before and after that fix.
					// dev-next has one store of each kind, so say what is provable here and
					// leave the rest to the rate table.
					const coverage =
						compoundCount > 1
							? `MULTI-COMPOUND (${compoundCount}): compound sequencing WAS exercised. Whether the #1120 priority-vs-order tie was exercised depends on this store's tax_rate_order values.`
							: `${compoundCount} compound rate: compound sequencing was NOT exercised — this run cannot speak to woocommerce-pos#1548.`;
					const rateSummary = `${appliedRates.join(', ') || 'none'} — ${coverage}`;
					testInfo.annotations.push({ type: 'tax-rates-exercised', description: rateSummary });
					// Also to stdout: the annotation only reaches the HTML/blob report, and
					// the whole point is that someone reading a GREEN log can see which rates
					// the pass was built on without downloading an artifact.
					console.log(`[tax-rates-exercised] ${rateSummary}`);
					//
					// Wait for the TERMINAL write signal first (same reason as the plain-sale
					// spec, #1114 review): the save button re-enables when the round trip
					// completes, so the reconciliation that raises this banner has run before
					// we assert it is down — asserting straight after the response would pass
					// on the pre-reconciliation rendering.
					await expect(page.getByTestId('save-to-server-button')).toBeEnabled({ timeout: 30_000 });
					await expect(
						page.getByTestId('order-totals-changed-banner'),
						'a couponed sale must not trigger the totals-changed banner'
					).not.toBeVisible();
				}
			);
		}
	);
}
