/**
 * Builds the canonical receipt_data object from local RxDB documents.
 * Used for offline Mustache template rendering when the receipts API is unavailable.
 *
 * Matches the shape returned by GET /wcpos/v1/receipts/{order_id} → data field.
 * See field-picker.tsx for the full field reference.
 */

interface ReceiptMeta {
	order_number: string;
	order_date: string;
	currency: string;
	status: string;
}

interface ReceiptStore {
	name: string;
	address: string;
	phone: string;
	email: string;
}

interface ReceiptCustomer {
	name: string;
	email: string;
	phone: string;
	billing_address: string;
	shipping_address: string;
}

interface ReceiptLine {
	name: string;
	quantity: number;
	price: number;
	total: string;
	sku: string;
}

interface ReceiptTotals {
	subtotal: string;
	tax_total: string;
	discount_total: string;
	grand_total_incl: string;
}

interface ReceiptPayment {
	method: string;
	amount: string;
	transaction_id: string;
}

interface ReceiptFiscal {
	submission_status: string;
	fiscal_id: string;
}

export interface ReceiptData {
	meta: ReceiptMeta;
	store: ReceiptStore;
	customer: ReceiptCustomer;
	lines: ReceiptLine[];
	totals: ReceiptTotals;
	payments: ReceiptPayment[];
	fiscal: ReceiptFiscal;
}

function formatAddress(addr: Record<string, string | undefined>): string {
	const parts = [
		addr.address_1,
		addr.address_2,
		addr.city,
		[addr.state, addr.postcode].filter(Boolean).join(' '),
		addr.country,
	].filter(Boolean);
	return parts.join(', ');
}

function computeSubtotal(lineItems: { subtotal?: string }[]): string {
	const sum = lineItems.reduce((acc, item) => acc + parseFloat(item.subtotal || '0'), 0);
	return sum.toFixed(2);
}

export function buildReceiptData(
	order: Record<string, any>,
	store: Record<string, any>
): ReceiptData {
	const billing = order.billing || {};
	const shipping = order.shipping || {};
	const lineItems = order.line_items || [];

	return {
		meta: {
			order_number: order.number || String(order.id || ''),
			order_date: order.date_created || '',
			currency: order.currency || '',
			status: order.status || '',
		},
		store: {
			name: store.name || '',
			address: formatAddress({
				address_1: store.store_address,
				address_2: store.store_address_2,
				city: store.store_city,
				state: store.store_state,
				postcode: store.store_postcode,
				country: store.store_country,
			}),
			phone: store.phone || '',
			email: store.email || '',
		},
		customer: {
			name: [billing.first_name, billing.last_name].filter(Boolean).join(' '),
			email: billing.email || '',
			phone: billing.phone || '',
			billing_address: formatAddress(billing),
			shipping_address: formatAddress(shipping),
		},
		lines: lineItems.map((item: Record<string, any>) => ({
			name: item.name || '',
			quantity: item.quantity || 0,
			price: item.price || 0,
			total: item.total || '0.00',
			sku: item.sku || '',
		})),
		totals: {
			subtotal: computeSubtotal(lineItems),
			tax_total: order.total_tax || '0.00',
			discount_total: order.discount_total || '0.00',
			grand_total_incl: order.total || '0.00',
		},
		payments: [
			{
				method: order.payment_method_title || order.payment_method || '',
				amount: order.total || '0.00',
				transaction_id: order.transaction_id || '',
			},
		],
		fiscal: {
			submission_status: '',
			fiscal_id: '',
		},
	};
}
