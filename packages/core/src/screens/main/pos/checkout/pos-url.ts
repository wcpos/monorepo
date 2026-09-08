export interface PosUrlState {
	orderId?: string;
	stage: 'cart' | 'checkout' | 'receipt';
	methodId?: string | null;
	receiptOrderId?: string | null;
}

export function posPathFor({ orderId, stage, methodId, receiptOrderId }: PosUrlState): string {
	if (receiptOrderId) return `/cart/receipt/${receiptOrderId}`;
	if (!orderId) return '/cart';
	if (stage === 'checkout') return `/cart/${orderId}/checkout${methodId ? `/${methodId}` : ''}`;
	return `/cart/${orderId}`;
}

export function readCheckoutSeed(orderIdParam: string | string[] | undefined): {
	orderId?: string;
	checkout: boolean;
	methodId?: string;
} {
	const [orderId, suffix, methodId] = Array.isArray(orderIdParam) ? orderIdParam : [orderIdParam];
	const checkout = suffix === 'checkout';
	return { orderId, checkout, methodId: checkout ? methodId : undefined };
}

export function posBasePath(): string {
	const homepage = (globalThis as typeof globalThis & { initialProps?: { homepage?: string } })
		.initialProps?.homepage;
	return homepage ? new URL(homepage).pathname.replace(/\/$/, '') : '';
}
