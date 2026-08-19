import * as fs from 'fs';
import { execFileSync } from 'child_process';

import { expect, test } from '@playwright/test';

import { authenticateWithStore, blockScriptRequests } from './fixtures';
import { exportOPFS, restoreOPFS } from './opfs-helpers';
import { restoreLocalStorage, type SavedAuthState } from './indexeddb-helpers';

import type { BrowserContext, Page } from '@playwright/test';

/**
 * #1284 live proof — server-deleted residents must prune (ghost residents).
 *
 * STATUS (measured 2026-08-19, dev-free). Read this before trusting a phase:
 *
 *  - `ab` — WORKS, and is the phase that matters. Restores ONE frozen corrupted
 *    profile, runs manual passes, reports whether the ghost survived. Run it
 *    twice with the SAME state file, changing only the served bundle, so the
 *    bundle is the only variable.
 *  - `corrupt` — WORKS for the ghost half (create a product, purge its
 *    stored-digest row before the client pulls it so NO manifest row is
 *    recorded, sync, then force-delete + purge its journal rows). Its
 *    *stranded-row* half does NOT work; see below.
 *  - `strand` / the stranded assertions in `corrupt` — DO NOT WORK, and cannot
 *    be made to. A stranded manifest row is only born from a pre-fix tombstone
 *    apply, and a tombstone cannot be reliably delivered: a COMPLETE demand page
 *    serves `since=head` and the engine adopts it, permanently skipping every
 *    unreplayed journal event. Measured telemetry from the attempt:
 *      signal.cycle  cursorFrom: 40777  cursor: 40777  head: 40777  deletes: 0
 *      the victim's delete sat at sequence 40776 — already behind the cursor.
 *    That skip is BY DESIGN (shared sequence space / tick-304 politeness; the
 *    audit and prime sweep are the intended backstop — which is why this bug
 *    class exists at all). None of these helped: waiting 35 s+, driving passes
 *    from the health screen, per-row "Sync now" (checkCollection = census +
 *    change-signal only), or Playwright-blocking browse pages for the whole
 *    drain. Note too that force-deleting a product writes `deleted=0` journal
 *    rows AFTER the delete row (WooCommerce cleanup hooks fire post-delete).
 *    => Manufacture balanced-membership states in a vitest with fakes instead;
 *       that is what the merged PR #1287 tests do.
 *
 * WHAT THE LIVE RUN ESTABLISHED: the fixed bundle prunes a real ghost, and so
 * does the PRE-FIX bundle when the counts are DIVERGENT (its gate is open, so
 * #1211's sweep runs). The #1284 deadlock therefore requires the BALANCED state
 * — manifest rows == residents with divergent membership — which is what shuts
 * the gate. The reported device was in exactly that state: zero /digests
 * requests in 12 h of access logs.
 *
 * RESIDENCY ORACLE: parse the OPFS `documents.json` append log (concatenated
 * JSON objects; last revision per primary wins). Deleted docs are physically
 * ABSENT after compaction — there are no `_deleted: true` tombstones to find —
 * and `changelog.txt` is empty once compacted. A raw string scan is wrong.
 *
 * Never select a victim/probe from the real catalog: one run here force-deleted
 * real Luma fixture product 81131 from dev-free. Create a probe, act on that.
 *
 * Run (two bundles, one frozen state):
 *   pnpm --filter @wcpos/main build:web && npx serve web-build -p 8081 -s
 *   BASE_URL=http://localhost:8081 GHOST_PHASE=ab GHOST_EXPECT=pruned \
 *     GHOST_STATE=<state.json> GHOST_OPS=e2e/ghost-ops/ghost-ops.sh \
 *     GHOST_TOKEN=<token> npx playwright test -c playwright.ghostprune.config.ts
 *
 * Server ops go through GHOST_OPS (ghost-ops.sh -> wp eval-file on the dev-free
 * container over ssh). Dev stores only.
 */


const PHASE = process.env.GHOST_PHASE ?? '';
const STATE_FILE = process.env.GHOST_STATE ?? '';
const OPS = process.env.GHOST_OPS ?? '';
const BALANCED_FILE = `${process.env.GHOST_STATE ?? ''}.balanced`;
const TOKEN = process.env.GHOST_TOKEN ?? '';

function ops(...args: string[]): string {
	return execFileSync('bash', [OPS, ...args], { encoding: 'utf-8', timeout: 60_000 }).trim();
}

