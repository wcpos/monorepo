import { expect, test } from './test';
import { authenticateWithStore, blockScriptRequests, getStoreUrl } from './fixtures';
import { exportOPFS, restoreOPFS } from './opfs-helpers';

import type { BrowserContext } from '@playwright/test';
import type { OPFSSnapshot } from './opfs-helpers';

/**
 * #2112 incomplete-session recovery — live proof, run by hand against a
 * lane-matching dev store. Excluded from CI (`.live.spec.ts`).
 *
 *   BASE_URL=http://localhost:8081 E2E_STORE_URL_PRO=https://dev-pro.wcpos.com \
 *     npx playwright test -c playwright.session-recovery.config.ts
 *
 * WHAT IT PROVES. A till whose persisted session pointer (`current`) names a
 * site row that is no longer on the device — the exact shape of the reported
 * failure, where the user database write failed so the site/store rows were
 * never written — must return to the store list with a merchant-facing
 * AUTH131, NOT throw `useStoreSession must be called within an active store
 * session` into a red banner over a blank window.
 *
 * HOW IT FORCES THE STATE. Authenticate fully (every row written), snapshot
 * OPFS with the app's JS stopped, then restore that snapshot MINUS the whole
 * `sites` collection directory and reload. Removing an entire collection's
 * files — never splicing bytes inside `documents.json`, which wedges the store
 * — leaves `current` pointing at a site row RxDB can no longer read: an
 * incomplete session, materialised the way a lost row would be.
 */

const DROP_SITES = /wcposusers_v\d+-sites(-|_)/;

/** Export the profile with no OPFS worker running: the app page is closed, this one has JS blocked. */
async function exportProfile(context: BrowserContext, baseURL: string): Promise<OPFSSnapshot> {
	const exportPage = await context.newPage();
	await exportPage.route('**/*', blockScriptRequests);
	await exportPage.goto(baseURL);
	const opfs = await exportOPFS(exportPage);
	await exportPage.close();
	return opfs;
}

test.describe('#2112 incomplete store session recovery', () => {
	test.skip(!process.env.BASE_URL, 'set BASE_URL to a served production web-build');

	test('a pointer to a missing site row returns to the store list with AUTH131, not a red banner', async ({
		page,
	}, testInfo) => {
		const context = page.context();
		const baseURL = testInfo.project.use.baseURL ?? process.env.BASE_URL ?? 'http://localhost:8081';
		console.log(`[2112] store=${getStoreUrl(testInfo)} base=${baseURL}`);

		// 1. Full, ordinary login — every session row lands on the device.
		await authenticateWithStore(page, testInfo, { waitForCatalogue: true });
		await expect(page.getByTestId('search-products').filter({ visible: true }).first()).toBeVisible(
			{
				timeout: 120_000,
			}
		);

		// 2. Freeze the authenticated profile with no OPFS worker holding the files.
		await page.close();
		const profile = await exportProfile(context, baseURL);
		const siteFiles = Object.keys(profile).filter((path) => DROP_SITES.test(path));
		expect(
			siteFiles.length,
			'the authenticated profile must contain the sites collection'
		).toBeGreaterThan(0);
		console.log(
			`[2112] dropping ${siteFiles.length} sites-collection file(s): ${siteFiles.join(', ')}`
		);

		// 3. Restore everything EXCEPT the sites collection, before the app's JS starts.
		const corrupted: OPFSSnapshot = Object.fromEntries(
			Object.entries(profile).filter(([path]) => !DROP_SITES.test(path))
		);
		const recoveryPage = await context.newPage();
		await recoveryPage.route('**/*', blockScriptRequests);
		await recoveryPage.goto('./', { waitUntil: 'commit' });
		await restoreOPFS(recoveryPage, corrupted);
		await recoveryPage.unroute('**/*', blockScriptRequests);
		await recoveryPage.reload({ waitUntil: 'commit' });

		// 4. The merchant outcome: the store/connect screen and an AUTH131 toast,
		//    never the POS and never the boundary's "Something went wrong" banner.
		await expect(recoveryPage.getByTestId('toast-AUTH131')).toBeVisible({ timeout: 90_000 });
		await expect(recoveryPage.getByTestId('store-url-input')).toBeVisible({ timeout: 30_000 });
		await expect(recoveryPage.getByTestId('error-boundary-fallback')).toHaveCount(0);
		await expect(recoveryPage.getByTestId('search-products')).toHaveCount(0);

		// 5. The pointer was cleared, so a second launch is an ordinary signed-out
		//    start. A fresh page-load re-runs the recovery effect from scratch, so
		//    if `current` still pointed at the broken session it would re-report —
		//    the AUTH131 toast must NOT reappear. (The storage-level clear itself is
		//    asserted deterministically in the provider unit test.) Give a
		//    hypothetical re-recovery time to fire before asserting its absence.
		await recoveryPage.reload({ waitUntil: 'commit' });
		await expect(recoveryPage.getByTestId('store-url-input')).toBeVisible({ timeout: 60_000 });
		await recoveryPage.waitForTimeout(3_000);
		await expect(recoveryPage.getByTestId('toast-AUTH131')).toHaveCount(0);
		await expect(recoveryPage.getByTestId('search-products')).toHaveCount(0);
	});
});
