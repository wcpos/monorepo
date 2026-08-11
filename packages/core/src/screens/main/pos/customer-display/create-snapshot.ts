import type { CustomerDisplaySnapshotSource, CustomerDisplayStateV1 } from './types';

/** Normalizes optional labels without inventing customer-visible text. */
function text(value: unknown, fallback = ''): string {
	return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

const DECIMAL_STRING = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Expands finite JavaScript numbers into the protocol's plain-decimal format. */
function numberToPlainDecimal(value: number): string {
	const asString = String(value);
	if (DECIMAL_STRING.test(asString)) return asString;

	const [coefficient, exponentText] = asString.toLowerCase().split('e');
	const exponent = Number(exponentText);
	const negative = coefficient.startsWith('-');
	const unsignedCoefficient = negative ? coefficient.slice(1) : coefficient;
	const decimalIndex = unsignedCoefficient.indexOf('.');
	const digits = unsignedCoefficient.replace('.', '');
	const expandedDecimalIndex =
		(decimalIndex === -1 ? unsignedCoefficient.length : decimalIndex) + exponent;
	let expanded: string;

	if (expandedDecimalIndex <= 0) {
		expanded = `0.${'0'.repeat(-expandedDecimalIndex)}${digits}`;
	} else if (expandedDecimalIndex >= digits.length) {
		expanded = `${digits}${'0'.repeat(expandedDecimalIndex - digits.length)}`;
	} else {
		expanded = `${digits.slice(0, expandedDecimalIndex)}.${digits.slice(expandedDecimalIndex)}`;
	}

	return negative ? `-${expanded}` : expanded;
}

/** Preserves valid decimal strings and normalizes invalid money input to zero. */
function money(value: unknown): string {
	if (typeof value === 'number') return Number.isFinite(value) ? numberToPlainDecimal(value) : '0';
	if (typeof value !== 'string') return '0';
	const trimmed = value.trim();
	return DECIMAL_STRING.test(trimmed) ? trimmed : '0';
}

/** Preserves signed finite quantities so displayed lines remain consistent with totals. */
function quantity(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Removes credentials and request-specific URL data before an image reaches a display. */
function imageUrl(value: unknown): string | null {
	if (typeof value !== 'string' || value === '') return null;
	try {
		const url = new URL(value);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		url.username = '';
		url.password = '';
		url.search = '';
		url.hash = '';
		return url.toString();
	} catch {
		return null;
	}
}

/** Creates the replay-safe state used whenever no POS cart may be displayed. */
export function createIdleCustomerDisplayState(): CustomerDisplayStateV1 {
	return {
		status: 'idle',
		currency: { code: '', symbol: '', decimalPlaces: 2, pricesIncludeTax: false },
		items: [],
		fees: [],
		shipping: [],
		totals: {
			subtotal: '0',
			subtotalTax: '0',
			discount: '0',
			discountTax: '0',
			fee: '0',
			feeTax: '0',
			shipping: '0',
			shippingTax: '0',
			tax: '0',
			total: '0',
		},
	};
}

/** Projects order data through the explicit customer-display V1 allowlist. */
export function createCustomerDisplayState(
	source: CustomerDisplaySnapshotSource
): CustomerDisplayStateV1 {
	const totals = source.totals ?? {};
	return {
		status: source.status,
		currency: {
			code: text(source.currencyCode),
			symbol: text(source.currencySymbol),
			decimalPlaces:
				typeof source.decimalPlaces === 'number' &&
				Number.isInteger(source.decimalPlaces) &&
				source.decimalPlaces >= 0 &&
				source.decimalPlaces <= 20
					? source.decimalPlaces
					: 2,
			pricesIncludeTax: source.pricesIncludeTax === true,
		},
		items: (source.lineItems ?? [])
			.filter((item) => item.productId !== null)
			.map((item) => ({
				name: text(item.name),
				quantity: quantity(item.quantity),
				price: money(item.price),
				subtotal: money(item.subtotal),
				subtotalTax: money(item.subtotalTax),
				total: money(item.total),
				totalTax: money(item.totalTax),
				imageUrl: imageUrl(item.image?.src),
			})),
		fees: (source.feeLines ?? [])
			.filter((line) => line.name !== null)
			.map((line) => ({
				name: text(line.name),
				total: money(line.total),
				totalTax: money(line.totalTax),
			})),
		shipping: (source.shippingLines ?? [])
			.filter((line) => line.methodId !== null)
			.map((line) => ({
				name: text(line.name),
				total: money(line.total),
				totalTax: money(line.totalTax),
			})),
		totals: {
			subtotal: money(totals.subtotal),
			subtotalTax: money(totals.subtotalTax),
			discount: money(totals.discount),
			discountTax: money(totals.discountTax),
			fee: money(totals.fee),
			feeTax: money(totals.feeTax),
			shipping: money(totals.shipping),
			shippingTax: money(totals.shippingTax),
			tax: money(totals.tax),
			total: money(totals.total),
		},
	};
}
