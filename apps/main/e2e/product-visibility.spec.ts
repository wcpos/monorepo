import { expect, type Locator, type Page } from '@playwright/test';

import { isolatedProductTest as test } from './checkout-probe';
import { getStoreUrl, navigateToPage } from './fixtures';
import {
	createSearchProbe,
	deleteSearchProbe,
	productWriterCredentialsConfigured,
	searchAndWaitForServer,
} from './search-probe';
import {
	ensurePosOnlyProductsEnabled,
	hideProductFromPos,
	revealProductToPos,
} from './visibility-probe';

/**
 * POS visibility, end to end: a product the merchant marks online-only must LEAVE
 * the till, and come back when the mark is removed.
 *
 * # Convergence, not a single pass — the thing that makes this test non-obvious
 *
 * Visibility is a wp_option, so flipping it writes NO journal row and the
 * change-signal lane never hears about it. Only the existence audit notices, and
 * that audit is a bounded sweep: `DRILL_DOWNS_PER_TICK = 2` buckets per tick, chosen
 * round-robin from the occupied buckets by a PERSISTED cursor, with a bucket being
 * `floor(wooId / 1000)`.
 *
 * So the pass that removes the product is the one whose cursor reaches ITS bucket,
 * not the first pass after the flip. Measured on dev-free 2026-08-23, with the probe
 * at id 111302 (bucket 111): pass 1 drilled bucket 81, pass 2 drilled 110, pass 3
 * drilled 111 — and the row disappeared on pass 3. Asserting after one pass tests the
 * cursor's phase, not the visibility rule, and fails ~most of the time.
 *
 * This is why the test loops the manual pass until the row goes, with a bounded
 * budget, instead of forcing one pass and asserting. In production the audit runs on
 * its own 17-minute cadence, so a store with B occupied product buckets converges in
 * roughly B/2 ticks — worth knowing when a merchant asks why a product they just hid
 * is still on the till.
 *
 * # Why the reveal leg matters as much as the hide leg
 *
 * A prune that also poisons the existence manifest would pass a hide-only test
 * forever and quietly make the product unrecoverable — the nastier failure, and the
 * one a merchant hits second. Hiding proves removal; revealing proves the removal
 * was not a one-way door.
 *
 * # One test, three phases — deliberately not three tests
 *
 * The depopulate assertion is meaningless unless the row was proven present in the
 * SAME run (`toBeHidden` on a locator that never matched passes trivially), and a
 * standalone reveal test would have to perform the hide anyway. Splitting them would
 * triple a multi-minute live setup to re-derive state phase two already holds.
 */

/**
 * A manual "check everything" runs the existence lanes, which is what prunes here.
 *
 * Visibility is a wp_option, not a product edit, so flipping it writes NO journal
 * row for the product and the change-signal lane never hears about it — per-row
 * "Sync now" (census + change signal) is therefore the WRONG control and will not
 * move this. `existence-prime` and `existence-reconcile` are the lanes that diff
 * local residents against the server's id set, both are `manualSync: true`, and both
 * read `syncBaseUrl` (`wcpos/v2`), so the set they diff against is visibility-aware.
 * On their own timers that is a 15/17-minute wait; the button forces it now.
 */
const AUDIT_LANE_TIMEOUT_MS = 120_000;

/**
 * How long one manual pass may take before we call it stuck.
 *
 * Measured on dev-free 2026-08-23: a full `engine.sync()` is not a quick poke — it
 * seeds every collection, drains the scheduler, refreshes all nine census totals and
 * runs both existence lanes, and its requests were still arriving 150s in. 120s was
 * not enough and failed the pass, not the product.
 */
const MANUAL_SYNC_TIMEOUT_MS = 5 * 60_000;

/** Writer login, probe creation, first catalogue sync, and THREE full manual passes. */
const VISIBILITY_TEST_TIMEOUT_MS = 25 * 60_000;

/**
 * Force the audit lanes and wait for the pass to finish.
 *
 * The button disables while the pass is in flight (`Button`'s
 * `disabled = props.disabled || loading`), so "enabled again" is the completion
 * signal rather than a fixed sleep.
 */
async function checkEverything(page: Page): Promise<void> {
	await navigateToPage(page, 'health');
	const button = page.getByTestId('db-check-everything').filter({ visible: true }).first();
	await expect(button).toBeEnabled({ timeout: 60_000 });
	await button.click();
	// Wait for the pass to START before waiting for it to finish. `loading` is set in
	// a React state update, so asserting "enabled" straight after the click passes
	// against the not-yet-disabled button and the helper returns without waiting at
	// all — measured 2026-08-23: two "full" passes completed in 46s total, which is
	// not a sync, it is a no-op.
	await expect(button).toBeDisabled({ timeout: 30_000 });
	await expect(button).toBeEnabled({ timeout: MANUAL_SYNC_TIMEOUT_MS });
	await navigateToPage(page, 'pos');
}

/**
 * Audit passes to spend waiting for the cursor to reach the probe's bucket.
 *
 * This budget is unavoidably store-dependent: two buckets are drilled per pass and
 * the cursor is round-robin, so the passes needed scale with how many occupied
 * product buckets the catalogue spans (a bucket is 1000 consecutive wooIds, so it
 * tracks id SPREAD, not product count). 15 covers ~30 occupied buckets. dev-free
 * needed 1-3 passes when measured across four runs.
 *
 * A budget exhaustion is reported as its own failure message rather than a bare
 * assertion, because "did not converge within N passes on a large catalogue" and
 * "never converges" are different findings and must not be confused.
 */
