/**
 * The R1 re-push guard (woocommerce-pos#1548), as a pure decision.
 *
 * Writing the cart's arithmetic onto an engine-backed order ENQUEUES A SERVER
 * UPDATE. That is right while the cashier is building a sale and wrong once the
 * server has already answered with different money: WooCommerce's calculation is
 * the source of truth, so re-asserting the till's number pushes it back over the
 * server's and provokes the identical divergence on the next drain.
 *
 * The suppression latches on the ARITHMETIC, not on the banner. Keying it to the
 * divergence alone made dismissing the alert — or any later clean save retiring it
 * — flip the guard off while the cart still computed the same overruled numbers,
 * and the very next run pushed them straight back: the loop again, one click later.
 * So the overruled totals are remembered, and stay suppressed until the cart inputs
 * actually change. A real edit produces different arithmetic, clears the latch, and
 * converges as normal.
 *
 * Lived inside use-order-totals until #1472 moved the cart write to settleCart.
 * Extracted rather than inlined so the decision stays testable without standing up
 * the whole cart: reaching it through use-cart-lines needs tax context, coupon
 * context, an order subscription and a divergence provider, and a test buried under
 * that much scaffolding is not evidence about this rule.
 */
export interface RepushDecision {
	/** Skip the write. */
	suppress: boolean;
	/** The latch to carry into the next evaluation. */
	nextLatch: string | null;
}

export function evaluateRepush(input: {
	/** Whether the server has overruled this order's money. */
	diverged: boolean;
	/** The latch from the previous evaluation for this order. */
	latched: string | null;
	/** Serialized money this settle pass computed. */
	computed: string;
}): RepushDecision {
	// The server has spoken. Remember exactly what we would have pushed, so the
	// suppression survives the banner being dismissed or retired.
	if (input.diverged) {
		return { suppress: true, nextLatch: input.computed };
	}

	// Same arithmetic the server already overruled. The banner's visibility says
	// nothing about whether re-pushing it is safe.
	if (input.latched === input.computed) {
		return { suppress: true, nextLatch: input.latched };
	}

	// Either nothing was overruled, or the cart genuinely changed. Converge.
	return { suppress: false, nextLatch: null };
}
