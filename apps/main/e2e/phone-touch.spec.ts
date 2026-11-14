import { randomUUID } from 'node:crypto';

import { expect, request as playwrightRequest } from '@playwright/test';

import { couponRequest, sweepOrphanedProbeCoupons } from './coupon-probe';
import {
	authenticatedTest,
	ensureRegisterOpen,
	getStoreVariant,
	storeRequestOptions,
	tryAddProductBySku,
} from './fixtures';
import {
	mintSearchProbeToken,
	productWriterAuthorization,
	productWriterCredentialsConfigured,
} from './search-probe';

/**
 * roadmap#505: a phone's taps through the cart's add menu, Add Discount and the coupon picker.
 * A Radix trigger opens on pointer-down, so a phone sheet's scrim mounts under the finger: the
 * tap's own click must not dismiss it. And the picker's sheet, opened over the modal discount
 * dialog (which puts `pointer-events: none` on the body), must still take touches.
 *
 * Store-agnostic: the coupon tapped is a probe this spec creates with the shared writer identity
 * (pos-coupon-apply.spec.ts's fixture), never one the store happens to have.
 */
const OPTION = '[data-testid^="add-coupon-option-"]';

type ProbeCoupon = { code: string; id: number };

const test = authenticatedTest.extend<object, { probeCoupon: ProbeCoupon | null }>({
	probeCoupon: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
		async ({}, use, workerInfo) => {
			if (!productWriterCredentialsConfigured()) {
				await use(null);
				return;
			}
			const request = await playwrightRequest.newContext();
			// The project's storeUrl is already the resolved store (playwright.config.ts).
			const storeUrl =
				(workerInfo.project.use as { storeUrl?: string }).storeUrl || 'https://dev-free.wcpos.com';
			let created: ProbeCoupon | null = null;
			let writerAuth: ReturnType<typeof storeRequestOptions> | null = null;
			try {
				const writer = await productWriterAuthorization(request, storeUrl);
				if (!writer) throw new Error('Configured coupon writer did not authorize');
				writerAuth = storeRequestOptions(writer);
				await sweepOrphanedProbeCoupons({ request, storeUrl, authorization: writer });
				const code =
					`${mintSearchProbeToken(workerInfo.workerIndex)}${randomUUID().slice(0, 4)}`.toLowerCase();
				const response = await couponRequest(request, 'post', storeUrl, undefined, {
					...writerAuth,
					data: {
						code,
						discount_type: 'percent',
						amount: '10',
						description: 'wcpos-e2e coupon phone-touch probe (safe to delete)',
					},
				});
				if (!response.ok()) {
					throw new Error(`probe coupon create failed: HTTP ${response.status()}`);
				}
				const body = (await response.json()) as { id?: number; code?: string };
				created = { code: body.code ?? code, id: Number(body.id) };
				expect(created.id, 'probe coupon must have a server id').toBeGreaterThan(0);
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

test.describe('Phone touch', () => {
	test.use({
		viewport: { width: 412, height: 915 },
		deviceScaleFactor: 2.625,
		isMobile: true,
		hasTouch: true,
	});
	test.beforeEach(async ({}, testInfo) => {
		// The touch path is the same on both stores, so one store runs it.
		test.skip(getStoreVariant(testInfo) !== 'free', 'Runs against the free store only');
	});

	test('taps open the add menu and Add Discount, pick a coupon over the dialog, and the scrim closes the picker', async ({
		posPage: page,
		probeCoupon,
	}) => {
		test.skip(
			!probeCoupon,
			'writer credentials not configured (E2E_PRODUCT_WRITER_USER/_PASS) — cannot provision a probe coupon'
		);
		const probe = probeCoupon!;
		const visible = (id: string) => page.getByTestId(id).locator('visible=true').first();
		await visible('pos-tab-products').tap();
		const added = await tryAddProductBySku(page);
		test.skip(added === 'unavailable', 'the shared E2E SKU is not a simple product on this store');
		expect(added, 'the shared SKU reaches the cart').toBe('added');
		await visible('pos-tab-cart').tap();
		await ensureRegisterOpen(page);

		await visible('add-cart-item-menu').tap();
		const addDiscount = visible('menu-add-discount');
		await expect(addDiscount).toBeVisible();
		// A menu dismissed by the tap's own click has played its exit by now.
		await page.waitForTimeout(500);
		await expect(addDiscount).toBeVisible();

		await addDiscount.tap();
		const dialog = visible('add-discount-dialog');
		await expect(dialog).toBeVisible();
		await visible('add-discount-kind-coupon').tap();
		const picker = visible('add-coupon-combobox');
		await picker.tap();
		// The search's demand lane brings the fresh coupon from the server to its option.
		await visible('add-coupon-search-input').fill(probe.code);
		const option = visible(`add-coupon-option-${probe.id}`);
		await expect(option, 'the probe surfaces').toBeVisible({ timeout: 60_000 });
		// Under the dialog's body lock the coupon never takes the tap: fail here, not at the test's end.
		await option.tap({ timeout: 10_000 });
		await expect(page.locator(OPTION).locator('visible=true')).toHaveCount(0);
		await expect(picker).toContainText(probe.code);
		await expect(dialog).toBeVisible();

		await picker.tap();
		await visible('add-coupon-search-input').fill(probe.code);
		await expect(option).toBeVisible();
		// The picker's sheet has no testID of its own: its scrim is the shell's fallback.
		await visible('overlay-scrim').tap({ position: { x: 206, y: 40 } });
		await expect(page.locator(OPTION).locator('visible=true')).toHaveCount(0);
	});
});