const MAX_AUDIT_PASSES = 15;

/**
 * Run manual passes until the probe row reaches `want`, and return the pass number
 * that did it (or null if the budget ran out).
 *
 * Re-typing the search each pass is required: `checkEverything` leaves and re-enters
 * the POS screen, which clears the box.
 */
async function runPassesUntil(
	page: Page,
	token: string,
	row: Locator,
	want: boolean
): Promise<number | null> {
	for (let pass = 1; pass <= MAX_AUDIT_PASSES; pass += 1) {
		await checkEverything(page);
		await typeProbeSearch(page, token);
		// Give the grid a beat to re-render against the post-audit local set before
		// reading it; the query is reactive, so this is a render wait, not a sync wait.
		await expect
			.poll(async () => row.isVisible().catch(() => false), { timeout: 15_000 })
			.toBe(want)
			.catch(() => undefined);
		if ((await row.isVisible().catch(() => false)) === want) return pass;
		await probeSearchInput(page).fill('');
	}
	return null;
}

function probeSearchInput(page: Page) {
	return page.getByTestId('screen-pos').getByTestId('search-products');
}

/**
 * First search for the token: await the SERVER demand, because the probe was created
 * seconds ago and only that demand can bring it down.
 *
 * The row locator is passed so the helper races demand-vs-render and returns on
 * whichever lands first — the product can arrive through the ordinary catalogue pull
 * before the search demand resolves.
 */
async function searchServerSide(page: Page, token: string, row: Locator): Promise<void> {
	await searchAndWaitForServer(page, probeSearchInput(page), 'products', token, row);
}

/**
 * Every LATER search for the same token: type only, never wait for a demand.
 *
 * Measured 2026-08-23 — this cost the first live run. Once a search window has been
 * fetched, require-plane answers the identical term `serve-local` (the lane is
 * complete and fresh), so no second request is issued and `waitForResponse` hangs
 * until the 120s budget is gone. That is the correct app behaviour AND what makes
 * the assertion sharp: with no re-fetch to mask it, the local prune is the only
 * thing that can change what renders.
 */
async function typeProbeSearch(page: Page, token: string): Promise<void> {
	await probeSearchInput(page).fill(token);
}

test.describe('POS visibility (online-only products)', () => {
	test('an online-only product leaves the POS and returns when it is revealed', async ({
		posPage: page,
		productProbeRequest,
		productWriter,
	}, testInfo) => {
		test.skip(!productWriter, 'E2E product-writer credentials are not configured');
		test.setTimeout(VISIBILITY_TEST_TIMEOUT_MS);
		const storeUrl = getStoreUrl(testInfo);

		// A probe of this spec's own, never the shared `runPrivateSimpleProducts`
		// fixture: those are reused by the worker's later tests, and this one mutates
		// its subject's server-side visibility.
		const created = await createSearchProbe({
			request: productProbeRequest,
			storeUrl,
			authorization: productWriter,
			collection: 'products',
			workerIndex: testInfo.workerIndex,
			writerConfigured: productWriterCredentialsConfigured(),
		});
		if (!created.ok) {
			test.skip(true, created.reason);
			return;
		}
		const probe = created.probe;
		if (!probe.rowTestId) {
			throw new Error('Visibility probe is missing its slug-derived row testID');
		}
		const row = page.getByTestId(probe.rowTestId);

		try {
			// The rule is inert while the feature gate is off, so a hide would prove
			// nothing. Left on afterwards by design — see visibility-probe.ts.
			await ensurePosOnlyProductsEnabled(productProbeRequest, storeUrl, productWriter);

			// ---- Phase 1: populate ------------------------------------------------
			// The list view carries the slug-derived row testIDs; the tile view does not.
			await page.getByTestId('view-mode-toggle').click();
			await searchServerSide(page, probe.token, row);
			await expect(row).toBeVisible({ timeout: 60_000 });

			// PRIME before hiding. The audit diffs the LOCAL EXISTENCE MANIFEST against
			// the server's id set, so a product that is resident but has no manifest row
			// is invisible to it — the documented ghost condition in
			// ghost-prune.live.spec.ts, and exactly what a just-created probe pulled in
			// through search demand looks like. Priming first makes phase 2 a test of
			// the visibility rule instead of a test of manifest timing.
			await checkEverything(page);

			// ---- Phase 2: depopulate ----------------------------------------------
			await hideProductFromPos(productProbeRequest, storeUrl, productWriter, probe.id);
			const removalPass = await runPassesUntil(page, probe.token, row, false);
			expect(
				removalPass,
				`the online-only product was still on the till after ${MAX_AUDIT_PASSES} audit passes`
			).not.toBeNull();

			// ---- Phase 3: repopulate ----------------------------------------------
			await revealProductToPos(productProbeRequest, storeUrl, productWriter, probe.id);
			const returnPass = await runPassesUntil(page, probe.token, row, true);
			expect(
				returnPass,
				`the revealed product never came back after ${MAX_AUDIT_PASSES} audit passes — a prune that cannot be undone is worse than one that never happened`
			).not.toBeNull();
		} finally {
			// Teardown is best-effort and ordered: drop the visibility entry FIRST, so a
			// failed delete cannot strand this id in a list shared with concurrent runs.
			await revealProductToPos(productProbeRequest, storeUrl, productWriter, probe.id).catch(
				() => undefined
			);
			await deleteSearchProbe({
				request: productProbeRequest,
				storeUrl,
				authorization: productWriter,
				collection: 'products',
				id: probe.id,
			}).catch(() => undefined);
		}
	});
});
