import * as fs from 'fs';
import { execFileSync } from 'child_process';

import { expect, test } from '@playwright/test';

import { authenticateWithStore, blockScriptRequests, getStoreUrl } from './fixtures';
import { exportOPFS, restoreOPFS } from './opfs-helpers';
import { restoreLocalStorage, type SavedAuthState } from './indexeddb-helpers';

import type { BrowserContext, Page } from '@playwright/test';

/**
 * #1284 live proof — server-deleted residents must prune (ghost residents).
 *
 * TWO PHASES, run by hand against a dev store:
 *
 *   1. `mint` — build a frozen profile holding a real ghost. Authenticate, create a
 *      product whose stored-digest row is purged BEFORE the client pulls it (so the
 *      pull carries no `_rxdb_digest` and NO manifest row is recorded), let it sync,
 *      freeze the profile, then force-delete the product and purge its journal rows.
 *      Result: resident locally, absent server-side, invisible to the audit.
 *
 *   2. `ab` — the experiment. Restore that ONE frozen profile, run manual passes, and
 *      report whether the ghost survived. Run it twice against the SAME state file,
 *      changing only the served bundle, so the bundle is the only variable.
 *
 * WHAT THE 2026-08-19 RUN ESTABLISHED (dev-free, local pre-fix vs fixed bundles):
 * the fixed bundle prunes the ghost — and so does the PRE-FIX bundle, because that
 * profile's counts were DIVERGENT (154 manifest rows vs 155 residents), leaving the
 * old gate open so #1211's sweep ran. The #1284 deadlock therefore requires the
 * BALANCED state — manifest rows == residents with divergent membership — which is
 * the only thing that shuts the gate. The reported device was in exactly that state:
 * zero /digests requests in 12 h of access logs.
 *
 * WHY THE BALANCED STATE IS NOT TESTED HERE. It needs a LEAKED manifest row, which
 * only the pre-fix tombstone apply produces — and a tombstone cannot be reliably
 * delivered live: a COMPLETE demand page serves `since=head` and the engine adopts
 * it, permanently skipping every unreplayed journal event. Measured:
 *
 *     signal.cycle  cursorFrom: 40777  cursor: 40777  head: 40777  deletes: 0
 *     the victim's delete sat at sequence 40776 — already behind the cursor.
 *
 * That skip is BY DESIGN (shared sequence space / tick-304 politeness; the audit and
 * prime sweep are the intended backstop — which is why this bug class exists at all).
 * None of these changed it: waiting 35 s+, health-screen passes, per-row "Sync now"
 * (checkCollection = census + change-signal only), or Playwright-blocking browse
 * pages for the whole drain. Note also that force-deleting a product writes
 * `deleted=0` journal rows AFTER the delete row, as WooCommerce cleanup hooks fire
 * post-delete. => Build balanced-membership states in a vitest with fakes instead;
 * that is what PR #1287's mutation-checked tests do.
 *
 * RESIDENCY ORACLE: parse the OPFS `documents.json` append log (concatenated JSON
 * objects; last revision per primary wins). Deleted docs are physically ABSENT after
 * compaction — there are no `_deleted: true` tombstones to find — and `changelog.txt`
 * is empty once compacted. A raw string scan over the file lies.
 *
 * NEVER pick a probe or victim from the real catalog. One earlier run force-deleted
 * real Luma fixture product 81131 (WJ05) from dev-free; it had to be rebuilt by hand
 * from the client's own synced copy. Create a probe and act on that.
 *
 * Run:
 *   pnpm --filter @wcpos/main build:web && npx serve web-build -p 8081 -s
 *   BASE_URL=http://localhost:8081 GHOST_PHASE=mint \
 *     GHOST_STATE=<state.json> GHOST_OPS=e2e/ghost-ops/ghost-ops.sh \
 *     GHOST_TOKEN=<token> npx playwright test -c playwright.ghostprune.config.ts
 *   # then, per bundle:
 *   BASE_URL=... GHOST_PHASE=ab GHOST_EXPECT=survive|pruned ... npx playwright test ...
 *
 * Server ops go through GHOST_OPS (ghost-ops.sh -> wp eval-file on the dev store's
 * php container over ssh). Dev stores only.
 */

const PHASE = process.env.GHOST_PHASE ?? '';
const STATE_FILE = process.env.GHOST_STATE ?? '';
const OPS = process.env.GHOST_OPS ?? '';
const TOKEN = process.env.GHOST_TOKEN ?? '';

