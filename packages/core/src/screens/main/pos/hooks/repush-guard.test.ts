import { evaluateRepush } from './repush-guard';

/** What the order is holding, and therefore what the server overruled. */
const OVERRULED = '{"total":"25.000000"}';
/** A different aggregate — a corrected one, or one from a real edit. */
const CORRECTED = '{"total":"22.500000"}';

/**
 * These carry over the scenarios the deleted `useOrderTotals re-push guard` suite
 * pinned, plus the one it could not express: a cart whose aggregate has never been
 * written correctly.
 */
describe('evaluateRepush', () => {
	it('patches while the cashier is building the sale', () => {
		expect(
			evaluateRepush({ diverged: false, latched: null, computed: CORRECTED, persisted: OVERRULED })
		).toEqual({ suppress: false, nextLatch: null });
	});

	it('does NOT re-assert the exact money the server overruled', () => {
		expect(
			evaluateRepush({ diverged: true, latched: null, computed: OVERRULED, persisted: OVERRULED })
		).toEqual({ suppress: true, nextLatch: OVERRULED });
	});

	/**
	 * The case the old shape could not express, and the one that wedged the cart in
	 * #1505. Applying a coupon leaves the persisted total pre-discount; the server
	 * disagrees; the settle that would FIX the total is a different figure from the one
	 * that was overruled, so it has to write. Suppressing here means the wrong total
	 * causes the divergence and the divergence protects the wrong total.
	 */
	it('writes a corrected aggregate the server has not overruled, even while diverged', () => {
		expect(
			evaluateRepush({ diverged: true, latched: null, computed: CORRECTED, persisted: OVERRULED })
		).toEqual({ suppress: false, nextLatch: null });
	});

	/**
	 * The suppression must not be tied to the banner being on screen: dismissing it, or
	 * a later clean save retiring it, would otherwise re-arm the very re-push this
	 * guard exists to stop — one click later. `diverged` is false here and the latch
	 * alone holds the line.
	 */
	it('stays suppressed after the cashier DISMISSES the banner', () => {
		expect(
			evaluateRepush({
				diverged: false,
				latched: OVERRULED,
				computed: OVERRULED,
				persisted: OVERRULED,
			})
		).toEqual({ suppress: true, nextLatch: OVERRULED });
	});

	it('converges again once the cashier actually changes the cart', () => {
		expect(
			evaluateRepush({
				diverged: false,
				latched: OVERRULED,
				computed: CORRECTED,
				persisted: OVERRULED,
			})
		).toEqual({ suppress: false, nextLatch: null });
	});

	/** A fresh divergence adopts whatever the order is holding now. */
	it('re-latches on the currently persisted money when a fresh divergence lands', () => {
		expect(
			evaluateRepush({
				diverged: true,
				latched: '{"total":"1.000000"}',
				computed: CORRECTED,
				persisted: OVERRULED,
			})
		).toEqual({ suppress: false, nextLatch: null });
	});
});