function opsCreate(sku: string, ghost: boolean): { id: number; slug: string } {
	const out = ops('create', sku, ...(ghost ? ['ghost'] : []));
	const match = out.match(/ID:(\d+) SLUG:(\S+)/);
	if (!match) throw new Error(`ghost-ops create failed: ${out}`);
	return { id: Number(match[1]), slug: match[2]! };
}

/**
 * On-device product count: the row renders label, LOCAL, SERVER, coverage, size in
 * DOM order — the first text node that is a pure number (no %, no unit) is the
 * local count. textContent-with-regex is unusable here: adjacent numeric nodes
 * concatenate ("…100207…").
 */
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
	const pure = parts.find((part) => /^\d[\d\s.,  ]*$/.test(part));
	if (pure === undefined) throw new Error(`no numeric cell in products row: ${JSON.stringify(parts)}`);
	return Number(pure.replace(/\D/g, ''));
}

async function openHealthDatabase(page: Page): Promise<void> {
	const drawer = page.getByTestId('drawer-item-health');
	await expect(drawer).toBeVisible({ timeout: 20_000 });
	await drawer.click();
	await expect(page.getByTestId('screen-health-database')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('db-row-products')).toBeVisible({ timeout: 20_000 });
}

async function waitForLocalCount(page: Page, expected: number, timeoutMs: number): Promise<void> {
	await expect
		.poll(async () => localProductCount(page), {
			timeout: timeoutMs,
			intervals: [2_000],
			message: `waiting for on-device product count to reach ${expected}`,
		})
		.toBe(expected);
}

/** One full manual pass (engine.sync() → every manualSync lane, existence-prime included). */
async function checkEverything(page: Page): Promise<void> {
	const button = page.getByTestId('db-check-everything');
	await expect(button).toBeEnabled({ timeout: 60_000 });
	await button.click();
	// The button re-enables when the pass completes (loading is bound to syncing).
	await expect(button).toBeEnabled({ timeout: 120_000 });
}

/**
 * Probe-row presence via the POS search (local-first from keystroke 1) — immune to
 * foreign CI probes drifting the shared store's counts. Rows carry
 * `data-table-row-<slug>` (E2E selector policy).
 */
async function expectProbeRow(
	page: Page,
	token: string,
	slug: string,
	visible: boolean,
	timeoutMs: number
): Promise<void> {
	// The POS grid renders tiles (no row testIDs) — use the Products page table.
	const drawer = page.getByTestId('drawer-item-products');
	await expect(drawer).toBeVisible({ timeout: 30_000 });
	await drawer.click();
	const search = page.getByTestId('search-products').filter({ visible: true }).first();
	await expect(search).toBeVisible({ timeout: 30_000 });
	await search.fill('');
	await search.fill(token);
	const row = page.getByTestId(`data-table-row-${slug}`);
	if (visible) {
		await expect(row).toBeVisible({ timeout: timeoutMs });
	} else {
		await expect(row).toHaveCount(0, { timeout: timeoutMs });
	}
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
	await expect(page.getByTestId('search-products')).toBeVisible({ timeout: 90_000 });
}

/**
 * OPFS fs-storage documents.json = APPENDED doc revisions (concatenated JSON
 * objects); the LAST revision per primary wins and carries `_deleted` (RxDB
 * soft-deletes — a raw string scan reads tombstones as residents).
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
		const key = String(doc.uuid ?? doc.id ?? '');
		if (key) last.set(key, doc);
	}
	return last;
}

/** Is a LIVE (non-tombstoned) product doc with this sku resident? */
function liveProductWithSku(state: SavedAuthState, sku: string): boolean {
	for (const [path, base64] of Object.entries(state.opfs)) {
		if (!/-products-0\/documents\.json$/.test(path)) continue;
		for (const doc of lastRevisionById(parseAppendedDocs(base64)).values()) {
			if (doc._deleted === false && JSON.stringify(doc).includes(sku)) return true;
		}
	}
	return false;
}

