import { decode } from 'html-entities';

type Line = { name?: string | null; quantity?: number | string | null };
type Fee = { name?: string | null };
type Shipping = { method_title?: string | null };

export type CartEntry =
	| { kind: 'line'; name: string; quantity: number }
	| { kind: 'fee'; name: string }
	| { kind: 'shipping'; method: string };

/**
 * What is in a cart, in the order the cart shows it: products, then fees, then shipping.
 * The open-carts list reads this line to tell "Guest" carts apart (board, 2026-10-09).
 */
export function cartContents(payload: {
	line_items?: readonly Line[] | null;
	fee_lines?: readonly Fee[] | null;
	shipping_lines?: readonly Shipping[] | null;
}): CartEntry[] {
	const entries: CartEntry[] = [];
	for (const { name, quantity } of payload.line_items ?? []) {
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
	for (const { method_title } of payload.shipping_lines ?? []) {
		const method = decode(method_title ?? '').trim();
		if (method) entries.push({ kind: 'shipping', method });
	}
	return entries;
}