function ops(...args: string[]): string {
	return execFileSync('bash', [OPS, ...args], { encoding: 'utf-8', timeout: 60_000 }).trim();
}

/**
 * The browser client and the ops script must address the SAME store.
 * `ghost-ops.sh` targets one hard-coded container, while the client's store URL
 * is configurable — so an override could mutate one store while asserting on
 * another's client state, invalidating the experiment and touching an
 * unintended fixture (codex review). Ask the ops target which site it is and
 * compare hosts before any mutation.
 */
function assertOpsTargetsClientStore(storeUrl: string): void {
	const opsHost = new URL(ops('storeurl')).host;
	const clientHost = new URL(storeUrl).host;
	expect(
		opsHost,
		`GHOST_OPS targets ${opsHost} but the client store is ${clientHost} — point both at one store`
	).toBe(clientHost);
}

function opsCreate(sku: string, ghost: boolean): { id: number; slug: string } {
	const out = ops('create', sku, ...(ghost ? ['ghost'] : []));
	const match = out.match(/ID:(\d+) SLUG:(\S+)/);
	if (!match) throw new Error(`ghost-ops create failed: ${out}`);
	return { id: Number(match[1]), slug: match[2]! };
}

/**
 * OPFS fs-storage documents.json = APPENDED doc revisions (concatenated JSON
 * objects); the LAST revision per primary wins.
 */
function parseAppendedDocs(base64: string): Record<string, any>[] {
	const raw = Buffer.from(base64, 'base64').toString('utf-8');
	const docs: Record<string, any>[] = [];
	let depth = 0;
	let start = -1;
	let inString = false;
	let escaped = false;
	for (let i = 0; i < raw.length; i += 1) {
		const ch = raw[i]!;
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === '{') {
			if (depth === 0) start = i;
			depth += 1;
		} else if (ch === '}') {
			depth -= 1;
			if (depth === 0 && start >= 0) {
				try {
					docs.push(JSON.parse(raw.slice(start, i + 1)));
				} catch {
					// torn tail write — ignore
				}
				start = -1;
			}
		}
	}
	return docs;
}

function lastRevisionById(docs: Record<string, any>[]): Map<string, Record<string, any>> {
	const last = new Map<string, Record<string, any>>();
	for (const doc of docs) {
		// Engine collections key by `uuid`; the existence manifest keys by `remoteId`
		// (ADR 0029 bare-id sweep — it was `id` before).
		const key = String(doc.uuid ?? doc.remoteId ?? doc.id ?? '');
		if (key) last.set(key, doc);
	}
	return last;
}

/** Is a LIVE (non-tombstoned) product doc carrying this sku resident? */
function liveProductWithSku(state: SavedAuthState, sku: string): boolean {
	for (const [path, base64] of Object.entries(state.opfs)) {
		if (!/-products-0\/documents\.json$/.test(path)) continue;
		for (const doc of lastRevisionById(parseAppendedDocs(base64)).values()) {
			if (doc._deleted === false && JSON.stringify(doc).includes(sku)) return true;
		}
	}
	return false;
}

/** Is a LIVE existenceManifest row for this wooId present? */
function liveManifestRow(state: SavedAuthState, wooId: number): boolean {
	for (const [path, base64] of Object.entries(state.opfs)) {
		if (!/existenceManifest-0\/documents\.json$/.test(path)) continue;
		const row = lastRevisionById(parseAppendedDocs(base64)).get(String(wooId));
		if (row && row._deleted === false) return true;
	}
	return false;
}

/**
 * Live manifest rows vs live residents — the gate's two inputs.
 *
 * MUST collapse to the last revision per primary BEFORE dropping tombstones
 * (codex review): documents.json appends a revision per write, so filtering raw
 * revisions double-counts every updated doc and keeps a deleted doc's earlier
 * live revision. Any figure derived from this feeds a claim about whether the
 * pre-fix gate was open, so a wrong count is a wrong conclusion.
 */
function manifestBalance(state: SavedAuthState): { manifestRows: number; residents: number } {
	const live = (suffix: RegExp): Record<string, any>[] => {
		for (const [path, base64] of Object.entries(state.opfs)) {
			if (!suffix.test(path)) continue;
			return [...lastRevisionById(parseAppendedDocs(base64)).values()].filter(
				(doc) => doc._deleted === false
			);
		}
		return [];
	};
	return {
		manifestRows: live(/existenceManifest-0\/documents\.json$/).length,
		residents:
			live(/-products-0\/documents\.json$/).length + live(/-variations-0\/documents\.json$/).length,
	};
}

