import { evaluateRepush } from './repush-guard';

const COMPUTED = '{"total":"36.683280"}';
const DIFFERENT = '{"total":"49.000000"}';

/**
 * These are the scenarios the deleted `useOrderTotals re-push guard` suite pinned,
 * carried over when #1472 moved the cart write to settleCart. The names are kept
 * close to the originals so the lineage is greppable.
 */
describe('evaluateRepush', () => {
	it('patches while the cashier is building the sale', () => {
		expect(evaluateRepush({ diverged: false, latched: null, computed: COMPUTED })).toEqual({
			suppress: false,
			nextLatch: null,
		});
	});

	it('does NOT re-assert the POS total over a server total that diverged', () => {
		expect(evaluateRepush({ diverged: true, latched: null, computed: COMPUTED })).toEqual({
			suppress: true,
			nextLatch: COMPUTED,
		});
	});

	/**
	 * The suppression must not be tied to the banner being on screen: dismissing it,
	 * or a later clean save retiring it, would otherwise re-arm the very re-push this
	 * guard exists to stop — one click later. Here `diverged` has gone back to false
	 * and the latch alone must hold the line.
	 */
	it('stays suppressed after the cashier DISMISSES the banner', () => {
		expect(evaluateRepush({ diverged: false, latched: COMPUTED, computed: COMPUTED })).toEqual({
			suppress: true,
			nextLatch: COMPUTED,
		});
	});

	it('converges again once the cashier actually changes the cart', () => {
		expect(evaluateRepush({ diverged: false, latched: COMPUTED, computed: DIFFERENT })).toEqual({
			suppress: false,
			nextLatch: null,
		});
	});

	/**
	 * A divergence that arrives while a latch is already held must re-latch on the
	 * NEW arithmetic, not keep the stale one — otherwise the next identical pass
	 * would compare against the wrong number and push.
	 */
	it('re-latches on the new arithmetic when a fresh divergence lands', () => {
		expect(evaluateRepush({ diverged: true, latched: COMPUTED, computed: DIFFERENT })).toEqual({
			suppress: true,
			nextLatch: DIFFERENT,
		});
	});
});
