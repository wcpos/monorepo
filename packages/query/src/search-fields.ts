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

/**
 * A field spelling that reads one entry of a record's `meta_data` array by key:
 * `meta_data:loyalty_number` is the `value` of the entry whose `key` is `loyalty_number`.
 * These come from the store, not the table: the plugin's `woocommerce_pos_search_fields`
 * filter adds meta keys to the server search, and `wcpos/v2/site` publishes the added keys
 * (`search_meta_keys`) so the till folds the same fields locally (#2411).
 */
export const META_FIELD_PREFIX = 'meta_data:';

export type SearchMetaKeys = { customers?: readonly string[]; orders?: readonly string[] };

let siteMetaKeys: SearchMetaKeys = {};
const fieldsByCollection = new Map<LegacyCollectionName, readonly string[]>();
const listeners = new Set<() => void>();

/**
 * The active site's added meta keys, from its `sites` row. Called by the app when the site
 * binds or its row changes; the computed field lists are rebuilt and subscribers (the query
 * bindings, through `useSearchFields`) re-render, so a binding that rendered before the keys
 * arrived — a direct launch into Customers, or a launch-time refresh of the site row — picks
 * them up at once rather than on its next incidental render. The blob registry is keyed by
 * field list, so the re-render yields the keyed blob.
 */
export function setSearchMetaKeys(keys: SearchMetaKeys | undefined): void {
	siteMetaKeys = keys ?? {};
	fieldsByCollection.clear();
	for (const listener of listeners) listener();
}

/** Subscribe to field-list changes (for `useSyncExternalStore`); returns the unsubscribe. */
export function subscribeSearchFields(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** The fields a collection is searched by: the pinned table plus the site's added meta keys. */
export function searchFieldsFor(collection: LegacyCollectionName): readonly string[] | undefined {
	const base = (SEARCH_FIELDS as Partial<Record<LegacyCollectionName, readonly string[]>>)[
		collection
	];
	if (!base) return undefined;
	const cached = fieldsByCollection.get(collection);
	if (cached) return cached;
	const added = (
		collection === 'customers' || collection === 'orders' ? (siteMetaKeys[collection] ?? []) : []
	).filter((key) => typeof key === 'string' && key !== '');
	const fields = added.length ? [...base, ...added.map((key) => META_FIELD_PREFIX + key)] : base;
	fieldsByCollection.set(collection, fields);
	return fields;
}

/** The record property a field reads first: `billing` for `billing.phone`, `meta_data` for a meta field. */
export function searchFieldTopSegment(field: string): string {
	return field.startsWith(META_FIELD_PREFIX) ? 'meta_data' : field.split('.')[0];
}

/**
 * Every leaf value at a dotted path, mapping over arrays met on the way. `undefined`/`null`
 * leaves and non-scalar leaves (an object where a string was expected) contribute nothing:
 * the row must never carry `[object Object]`.
 */
export function valuesAtPath(record: unknown, path: string): string[] {
	if (path.startsWith(META_FIELD_PREFIX)) {
		const key = path.slice(META_FIELD_PREFIX.length);
		const entries = (record as { meta_data?: unknown } | null)?.meta_data;
		if (!Array.isArray(entries)) return [];
		return entries
			.filter(
				(entry): entry is { key: string; value: unknown } =>
					!!entry && typeof entry === 'object' && (entry as { key?: unknown }).key === key
			)
			.map((entry) => entry.value)
			.filter(isScalar)
			.map(String)
			.filter((value) => value !== '');
	}
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
