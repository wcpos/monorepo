import { expect, test } from './test';
import { recordRequirePlane, waitForRequirePlaneIdle } from './fixtures';

/**
 * Unit-style pin for the require-plane idle wait — a static page, no store.
 *
 * #3799: product-category-filter armed its filtered-window wait while the require plane
 * was still draining a 48 s `orders-browse` requirement, and `cadence.start` had printed
 * mid-drain. The pages below print the same ledger lines on a schedule; the wait must
 * resolve only once every started requirement has settled and 1 s has passed.
 */
const HOLD_MS = 1_000;

type LedgerLine = { at: number; type: string; requirementId?: string };

function ledgerPage(schedule: LedgerLine[]): string {
	const lines = schedule.map(({ at, ...event }) => ({
		at,
		text: `WCPOS_E2E_ENGINE ${JSON.stringify(event)}`,
	}));
	return `<script>
		globalThis.__wcposE2eEngineLedger = true;
		for (const line of ${JSON.stringify(lines)}) {
			setTimeout(() => console.warn(line.text), line.at);
		}
	</script>`;
}

const A = 'pos:open-orders:qh1:pos-partial:orders-browse';
const B = 'qh6:parent:search';

test.describe('waitForRequirePlaneIdle', () => {
	test('resolves only after the last outcome, plus the hold', async ({ page }) => {
		recordRequirePlane(page);
		const begun = Date.now();
		await page.setContent(
			ledgerPage([
				{ at: 0, type: 'cadence.start' },
				{ at: 50, type: 'coverage.require.started', requirementId: A },
				{ at: 2_000, type: 'coverage.require.outcome', requirementId: A },
			])
		);
		await waitForRequirePlaneIdle(page, 10_000);
		const elapsed = Date.now() - begun;
		console.log(`[require-plane-idle] one id: idle after ${elapsed} ms`);
		expect(elapsed, `idle ${elapsed} ms in, before A settled and held`).toBeGreaterThanOrEqual(
			2_000 + HOLD_MS
		);
	});

	test('does not resolve while a second id is in flight', async ({ page }) => {
		recordRequirePlane(page);
		const begun = Date.now();
		await page.setContent(
			ledgerPage([
				{ at: 0, type: 'cadence.start' },
				{ at: 50, type: 'coverage.require.started', requirementId: A },
				{ at: 100, type: 'coverage.require.started', requirementId: B },
				{ at: 1_000, type: 'coverage.require.outcome', requirementId: A },
				{ at: 2_500, type: 'coverage.require.outcome', requirementId: B },
			])
		);
		await waitForRequirePlaneIdle(page, 10_000);
		const elapsed = Date.now() - begun;
		console.log(`[require-plane-idle] two ids: idle after ${elapsed} ms`);
		expect(elapsed, `idle ${elapsed} ms in, while B was in flight`).toBeGreaterThanOrEqual(
			2_500 + HOLD_MS
		);
	});

	test('a requirement started before cadence.start keeps it waiting until stalled', async ({
		page,
	}) => {
		recordRequirePlane(page);
		const begun = Date.now();
		await page.setContent(
			ledgerPage([
				{ at: 0, type: 'coverage.require.started', requirementId: A },
				{ at: 100, type: 'cadence.start' },
				{ at: 1_500, type: 'coverage.require.stalled', requirementId: A },
			])
		);
		await waitForRequirePlaneIdle(page, 10_000);
		const elapsed = Date.now() - begun;
		console.log(`[require-plane-idle] stalled: idle after ${elapsed} ms`);
		expect(elapsed, `idle ${elapsed} ms in, before A stalled`).toBeGreaterThanOrEqual(
			1_500 + HOLD_MS
		);
	});

	test('fails on timeout and names the id in flight', async ({ page }) => {
		recordRequirePlane(page);
		await page.setContent(
			ledgerPage([
				{ at: 0, type: 'cadence.start' },
				{ at: 50, type: 'coverage.require.started', requirementId: A },
			])
		);
		await expect(waitForRequirePlaneIdle(page, 2_000)).rejects.toThrow(A);
	});
});
