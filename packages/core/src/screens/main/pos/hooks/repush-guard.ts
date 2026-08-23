/**
 * The R1 re-push guard (woocommerce-pos#1548), as a pure decision.
 *
 * Writing the cart's arithmetic onto an engine-backed order ENQUEUES A SERVER
 * UPDATE. That is right while the cashier is building a sale and wrong once the
 * server has already answered with different money: WooCommerce's calculation is the
 * source of truth, so re-asserting the till's number pushes it back over the
 * server's and provokes the identical divergence on the next drain.
 *
 * The latch holds THE MONEY THE SERVER OVERRULED — the aggregate persisted on the
 * order when the divergence arrived — and never the money the cart is about to
 * compute. Latching the computed value instead wedges a cart whose aggregate has
 * never been written correctly: applying a coupon leaves the persisted total
 * pre-discount, the server disagrees, and the divergence then suppresses the very
 * settle that would fix it. The wrong total causes the divergence and the divergence
 * protects the wrong total. (#1505, caught by e2e/pos-coupon-apply.spec.ts and
 * invisible to every unit test.)
 *
 * Latched on the ARITHMETIC, not on the banner. Keying it to the divergence alone
 * made dismissing the alert — or a later clean save retiring it — flip the guard off
 * while the cart still computed the same overruled numbers, and the very next run
 * pushed them straight back. A real edit produces different arithmetic, does not
 * match the latch, writes, and converges.
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
	/** Serialized money currently ON THE ORDER — what the server overruled. */
	persisted: string;
}): RepushDecision {
	// While diverged, the overruled aggregate is whatever the order is holding. Adopt
	// it as the latch; it outlives the banner.
	const latch = input.diverged ? input.persisted : input.latched;

	// Re-asserting exactly what the server overruled is the thing that loops.
	if (latch !== null && input.computed === latch) {
		return { suppress: true, nextLatch: latch };
	}

	// Anything else is money the server has not rejected — including the first correct
	// aggregate for a cart that never had one. Write it and converge.
	return { suppress: false, nextLatch: null };
}
