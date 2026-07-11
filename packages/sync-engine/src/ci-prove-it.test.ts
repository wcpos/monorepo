import { describe, expect, it } from 'vitest';

// PROVE-IT (ADR 0022 step 5): this test exists on one PR commit solely to
// demonstrate the new CI vitest step can fail. Reverted immediately after.
describe('ci prove-it', () => {
	it('deliberately fails so the vitest CI step proves it runs', () => {
		expect(1).toBe(2);
	});
});
