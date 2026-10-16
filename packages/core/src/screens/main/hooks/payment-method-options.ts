import type { PaymentMethodDescriptor } from '@wcpos/order-math';

export type PaymentMethodOption = { value: string; label: string; kind: string };
export type ObservedPaymentMethod = {
	payment_method?: string;
	payment_method_title?: string;
	indexMethods: string[];
};
type InventoryMethod = Pick<PaymentMethodDescriptor, 'id' | 'title' | 'kind' | 'order'> & {
	pos_enabled?: boolean;
};
const KINDS = ['cash', 'card', 'stored_value', 'bank_transfer', 'other'];

export function mergePaymentMethodOptions(
	inventory: readonly InventoryMethod[],
	observed: readonly ObservedPaymentMethod[]
) {
	const titles = new Map<string, string>();
	for (const row of observed) {
		for (const id of [row.payment_method, ...row.indexMethods]) {
			if (!id) continue;
			const title = id === row.payment_method ? row.payment_method_title : undefined;
			titles.set(id, titles.get(id) || title || '');
		}
	}
	const options = new Map<string, PaymentMethodOption>();
	for (const method of [...inventory].sort(
		(a, b) => a.order - b.order || a.id.localeCompare(b.id)
	)) {
		if (!method.id) continue;
		options.set(method.id, {
			value: method.id,
			label: method.title || titles.get(method.id) || method.id,
			kind: KINDS.includes(method.kind) ? method.kind : 'other',
		});
	}
	const history = [...titles]
		.filter(([id]) => !options.has(id))
		.map(([value, title]) => ({ value, label: title || value, kind: 'other' }))
		.sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
	for (const option of history) options.set(option.value, option);
	const groups = KINDS.map((kind) =>
		[...options.values()].filter((item) => item.kind === kind)
	).filter((group) => group.length > 0);
	return { items: groups.flat(), groups, getLabel: (id: string) => options.get(id)?.label ?? id };
}
