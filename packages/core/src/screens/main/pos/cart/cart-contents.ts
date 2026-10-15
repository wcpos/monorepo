import { decode } from 'html-entities';

type Line = { product_id?: number | null; name?: string | null; quantity?: number | string | null };
type Fee = { name?: string | null };
type Shipping = { method_id?: string | null; method_title?: string | null };

export type CartEntry =
	| { kind: 'line'; name: string; quantity: number }
	| { kind: 'fee'; name: string }
	| { kind: 'shipping'; method: string };

/**
 * What is in a cart, in the order the cart shows it: products, then fees, then shipping.
 * The open-carts list reads this line to tell "Guest" carts apart (board, 2026-10-09).
 *
 * A line removed after the server gave it an id stays in the payload as a tombstone until the
 * next push: `product_id: null` for a product, `name: null` for a fee, `method_id: null` for
 * shipping (useRemoveLineItem). The cart hides those (useCartLines); this line must too, or a
 * cart the cashier emptied still reads "Beanie" at 0,00.
 */
export function cartContents(payload: {
	line_items?: readonly Line[] | null;
	fee_lines?: readonly Fee[] | null;
	shipping_lines?: readonly Shipping[] | null;
}): CartEntry[] {
	const entries: CartEntry[] = [];
	for (const { product_id, name, quantity } of payload.line_items ?? []) {
		if (product_id === null) continue;
		const label = decode(name ?? '').trim();
		// A missing or unreadable quantity reads as one; an explicit zero is a line with nothing
		// ordered and stays off the line (CodeRabbit on #2460). A negative quantity is a real
		// line here (a return against the cart) and stays on it (Greptile on #2460).
		const count =
			quantity === undefined || quantity === null || quantity === ''
				? 1
				: Number.isFinite(Number(quantity))
					? Number(quantity)
					: 1;
		if (label && count !== 0) entries.push({ kind: 'line', name: label, quantity: count });
	}
	for (const { name } of payload.fee_lines ?? []) {
		const label = decode(name ?? '').trim();
		if (label) entries.push({ kind: 'fee', name: label });
	}
	for (const { method_id, method_title } of payload.shipping_lines ?? []) {
		if (method_id === null) continue;
		const method = decode(method_title ?? '').trim();
		if (method) entries.push({ kind: 'shipping', method });
	}
	return entries;
}