/** On-device product count from the health row (label, LOCAL, SERVER, coverage, size). */
async function localProductCount(page: Page): Promise<number> {
	const parts = await page
		.getByTestId('db-row-products')
		.first()
		.evaluate((node: Element) => {
			const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
			const out: string[] = [];
			while (walker.nextNode()) {
				const text = walker.currentNode.textContent?.trim();
				if (text) out.push(text);
			}
			return out;
		});
	const pure = parts.find((part) => /^\d[\d\s.,  ]*$/.test(part));
	if (pure === undefined) {
		throw new Error(`no numeric cell in products row: ${JSON.stringify(parts)}`);
	}
	return Number(pure.replace(/\D/g, ''));
}

async function openHealthDatabase(page: Page): Promise<void> {
	const drawer = page.getByTestId('drawer-item-health');
	await expect(drawer).toBeVisible({ timeout: 20_000 });
	await drawer.click();
	await expect(page.getByTestId('screen-health-database')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('db-row-products')).toBeVisible({ timeout: 20_000 });
}

/**
 * One full manual pass (engine.sync() — every manualSync lane, existence-prime
 * included), and a HARD FAILURE if the pass did not actually run.
 *
 * `useManualSync` reports a failed tick as `status: 'error'` and a no-op as
 * `status: 'skipped'`, surfacing each only as a toast while re-enabling the
 * button either way. Waiting on the button alone therefore accepts a pass that
 * never reconciled anything — which would let the pre-fix `survive` control
 * pass for the wrong reason (codex review). Toasts carry semantic test IDs, so
 * error/warning are detectable without touching localized text.
 */
async function checkEverything(page: Page): Promise<void> {
	const button = page.getByTestId('db-check-everything');
	await expect(button).toBeEnabled({ timeout: 60_000 });
	const failed = page.getByTestId('error-toast');
	const skipped = page.getByTestId('warning-toast');
	await button.click();
	await expect(button).toBeEnabled({ timeout: 120_000 });
	// Success emits NO toast, so any error/warning toast here is a pass that did
	// not run. Sampled once: the pass has already completed at this point.
	const failedText = (await failed.count()) > 0 ? await failed.first().innerText() : null;
	const skippedText = (await skipped.count()) > 0 ? await skipped.first().innerText() : null;
	if (failedText !== null || skippedText !== null) {
		throw new Error(
			`manual pass did not run — ${failedText !== null ? 'error' : 'skipped'} toast: ${(
				failedText ??
				skippedText ??
				''
			).replace(/\s+/g, ' ')}`
		);
	}
}

/** Probe row presence on the Products TABLE (the POS grid renders tiles, not rows). */
async function expectProbeRow(
	page: Page,
	token: string,
	slug: string,
	timeoutMs: number
): Promise<void> {
	const drawer = page.getByTestId('drawer-item-products');
	await expect(drawer).toBeVisible({ timeout: 30_000 });
	await drawer.click();
	// Two `search-products` inputs exist (POS + Products); take the visible one.
	const search = page.getByTestId('search-products').filter({ visible: true }).first();
	await expect(search).toBeVisible({ timeout: 30_000 });
	await search.fill('');
	await search.fill(token);
	await expect(page.getByTestId(`data-table-row-${slug}`)).toBeVisible({ timeout: timeoutMs });
	await search.fill('');
}

/** Export the profile with no OPFS worker running (page closed, JS blocked). */
async function exportProfile(context: BrowserContext, baseURL: string): Promise<SavedAuthState> {
	const exportPage = await context.newPage();
	await exportPage.route('**/*', blockScriptRequests);
	await exportPage.goto(baseURL);
	const opfs = await exportOPFS(exportPage);
	const localStorage = await exportPage.evaluate(() => {
		const out: Record<string, string> = {};
		for (let i = 0; i < window.localStorage.length; i += 1) {
			const key = window.localStorage.key(i)!;
			out[key] = window.localStorage.getItem(key) ?? '';
		}
		return out;
	});
	await exportPage.close();
	return { opfs, localStorage };
}

