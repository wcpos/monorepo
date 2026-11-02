import { cartContents } from './cart-contents';

type Payload = Parameters<typeof cartContents>[0] & {
	billing?: { first_name?: string | null; last_name?: string | null } | null;
};

/** A cashier recognises the customer or the contents, not a second copy of the total. */
export function tabWho(
	payload: Payload,
	t: (key: string, values?: Record<string, unknown>) => string
): string {
	const name = [payload.billing?.first_name, payload.billing?.last_name].filter(Boolean).join(' ');
	if (name) return name;
	const entries = cartContents(payload);
	if (entries.length === 0) return t('pos_cart.guest');
	const first = entries[0];
	const what =
		entries.length > 1
			? t('pos_cart.n_items', { n: entries.length, count: entries.length })
			: first.kind === 'shipping'
				? t('pos_cart.shipping_item', { method: first.method })
				: first.name;
	return t('pos_cart.guest_with', { what });
}
