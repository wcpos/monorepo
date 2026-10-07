import { foldSearchText } from '@wcpos/sync-core';

import type { LegacyCollectionName } from './engine-adapter/collection-map';

/**
 * The searchable fields of every collection and the ONE fold that turns a record into its
 * search row (#2411). The blob (`search-blob.ts`) is the only reader; the projection read and
 * the change-event path both hand it a legacy-shaped snapshot and get the same row text back,
 * so what a cold load indexes and what a live write indexes can never differ.
 *
 * Field names are legacy flattened spellings resolved against `legacySearchSnapshot`. A
 * segment that lands on an array maps over it: `line_items.name` is every line's name.
 *
 * Audited 2026-10-07 (table on #2411): company and phone already searched; the additions are
 * order line items (name as sold + sku, the barcode-scan case), the shipping recipient on
 * orders and customers (click-and-collect orders are looked up by the recipient, not the
 * payer) and customer tax IDs (the server already matches them). The server's
 * `Collection_Rules` is the authority for this list; until the plugin publishes it on the
 * status payload this table is the mirror, pinned by `search-fields.test.ts`.
 */
export const SEARCH_FIELDS = {
	products: ['name', 'sku', 'barcode'],
	variations: ['sku', 'barcode'],
	orders: [
		'number',
		'billing.first_name',
		'billing.last_name',
		'billing.email',
		'billing.company',
		'billing.phone',
		'shipping.first_name',
		'shipping.last_name',
		'shipping.company',
		'shipping.phone',
		'line_items.name',
		'line_items.sku',
	],
	customers: [
		'first_name',
		'last_name',
		'email',
		'username',
		'billing.first_name',
		'billing.last_name',
		'billing.email',
		'billing.company',
		'billing.phone',
		'shipping.first_name',
		'shipping.last_name',
		'shipping.company',
		'shipping.phone',
		'tax_ids.value',
	],
	'products/categories': ['name'],
	'products/tags': ['name'],
	'products/brands': ['name'],
	coupons: ['code', 'description'],
} as const satisfies Partial<Record<LegacyCollectionName, readonly string[]>>;

export type SearchFieldCollection = keyof typeof SEARCH_FIELDS;

export function searchFieldsFor(collection: LegacyCollectionName): readonly string[] | undefined {
	return (SEARCH_FIELDS as Partial<Record<LegacyCollectionName, readonly string[]>>)[collection];
}

/**
 * Every leaf value at a dotted path, mapping over arrays met on the way. `undefined`/`null`
 * leaves and non-scalar leaves (an object where a string was expected) contribute nothing:
 * the row must never carry `[object Object]`.
 */
export function valuesAtPath(record: unknown, path: string): string[] {
	const segments = path.split('.');
	let current: unknown[] = [record];
	for (const segment of segments) {
		const next: unknown[] = [];
		for (const value of current) {
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item && typeof item === 'object')
						next.push((item as Record<string, unknown>)[segment]);
				}
			} else if (value && typeof value === 'object') {
				next.push((value as Record<string, unknown>)[segment]);
			}
		}
		current = next;
	}
	return current
		.flatMap((leaf) => {
			if (Array.isArray(leaf)) return leaf.filter(isScalar).map(String);
			return isScalar(leaf) ? [String(leaf)] : [];
		})
		.filter((value) => value !== '');
}

function isScalar(value: unknown): value is string | number | boolean {
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * A phone field also contributes its digits: "0412 345 678", "+61 412-345-678" and
 * "(04) 1234 5678" are one number to a cashier, who types `0412`. The raw value stays in
 * the row too, so a stored "+61..." still matches a typed "+61". The server lane applies
 * the same digits compare on its `*_phone` columns (#2411).
 */
export function isPhoneField(field: string): boolean {
	return field === 'phone' || field.endsWith('.phone');
}

export function phoneDigits(value: string): string {
	return value.replace(/\D+/g, '');
}

/** The folded search row of one record: every field's values, phones also as digits. */
export function searchRowText(fields: readonly string[], snapshot: unknown): string {
	const parts: string[] = [];
	for (const field of fields) {
		const values = valuesAtPath(snapshot, field);
		parts.push(...values);
		if (isPhoneField(field)) {
			for (const value of values) {
				const digits = phoneDigits(value);
				if (digits && digits !== value) parts.push(digits);
			}
		}
	}
	return foldSearchText(parts.join(' '));
}
