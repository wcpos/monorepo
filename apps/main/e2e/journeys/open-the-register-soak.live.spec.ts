/**
 * roadmap#539: J1 "Open the register and run the session" looped as a soak, sampled as J2's is
 * (`sell-to-a-guest-soak.live.spec.ts`). Records, never gates: it fails only when the journey does.
 *
 * Every loop leaves a real session and closure on the store's register, so the default is small.
 * Hand-run only, on dev-pro, never demo, against a served build (see playwright.soak.config.ts):
 *
 *   BASE_URL=http://localhost:8081 \
 *     npx playwright test -c playwright.soak.config.ts --project=open-the-register-soak
 *
 * A register with an open session (someone else's, or a killed run's) stops the run at step 1:
 * the walk starts from a closed register and never closes one it did not open.
 */
import { expect } from '@playwright/test';

import { authenticatedTest as test } from '../fixtures';
import { CLOSE_PUSH_TIMEOUT_MS } from './open-register';
import { OPEN_THE_REGISTER, openTheRegister, REGISTER_PUSH_TIMEOUT_MS } from './open-the-register';
import { registerSessionsOn } from './register-wire-stub';
import { createSoakSampler } from './soak-sampler';

// Edit these two here for a longer hand run; each loop is one more closure on the store.
/** Measured loops between the two attribution checkpoints. */
const SOAK_LOOPS = 3;
/** Warm-up loops before the first checkpoint. */
const SOAK_WARMUP_LOOPS = 1;
/** Per-loop allowance: the session and closure holds at their worst, plus the walk itself. */
const LOOP_TIMEOUT_MS = REGISTER_PUSH_TIMEOUT_MS + CLOSE_PUSH_TIMEOUT_MS + 2 * 60_000;
/** Fixed allowance for sign-in, checkpoints, the end UA-memory reading and teardown. */
const FIXED_TIMEOUT_MS = 10 * 60_000;
/** A mid-run GC checkpoint between loops once this long has passed since the last one. */
const CHECKPOINT_EVERY_MS = 30 * 60_000;

test('open the register, looped', async ({ page }, testInfo) => {
	test.setTimeout((SOAK_LOOPS + SOAK_WARMUP_LOOPS) * LOOP_TIMEOUT_MS + FIXED_TIMEOUT_MS);
	await registerSessionsOn(page, testInfo);
	const sampler = await createSoakSampler(page, testInfo);

	let loop = 0;
	const runLoop = async () => {
		loop += 1;
		const startedAt = Date.now();
		await openTheRegister({ page, testInfo });
		const wallMs = Date.now() - startedAt;
		console.log(`[soak] loop ${loop}: ${wallMs} ms`);
		await sampler.endLoop({ journey: OPEN_THE_REGISTER.key, loop, wallMs, cartAddMs: null });
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
	// J1 sells nothing, so no order is ever left behind.
	const summary = await sampler.finish({ ordersNotTrashed: 0 });

	// Harness sanity only: no memory, timing or main-thread threshold is asserted here (#517).
	expect(summary.loops, 'every loop recorded its row').toBe(SOAK_LOOPS + SOAK_WARMUP_LOOPS);
	expect(summary.counts.samples, 'the 30 s metrics series is non-empty').toBeGreaterThan(0);
});