/** Live manifest rows vs live residents, with the id sets — the gate's inputs. */
function manifestBalance(state: SavedAuthState): {
	manifestRows: number;
	residents: number;
	manifestIds: number[];
	residentIds: number[];
	residentsWithRow: number[];
} {
	const live = (suffix: RegExp): Record<string, any>[] => {
		for (const [path, base64] of Object.entries(state.opfs)) {
			if (!suffix.test(path)) continue;
			return parseAppendedDocs(base64).filter((doc) => doc._deleted === false);
		}
		return [];
	};
	const products = live(/-products-0\/documents\.json$/);
	const variations = live(/-variations-0\/documents\.json$/);
	const manifest = live(/existenceManifest-0\/documents\.json$/);
	const residentIds = [...products, ...variations]
		.map((doc) => Number(doc.remoteId))
		.filter((id) => Number.isFinite(id) && id > 0);
	const manifestIds = manifest.map((doc) => Number(doc.wooId));
	const manifestSet = new Set(manifestIds);
	return {
		manifestRows: manifest.length,
		residents: products.length + variations.length,
		manifestIds,
		residentIds,
		residentsWithRow: residentIds.filter((id) => manifestSet.has(id)),
	};
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

test.describe('#1284 ghost residents live proof', () => {
	test.skip(
		!['corrupt', 'converge', 'ab', 'strand'].includes(PHASE),
		'set GHOST_PHASE=corrupt|converge|ab|strand'
	);
	test.skip(!OPS || !STATE_FILE || !TOKEN, 'set GHOST_OPS, GHOST_STATE, GHOST_TOKEN');

	test('corrupt the profile on the pre-fix client and prove it is stuck', async ({
		page,
		context,
		baseURL,
	}, testInfo) => {
		test.skip(PHASE !== 'corrupt', 'phase mismatch');
		test.setTimeout(900_000);

		await authenticateWithStore(page, testInfo, {
			waitForCatalogue: true,
			waitForFullCatalogue: true,
			credentials: { username: 'demo', password: 'demo' },
		});
		await openHealthDatabase(page);
		// The device holds a demand-synced SUBSET of the catalog (browse-window seed
		// pulls the first window only) and the shared dev store drifts under other CI
		// runs — counts are logged context, never load-bearing. Probe assertions go
		// through the POS search on the probe's unique token instead.
		const baseline = await localProductCount(page);
		const serverBaseline = Number(ops('count'));
		console.log(`[ghost] baseline: device=${baseline} server=${serverBaseline}`);

		// Ghost G: hooked create, digest row purged before the client can pull —
		// the pull carries no digest, so the client records NO manifest row.
		const ghost = opsCreate(`${TOKEN}g`, true);
		const ghostId = ghost.id;
		console.log(`[ghost] created ghost probe ${ghostId} (${ghost.slug})`);
		await expectProbeRow(page, `${TOKEN}g`, ghost.slug, true, 120_000);

		// Stranded S: normal create + sync, then hook-delete. The PRE-FIX tombstone
		// apply removes the doc but leaks the manifest row.
		const stranded = opsCreate(`${TOKEN}s`, false);
		const strandedId = stranded.id;
		console.log(`[ghost] created stranded probe ${strandedId} (${stranded.slug})`);
		await expectProbeRow(page, `${TOKEN}s`, stranded.slug, true, 120_000);
		// Park on health BEFORE the delete: any complete demand page (browse/search,
		// or the seeds inside "Check everything") serves since=head and adopts it
		// into the shared cursor, silently burning journal events written since —
		// attempts 7-9 lost S's tombstone exactly this way. On the health screen no
		// product window is mounted, and the per-row "Sync now" (checkCollection)
		// runs ONLY census + change-signal — a pure journal drain that delivers the
		// tombstone. (On this pre-fix client the doc dies and the manifest row
		// leaks — defect A, the stranding we are manufacturing.)
		await openHealthDatabase(page);
		ops('hookdelete', String(strandedId));
		for (let round = 1; round <= 2; round += 1) {
			await page.getByTestId('db-row-menu-products').first().click();
			await page.getByTestId('db-row-sync-now-products').first().click();
			await page.waitForTimeout(10_000);
		}

		// Freeze the profile (OPFS worker must be off), then make G a true ghost:
		// delete it server-side and purge its journal tombstones while no client
		// page is open, so no tick can ever deliver the delete.
		await page.close();
		const state = await exportProfile(context, String(baseURL));
		ops('ghostdelete', String(ghostId));
		fs.writeFileSync(
			STATE_FILE,
			JSON.stringify({ state, baseline, serverBaseline, ghostId, ghostSlug: ghost.slug, strandedId })
		);
		// Shared dev store: other CI runs create/delete their own probes concurrently,
		// so the absolute server count drifts — log it, never assert equality on it.
		console.log(`[ghost] server count after ghostdelete: ${ops('count')} (was ${serverBaseline})`);

		// Profile facts: G resident without a manifest row; S stranded in the manifest.
		expect(liveProductWithSku(state, `${TOKEN}g`)).toBe(true);
		expect(liveManifestRow(state, ghostId)).toBe(false);
		// S's DOC must be tombstoned (the delete applied) while its manifest row
		// leaked — the pre-fix defect A, i.e. a REAL stranded row.
		expect(liveProductWithSku(state, `${TOKEN}s`)).toBe(false);
		expect(liveManifestRow(state, strandedId)).toBe(true);

		// Negative control: the deployed pre-fix client must be STUCK — the ghost
		// survives repeated full manual passes (balanced counts close the gate,
		// and nothing else can see a no-manifest-row resident).
		// NO searches from here on: a remote search for a server-deleted term is
		// itself a reconciliation trigger (the empty complete answer hides/prunes
		// the local hit) and would contaminate the control. Residency is asserted
		// on the exported OPFS storage instead.
		const stuckPage = await context.newPage();
		await restoreProfile(stuckPage, state);
		await openHealthDatabase(stuckPage);
		for (let pass = 1; pass <= 3; pass += 1) {
			await checkEverything(stuckPage);
			await stuckPage.waitForTimeout(5_000);
		}
		console.log(`[ghost] pre-fix device count after 3 passes: ${await localProductCount(stuckPage)}`);
		await stuckPage.close();
		const afterStuck = await exportProfile(context, String(baseURL));
		// The ghost survives every full manual pass on the pre-fix client, and the
		// stranded manifest row is still there — the balanced deadlock holds.
		expect(liveProductWithSku(afterStuck, `${TOKEN}g`)).toBe(true);
		expect(liveManifestRow(afterStuck, strandedId)).toBe(true);
		expect(liveManifestRow(afterStuck, ghostId)).toBe(false);
		console.log('[ghost] pre-fix client STUCK confirmed: ghost resident, manifest still padded');
	});

	/**
	 * STRAND — manufacture the BALANCED deadlock on top of the frozen ghost profile.
	 *
	 * A stranded manifest row can only be born from a LEAKY doc removal, i.e. the
	 * pre-fix tombstone apply (defect A). Delivering that tombstone is the hard part:
	 * a COMPLETE demand page serves `since=head` and the engine adopts it, skipping
	 * every journal event it never replayed (by design — the audit is the backstop).
	 * Attempts 7-10 all lost the tombstone that way (telemetry: cursorFrom already
	 * past the delete's sequence).
	 *
	 * So this phase blocks BROWSE pages (products list without `include=`) for the
	 * duration of the drain — targeted pulls and every audit endpoint stay live — and
	 * drains via the per-row "Sync now" (checkCollection = census + change-signal
	 * only, no seeds). With no complete page there is no head adoption, so the
	 * tombstone must replay.
	 *
	 * Result on the PRE-FIX bundle: victim doc removed, its manifest row LEAKED, so
	 * manifest rows == residents while the ghost still has no row — count equality
	 * with divergent membership: the #1284 deadlock, exactly as Paul's device showed
	 * it (zero /digests calls in 12h of access logs).
	 */
	test('manufacture the balanced deadlock (pre-fix bundle only)', async ({
		page,
		context,
		baseURL,
	}) => {
		test.skip(PHASE !== 'strand', 'phase mismatch');
		test.setTimeout(600_000);

		const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as {
			state: SavedAuthState;
			ghostId: number;
			ghostSlug: string;
		};
		const before = manifestBalance(saved.state);
		console.log(`[ghost] frozen profile: ${JSON.stringify(before)}`);
		// The victim: a resident that HAS a manifest row (never the ghost).
		const victim = before.residentsWithRow.find((id) => id !== saved.ghostId);
		expect(victim, 'a resident with a manifest row to strand').toBeDefined();
		console.log(`[ghost] victim (resident + manifest row): ${victim}`);

		// Block BROWSE pages only — no complete page, so no since=head adoption.
		await page.route('**/products?**', (route) => {
			const url = route.request().url();
			if (url.includes('include=')) return route.continue();
			return route.abort();
		});

		await restoreProfile(page, saved.state);
		await openHealthDatabase(page);
		ops('hookdelete', String(victim));
		for (let round = 1; round <= 3; round += 1) {
			await page.getByTestId('db-row-menu-products').first().click();
			await page.getByTestId('db-row-sync-now-products').first().click();
			await page.waitForTimeout(8_000);
		}
		await page.close();
		const after = await exportProfile(context, String(baseURL));
		const balance = manifestBalance(after);
		console.log(`[ghost] after strand: ${JSON.stringify(balance)}`);

		// Defect A: the doc died, its manifest row leaked.
		expect(balance.residentIds).not.toContain(victim);
		expect(balance.manifestIds).toContain(victim);
		// The ghost is untouched and still row-less.
		expect(balance.residentIds).toContain(saved.ghostId);
		expect(balance.manifestIds).not.toContain(saved.ghostId);
		// And the counts are now BALANCED — the closed gate.
		expect(balance.manifestRows).toBe(balance.residents);
		fs.writeFileSync(BALANCED_FILE, JSON.stringify({ ...saved, state: after, victim }));
		console.log('[ghost] BALANCED DEADLOCK manufactured');
	});

	/**
	 * A/B CONTROL — the decisive experiment. Restores ONE frozen corrupted profile
	 * and reports whether the ghost survives, with the served bundle as the only
	 * variable. Run it twice: pre-fix bundle (ghost must SURVIVE) then fixed bundle
	 * (ghost must be PRUNED). No auth, no probe creation, no server mutation — so
	 * neither run can drift the input the other saw.
	 *
	 * GHOST_EXPECT=survive|pruned states which side is being run.
	 */
	test('A/B: ghost residency after manual passes on the served bundle', async ({
		page,
		context,
		baseURL,
	}) => {
		test.skip(PHASE !== 'ab', 'phase mismatch');
		test.setTimeout(600_000);
		const expectation = process.env.GHOST_EXPECT ?? '';
		expect(['survive', 'pruned']).toContain(expectation);

		const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as {
			state: SavedAuthState;
			ghostId: number;
			ghostSlug: string;
		};
		const token = `${TOKEN}g`;
		// Precondition: the frozen profile really holds the #1284 shape.
		expect(liveProductWithSku(saved.state, token)).toBe(true);
		expect(liveManifestRow(saved.state, saved.ghostId)).toBe(false);
		// And the ghost is really gone server-side (deleted + journal purged).
		expect(ops('digestrow', String(saved.ghostId))).toBe('0');

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
			`[ghost] A/B (${expectation}): ghost ${stillResident ? 'STILL RESIDENT' : 'PRUNED'}`
		);
		expect(stillResident).toBe(expectation === 'survive');
	});

	test('the fixed client converges the corrupted profile', async ({ page, context, baseURL }) => {
		test.skip(PHASE !== 'converge', 'phase mismatch');
		test.setTimeout(600_000);

		const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as {
			state: SavedAuthState;
			baseline: number;
			serverBaseline: number;
			ghostId: number;
			ghostSlug: string;
			strandedId: number;
		};
		const token = `${TOKEN}g`;
		console.log(`[ghost] server count at converge start: ${ops('count')} (corrupt-phase: ${saved.serverBaseline})`);

		page.on('console', (message) => {
			const text = message.text();
			if (/stranded|prime|existence|SYNC|error/i.test(text)) {
				console.log(`[console:${message.type()}] ${text.slice(0, 300)}`);
			}
		});
		await restoreProfile(page, saved.state);
		await openHealthDatabase(page);
		console.log(`[ghost] device count at converge start: ${await localProductCount(page)}`);

		// NO searches (a remote search would reconcile the ghost by itself and
		// contaminate the proof). The restored profile has no prime force-counter,
		// so the FIRST existence-prime tick forces a full membership pass —
		// deploy-day behavior. Two passes for lane-ordering slack.
		for (let pass = 1; pass <= 2; pass += 1) {
			await checkEverything(page);
			await page.waitForTimeout(5_000);
		}
		console.log(`[ghost] device count after passes: ${await localProductCount(page)}`);

		// Residency oracle: the exported OPFS storage. The ghost doc must be gone
		// AND the stranded manifest row cleaned by the same forced membership pass.
		await page.close();
		const after = await exportProfile(context, String(baseURL));
		fs.writeFileSync(`${STATE_FILE}.after`, JSON.stringify(after));
		expect(liveProductWithSku(after, token)).toBe(false);
		expect(liveManifestRow(after, saved.ghostId)).toBe(false);
		expect(liveManifestRow(after, saved.strandedId)).toBe(false);
		console.log('[ghost] CONVERGED: ghost doc gone, manifest clean');
	});
});