/** Restore a profile into a fresh page before the app's JS (and OPFS worker) starts. */
async function restoreProfile(page: Page, state: SavedAuthState): Promise<void> {
	await page.route('**/*', blockScriptRequests);
	await page.goto('./', { waitUntil: 'commit' });
	await restoreOPFS(page, state.opfs);
	await restoreLocalStorage(page, state.localStorage);
	await page.unroute('**/*', blockScriptRequests);
	await page.reload({ waitUntil: 'commit' });
	await expect(page.getByTestId('search-products').filter({ visible: true }).first()).toBeVisible({
		timeout: 90_000,
	});
}

test.describe('#1284 ghost residents live proof', () => {
	test.skip(PHASE !== 'mint' && PHASE !== 'ab', 'set GHOST_PHASE=mint|ab');
	test.skip(!OPS || !STATE_FILE || !TOKEN, 'set GHOST_OPS, GHOST_STATE, GHOST_TOKEN');

	test('mint a frozen profile holding a real ghost', async ({
		page,
		context,
		baseURL,
	}, testInfo) => {
		test.skip(PHASE !== 'mint', 'phase mismatch');
		test.setTimeout(900_000);
		assertOpsTargetsClientStore(getStoreUrl(testInfo));

		await authenticateWithStore(page, testInfo, {
			waitForCatalogue: true,
			waitForFullCatalogue: true,
			credentials: { username: 'demo', password: 'demo' },
		});
		await openHealthDatabase(page);
		// Counts are context only: the device holds a demand-synced SUBSET of the
		// catalog, and a shared dev store drifts under other runs. Probe assertions
		// go through the probe's own unique token.
		console.log(`[ghost] baseline: device=${await localProductCount(page)} server=${ops('count')}`);

		// The ghost: hooked create, stored-digest row purged before the client can
		// pull it, so the pull carries no digest and NO manifest row is recorded.
		const ghost = opsCreate(`${TOKEN}g`, true);
		console.log(`[ghost] created ghost probe ${ghost.id} (${ghost.slug})`);
		await expectProbeRow(page, `${TOKEN}g`, ghost.slug, 120_000);

		// Freeze the profile (the OPFS worker must be gone), THEN make it a ghost:
		// delete it server-side and purge its journal rows while no page is open, so
		// no tick can ever deliver the delete.
		await page.close();
		const state = await exportProfile(context, String(baseURL));
		ops('ghostdelete', String(ghost.id), `${TOKEN}g`);

		expect(liveProductWithSku(state, `${TOKEN}g`)).toBe(true);
		expect(liveManifestRow(state, ghost.id)).toBe(false);
		expect(ops('digestrow', String(ghost.id))).toBe('0');
		fs.writeFileSync(
			STATE_FILE,
			JSON.stringify({ state, ghostId: ghost.id, ghostSlug: ghost.slug })
		);
		console.log(`[ghost] frozen profile balance: ${JSON.stringify(manifestBalance(state))}`);
		console.log(`[ghost] MINTED ghost ${ghost.id} — resident, no manifest row, gone server-side`);
	});

	test('A/B: ghost residency after manual passes on the served bundle', async ({
		page,
		context,
		baseURL,
	}, testInfo) => {
		test.skip(PHASE !== 'ab', 'phase mismatch');
		test.setTimeout(600_000);
		assertOpsTargetsClientStore(getStoreUrl(testInfo));
		const expectation = process.env.GHOST_EXPECT ?? '';
		expect(['survive', 'pruned']).toContain(expectation);

		const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as {
			state: SavedAuthState;
			ghostId: number;
			ghostSlug: string;
		};
		const token = `${TOKEN}g`;
		// Preconditions: the frozen profile still holds the #1284 shape, and the
		// ghost is still gone server-side.
		expect(liveProductWithSku(saved.state, token)).toBe(true);
		expect(liveManifestRow(saved.state, saved.ghostId)).toBe(false);
		expect(ops('digestrow', String(saved.ghostId))).toBe('0');
		console.log(`[ghost] input balance: ${JSON.stringify(manifestBalance(saved.state))}`);

		await restoreProfile(page, saved.state);
		await openHealthDatabase(page);
		for (let pass = 1; pass <= 3; pass += 1) {
			await checkEverything(page);
			await page.waitForTimeout(5_000);
		}
		await page.close();
		const after = await exportProfile(context, String(baseURL));
		const stillResident = liveProductWithSku(after, token);
		console.log(
			`[ghost] A/B (expected ${expectation}): ghost ${stillResident ? 'STILL RESIDENT' : 'PRUNED'}`
		);
		expect(stillResident).toBe(expectation === 'survive');
	});
});
