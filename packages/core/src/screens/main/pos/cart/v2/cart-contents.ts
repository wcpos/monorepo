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
		if (label) entries.push({ kind: 'line', name: label, quantity: Number(quantity) || 1 });
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
