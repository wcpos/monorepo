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
 * # STATUS 2026-08-23: PHASE 2 FAILS. This spec is currently RED, on purpose.
 *
 * It is a `.live.spec.ts` (excluded from both authenticated CI projects) for two
 * reasons: it runs ~15 minutes — three full manual passes, each of which seeds every
 * collection and runs both existence lanes — and it does not yet pass.
 *
 * What is measured, against dev-free:
 *  - Phase 1 PASSES. The probe is created, syncs, and renders in the POS.
 *  - The server is CORRECT on every lane the client consults. Proved directly with
 *    `wp eval`: `servable()` goes `[id]` -> `[]`, the `wcpos/v2/products` search
 *    returns `[]`, and `bucket_listing()` — the reconcile's own authoritative source
 *    — omits the id.
 *  - The audit RUNS. `/wcpos/v2/digests`, `/integrity/scan` x5 and `/integrity/bucket`
 *    x2 all fire on the "check everything" press.
 *  - The product is STILL RESIDENT AND RENDERED afterwards, reproducibly.
 *  - It is NOT the ghost condition from ghost-prune.live.spec.ts: the run primes the
 *    manifest with a full pass BEFORE hiding, and the outcome is unchanged.
 *
 * What is NOT yet isolated — do not assume either without measuring:
 *  a) the probe's row never reaches the local existence manifest (existence-prime is
 *     `maxRequestsPerTick: 5` and walks progressively, and a just-created product
 *     sits at the top of the id space), so its bucket is never a drill candidate; or
 *  b) a defect in the prune path itself.
 * Note that `reconcileScanCandidates` drills a bucket when the server's `storedCount`
 * disagrees with the local manifest length even if the aggregate reports `match`, so
 * a naive "both sides of the scan apply the servable filter" explanation does NOT
 * hold — that safety net should have caught it.
 *
 * Flip the file back to `product-visibility.spec.ts` once it is green and the runtime
 * is inside the shard budget.
 *
 * # Why this exists
 *
 * POS visibility had five plugin-side suites and zero end-to-end coverage, and all
 * five asserted row membership on a single response. None of them followed the rule
 * through the client, which is where it actually has to land — the server merely
 * stops serving a record; something on the device has to notice and delete the copy
 * it already holds. That gap is the same shape as monorepo#1520, where the client's
 * census asked `wc/v3` (which cannot see POS visibility at all) while every tested
 * plugin lane was correct and green.
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
	await expect(button).toBeEnabled({ timeout: MANUAL_SYNC_TIMEOUT_MS });
	await navigateToPage(page, 'pos');
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
			await checkEverything(page);
			await typeProbeSearch(page, probe.token);
			// The POSITIVE form of "it is gone": the grid's own empty state, not merely
			// the absence of a row — `toBeHidden` alone would also pass against a grid
			// that had not finished rendering. Phase 1 proved this row renders for this
			// search, so an empty result here is the prune and nothing else.
			await expect(page.getByTestId('no-data-message')).toBeVisible({
				timeout: AUDIT_LANE_TIMEOUT_MS,
			});
			await expect(row).toBeHidden();

			// ---- Phase 3: repopulate ----------------------------------------------
			await revealProductToPos(productProbeRequest, storeUrl, productWriter, probe.id);
			await checkEverything(page);
			await typeProbeSearch(page, probe.token);
			await expect(row).toBeVisible({ timeout: AUDIT_LANE_TIMEOUT_MS });
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
