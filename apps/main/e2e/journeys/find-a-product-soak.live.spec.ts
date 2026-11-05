/**
 * roadmap#540: J12 "Find a product" looped as a soak, sampled as J2's is
 * (`sell-to-a-guest-soak.live.spec.ts`). Records, never gates: it fails only when the journey does.
 *
 * The walk writes no product and voids its one cart line in step 9, so a loop leaves nothing.
 * Hand-run only, on dev-pro, never demo, against a served build (see playwright.soak.config.ts):
 *
 *   BASE_URL=http://localhost:8081 \
 *     npx playwright test -c playwright.soak.config.ts --project=find-a-product-soak
 */
import { expect } from '@playwright/test';

import { authenticatedTest as test } from '../fixtures';
import { FIND_A_PRODUCT, findAProduct, type FindAProductContext } from './find-a-product';
import { createSoakSampler } from './soak-sampler';

// Edit these two here for a longer hand run.
/** Measured loops between the two attribution checkpoints. */
const SOAK_LOOPS = 10;
/** Warm-up loops before the first checkpoint. */
const SOAK_WARMUP_LOOPS = 2;
/** Per-loop allowance in the test timeout; a healthy loop takes a fraction of it. */
const LOOP_TIMEOUT_MS = 3 * 60_000;
/** Fixed allowance for sign-in, checkpoints, the end UA-memory reading and teardown. */
const FIXED_TIMEOUT_MS = 10 * 60_000;
/** A mid-run GC checkpoint between loops once this long has passed since the last one. */
const CHECKPOINT_EVERY_MS = 30 * 60_000;

test('find a product, looped', async ({ posPage, request, storeAuthorization }, testInfo) => {
	test.setTimeout((SOAK_LOOPS + SOAK_WARMUP_LOOPS) * LOOP_TIMEOUT_MS + FIXED_TIMEOUT_MS);
	const sampler = await createSoakSampler(posPage, testInfo);

	let loop = 0;
	let searchStartedAt: number | null = null;
	const ctx: FindAProductContext = {
		page: posPage,
		request,
		testInfo,
		storeAuthorization,
		// Read-only: the search figure is logged, never asserted.
		onCheckpoint: async (_step, id) => {
			if (id === 'search-started') searchStartedAt = Date.now();
			if (id === 'search-settled' && searchStartedAt !== null) {
				console.log(`[soak] loop ${loop}: search settled in ${Date.now() - searchStartedAt} ms`);
			}
		},
	};
	const runLoop = async () => {
		loop += 1;
		searchStartedAt = null;
		const startedAt = Date.now();
		// Each loop starts from the start state: step 9 of the last one put it back.
		await findAProduct(ctx);
		const wallMs = Date.now() - startedAt;
		console.log(`[soak] loop ${loop}: ${wallMs} ms`);
		await sampler.endLoop({ journey: FIND_A_PRODUCT.key, loop, wallMs, cartAddMs: null });
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
		await sampler.finish({ ordersNotTrashed: 0 }).catch(() => undefined);
		throw error;
	}
	// J12 sells nothing, so no order is ever left behind.
	const summary = await sampler.finish({ ordersNotTrashed: 0 });

	// Harness sanity only: no memory, timing or main-thread threshold is asserted here (#517).
	expect(summary.loops, 'every loop recorded its row').toBe(SOAK_LOOPS + SOAK_WARMUP_LOOPS);
	expect(summary.counts.samples, 'the 30 s metrics series is non-empty').toBeGreaterThan(0);
});
