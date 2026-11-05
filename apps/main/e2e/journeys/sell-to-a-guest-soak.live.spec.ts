/**
 * roadmap#514: J2 "Sell to a guest" looped as a soak, sampled the way wcpos/roadmap#520 recommends.
 *
 * A proof run that records and never gates (thresholds are #517's): it fails only when the journey
 * does. It answers how many loops 8 hours hold and whether `measureUserAgentSpecificMemory` works.
 * Hand-run only, against a served build (see playwright.soak.config.ts):
 *
 *   BASE_URL=https://wcpos.expo.app \
 *     npx playwright test -c playwright.soak.config.ts --project=sell-to-a-guest-soak
 *
 * Each loop trashes its own order once its row is recorded, so a killed run leaks at most one.
 */
import { expect } from '@playwright/test';

import { beginCartAddMeasurement, readCartAddMeasurement } from '../cart-add-timing';
import { liveOrderTest as test } from '../order-lifecycle';
import { SELL_TO_A_GUEST, sellToAGuest, type SellToAGuestContext } from './sell-to-a-guest';
import { createSoakSampler } from './soak-sampler';

// Edit these two here for a longer hand run.
/** Measured loops between the two attribution checkpoints. */
const SOAK_LOOPS = 10;
/** Warm-up loops before the first checkpoint. */
const SOAK_WARMUP_LOOPS = 2;
/** Per-loop allowance in the test timeout; a healthy loop takes a fraction of it. */
const LOOP_TIMEOUT_MS = 4 * 60_000;
/** Fixed allowance for sign-in, checkpoints, the end UA-memory reading and teardown. */
const FIXED_TIMEOUT_MS = 10 * 60_000;
/** A mid-run GC checkpoint between loops once this long has passed since the last one. */
const CHECKPOINT_EVERY_MS = 30 * 60_000;

test('sell to a guest, looped', async ({
	posPage,
	request,
	storeAuthorization,
	trackOrder,
	trashTracked,
}, testInfo) => {
	test.setTimeout((SOAK_LOOPS + SOAK_WARMUP_LOOPS) * LOOP_TIMEOUT_MS + FIXED_TIMEOUT_MS);
	const sampler = await createSoakSampler(posPage, testInfo);

	let cartAddMs: number | null = null;
	const ctx: SellToAGuestContext = {
		page: posPage,
		request,
		testInfo,
		storeAuthorization,
		trackOrder,
		onCheckpoint: async (step) => {
			// Step 1 leaves the cart empty, so the add step 2 makes is the one measured.
			if (step.number === 1) await beginCartAddMeasurement(posPage);
			if (step.number === 2) cartAddMs = await readCartAddMeasurement(posPage, testInfo, null);
		},
	};
	let loop = 0;
	let ordersNotTrashed = 0;
	const runLoop = async () => {
		loop += 1;
		cartAddMs = null;
		const startedAt = Date.now();
		await sellToAGuest(ctx);
		const wallMs = Date.now() - startedAt;
		await sampler.endLoop({ journey: SELL_TO_A_GUEST.key, loop, wallMs, cartAddMs });
		// After the row, so the loop's wall time leaves it out; what stays is the teardown's.
		// Outstanding, not summed: an order one loop leaves is retried, and counted, by the next.
		ordersNotTrashed = await trashTracked();
		if (ordersNotTrashed > 0) {
			console.warn(`[e2e-cleanup] after loop ${loop}: ${ordersNotTrashed} order(s) not trashed`);
		}
	};

	try {
		await sampler.start();
		for (let i = 0; i < SOAK_WARMUP_LOOPS; i += 1) await runLoop();
		await sampler.checkpoint('after-warmup');
		let lastCheckpointAt = Date.now();
		for (let i = 0; i < SOAK_LOOPS; i += 1) {
			// Between loops only, never mid-loop.
			if (Date.now() - lastCheckpointAt >= CHECKPOINT_EVERY_MS) {
				await sampler.checkpoint(`after-loop-${loop}`);
				lastCheckpointAt = Date.now();
			}
			await runLoop();
		}
		await sampler.checkpoint('end');
	} catch (error) {
		// A journey failure still stops the timers and attaches what was recorded up to it.
		await sampler.finish({ ordersNotTrashed }).catch(() => undefined);
		throw error;
	}
	const summary = await sampler.finish({ ordersNotTrashed });

	// Harness sanity only: no memory, timing or main-thread threshold is asserted here (#517).
	expect(summary.loops, 'every loop recorded its row').toBe(SOAK_LOOPS + SOAK_WARMUP_LOOPS);
	expect(summary.counts.samples, 'the 30 s metrics series is non-empty').toBeGreaterThan(0);
});
