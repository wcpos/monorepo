import { readLedger } from '@wcpos/order-math';

type Payload = {
	status?: string | null;
	date_paid_gmt?: string | null;
	line_items?: readonly { product_id?: number | null }[] | null;
	fee_lines?: readonly { name?: string | null }[] | null;
	shipping_lines?: readonly { method_id?: string | null }[] | null;
	meta_data?: readonly { key?: string | null; value?: unknown }[] | null;
};

/**
 * A cart is STARTED by its first line and RESTARTS when a line goes into a cart the cashier
 * has emptied (owner ruling, 2026-10-12, monorepo#2183): `date_created_gmt` is the time the
 * sale in front of the cashier began, not the time an abandoned cart was first touched.
 *
 * Empty means no live product, fee or shipping line. A line removed after the server gave it
 * an id stays in the payload as a tombstone (`product_id` / `name` / `method_id` null,
 * useRemoveLineItem) and counts as removed. A coupon or a note alone does not keep a cart
 * alive. Only an unpaid `pos-open` cart restarts: a partial payment (`pos-partial`) or any
 * ledger row binds the order to the moment its money moved.
 */
export function cartRestartsOnAdd(payload: Payload): boolean {
	if (payload.status !== 'pos-open') return false;
	if (payload.date_paid_gmt) return false;
	if (readLedger(payload.meta_data as never).length > 0) return false;
	const live =
		(payload.line_items ?? []).some((line) => line.product_id !== null) ||
		(payload.fee_lines ?? []).some((fee) => fee.name !== null) ||
		(payload.shipping_lines ?? []).some((ship) => ship.method_id !== null);
	return !live;
}
