import type { ReferenceCollection } from '@wcpos/sync-core';

export const TERM_REFERENCE_ORDERBY_VALUES = ['id', 'name', 'slug', 'count'] as const;
export const COUPON_REFERENCE_ORDERBY_VALUES = ['id', 'date', 'title', 'modified', 'slug'] as const;

export type TermReferenceOrderby = (typeof TERM_REFERENCE_ORDERBY_VALUES)[number];
export type CouponReferenceOrderby = (typeof COUPON_REFERENCE_ORDERBY_VALUES)[number];
export type ReferenceLaneOrder = 'asc' | 'desc';
export type ReferenceLaneDescriptor<C extends ReferenceCollection = ReferenceCollection> = {
	orderby: C extends 'coupons' ? CouponReferenceOrderby : TermReferenceOrderby;
	order: ReferenceLaneOrder;
};
export type ParsedReferenceLaneQueryKey = {
	collection: ReferenceCollection;
	descriptor: ReferenceLaneDescriptor;
};

/**
 * Per-collection default sorts (Paul's ruling, 2026-08-19): the term lanes
 * default to `name asc` — the server's own default and the only order any UI
 * shows — spelled as the legacy `<collection>:all` key so the change carries
 * ZERO key migration. Coupons keep `id asc`: their grid states its date sort
 * explicitly and the picker's `code` sort has no wire mapping on v2.
 */
const TERM_DEFAULT = { orderby: 'name', order: 'asc' } as const;
const COUPON_DEFAULT = { orderby: 'id', order: 'asc' } as const;

export function defaultReferenceLaneDescriptor<C extends ReferenceCollection>(
	collection: C
): ReferenceLaneDescriptor<C> {
	return (collection === 'coupons' ? COUPON_DEFAULT : TERM_DEFAULT) as ReferenceLaneDescriptor<C>;
}

function isDefaultSort(collection: ReferenceCollection, orderby: string, order: string): boolean {
	const fallback = defaultReferenceLaneDescriptor(collection);
	return orderby === fallback.orderby && order === fallback.order;
}

export function isTermReferenceOrderby(value: unknown): value is TermReferenceOrderby {
	return (
		typeof value === 'string' &&
		(TERM_REFERENCE_ORDERBY_VALUES as readonly string[]).includes(value)
	);
}

export function isCouponReferenceOrderby(value: unknown): value is CouponReferenceOrderby {
	return (
		typeof value === 'string' &&
		(COUPON_REFERENCE_ORDERBY_VALUES as readonly string[]).includes(value)
	);
}

export function referenceLaneQueryKey<C extends ReferenceCollection>(
	collection: C,
	descriptor: ReferenceLaneDescriptor<C> = defaultReferenceLaneDescriptor(collection)
): string {
	const legacyKey = `${collection}:all`;
	return isDefaultSort(collection, descriptor.orderby, descriptor.order)
		? legacyKey
		: `${legacyKey}:orderby=${descriptor.orderby}:order=${descriptor.order}`;
}

export function parseReferenceLaneQueryKey(key: string): ParsedReferenceLaneQueryKey | null {
	const match = /^(categories|tags|brands|coupons):all(?::orderby=([^:]+):order=(asc|desc))?$/.exec(
		key
	);
	if (!match) return null;
	const collection = match[1] as ReferenceCollection;
	const fallback = defaultReferenceLaneDescriptor(collection);
	const orderby = match[2] ?? fallback.orderby;
	const order = (match[3] ?? fallback.order) as ReferenceLaneOrder;
	// One lane identity has one spelling: an explicit spelling of the default
	// sort is not a valid key (same rule as the browse-window grammar).
	if (match[2] !== undefined && isDefaultSort(collection, orderby, order)) return null;
	if (collection === 'coupons' && isCouponReferenceOrderby(orderby)) {
		return { collection, descriptor: { orderby, order } };
	}
	if (collection !== 'coupons' && isTermReferenceOrderby(orderby)) {
		return { collection, descriptor: { orderby, order } };
	}
	return null;
}
