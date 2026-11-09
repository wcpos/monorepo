import { expect, test } from './test';
import { waitForStoreQuiescence } from './fixtures';

/**
 * Unit-style pin for the settle wait's idle-main-thread check — a static page, no store.
 *
 * On 2026-11-08 (#3298, run 42523563380) main's push E2E read "settled" from 1.5 s of
 * network silence while a CPU-bound boot phase still held the page's main thread; the
 * measured search typed into it queued behind the rest of the boot. The page below has the
 * same shape with no network at all: busy chunks (> 50 ms, so each is a Long Task) spread
 * across `spanMs`, then idle.
 */
const BUSY_SPAN_MS = 3_000;
const QUIET_MS = 1_000;

function busyPage(spanMs: number): string {
	return `<script>
		const t0 = performance.now();
		function chunk() {
			const until = performance.now() + 120;
			while (performance.now() < until) {}
			if (performance.now() - t0 < ${spanMs}) setTimeout(chunk, 180);
		}
		setTimeout(chunk, 0);
	</script>`;
}

test.describe('waitForStoreQuiescence idleMainThread', () => {
	test('resolves only after the busy phase ends', async ({ page }) => {
		const begun = Date.now();
		await page.setContent(busyPage(BUSY_SPAN_MS));
		const settled = await waitForStoreQuiescence(page, {
			quietMs: QUIET_MS,
			capMs: 10_000,
			idleMainThread: true,
		});
		const elapsed = Date.now() - begun;
		console.log(`[settle-idle] idle on: settled=${settled} after ${elapsed} ms`);
		expect(settled).toBe(true);
		expect(elapsed, `settled ${elapsed} ms in, inside the busy phase`).toBeGreaterThanOrEqual(
			BUSY_SPAN_MS
		);
	});

	test('without it, network silence alone settles inside the busy phase', async ({ page }) => {
		const begun = Date.now();
		await page.setContent(busyPage(BUSY_SPAN_MS));
		const settled = await waitForStoreQuiescence(page, { quietMs: QUIET_MS, capMs: 10_000 });
		const elapsed = Date.now() - begun;
		console.log(`[settle-idle] idle off: settled=${settled} after ${elapsed} ms`);
		expect(settled).toBe(true);
		expect(elapsed).toBeLessThan(BUSY_SPAN_MS);
	});

	test('a page still busy at the cap returns false, on time', async ({ page }) => {
		await page.setContent(busyPage(8_000));
		const begun = Date.now();
		const settled = await waitForStoreQuiescence(page, {
			quietMs: QUIET_MS,
			capMs: 2_000,
			idleMainThread: true,
		});
		const elapsed = Date.now() - begun;
		expect(settled).toBe(false);
		expect(elapsed, 'the cap held').toBeLessThan(3_000);
	});
});
