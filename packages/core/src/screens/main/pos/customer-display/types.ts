export const CUSTOMER_DISPLAY_PROTOCOL = 'wcpos.customer-display' as const;
export const CUSTOMER_DISPLAY_PROTOCOL_VERSION = 1 as const;

export type CustomerDisplayStatus = 'idle' | 'cart' | 'awaiting-payment';

export interface CustomerDisplayCurrency {
	code: string;
	symbol: string;
	decimalPlaces: number;
	pricesIncludeTax: boolean;
}

export interface CustomerDisplayItem {
	name: string;
	quantity: number;
	price: string;
	subtotal: string;
	subtotalTax: string;
	total: string;
	totalTax: string;
	imageUrl: string | null;
}

export interface CustomerDisplayAdjustment {
	name: string;
	total: string;
	totalTax: string;
}

export interface CustomerDisplayTotals {
	subtotal: string;
	subtotalTax: string;
	discount: string;
	discountTax: string;
	fee: string;
	feeTax: string;
	shipping: string;
	shippingTax: string;
	tax: string;
	total: string;
}

export interface CustomerDisplayStateV1 {
	status: CustomerDisplayStatus;
	currency: CustomerDisplayCurrency;
	items: CustomerDisplayItem[];
	fees: CustomerDisplayAdjustment[];
	shipping: CustomerDisplayAdjustment[];
	totals: CustomerDisplayTotals;
}

export type CustomerDisplaySnapshotV1 = Readonly<
	Omit<CustomerDisplayStateV1, 'currency' | 'items' | 'fees' | 'shipping' | 'totals'> & {
		currency: Readonly<CustomerDisplayCurrency>;
		items: readonly Readonly<CustomerDisplayItem>[];
		fees: readonly Readonly<CustomerDisplayAdjustment>[];
		shipping: readonly Readonly<CustomerDisplayAdjustment>[];
		totals: Readonly<CustomerDisplayTotals>;
		protocol: typeof CUSTOMER_DISPLAY_PROTOCOL;
		version: typeof CUSTOMER_DISPLAY_PROTOCOL_VERSION;
		sequence: number;
	}
>;

export interface CustomerDisplayProductSource {
	productId?: number | null;
	name?: unknown;
	quantity?: unknown;
	price?: unknown;
	subtotal?: unknown;
	subtotalTax?: unknown;
	total?: unknown;
	totalTax?: unknown;
	image?: { src?: unknown } | null;
}

export interface CustomerDisplayFeeSource {
	name?: unknown;
	total?: unknown;
	totalTax?: unknown;
}

export interface CustomerDisplayShippingSource {
	methodId?: string | null;
	name?: unknown;
	total?: unknown;
	totalTax?: unknown;
}

export interface CustomerDisplayTotalsSource {
	subtotal?: unknown;
	subtotalTax?: unknown;
	discount?: unknown;
	discountTax?: unknown;
	fee?: unknown;
	feeTax?: unknown;
	shipping?: unknown;
	shippingTax?: unknown;
	tax?: unknown;
	total?: unknown;
}

export interface CustomerDisplaySnapshotSource {
	status: Exclude<CustomerDisplayStatus, 'idle'>;
	currencyCode?: unknown;
	currencySymbol?: unknown;
	decimalPlaces?: unknown;
	pricesIncludeTax?: unknown;
	lineItems?: readonly CustomerDisplayProductSource[] | null;
	feeLines?: readonly CustomerDisplayFeeSource[] | null;
	shippingLines?: readonly CustomerDisplayShippingSource[] | null;
	totals?: CustomerDisplayTotalsSource | null;
}
