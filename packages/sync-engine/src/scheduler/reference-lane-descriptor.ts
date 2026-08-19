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

export const DEFAULT_REFERENCE_LANE_DESCRIPTOR = { orderby: 'id', order: 'asc' } as const;

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
	descriptor: ReferenceLaneDescriptor<C> = DEFAULT_REFERENCE_LANE_DESCRIPTOR
): string {
	const legacyKey = `${collection}:all`;
	return descriptor.orderby === 'id' && descriptor.order === 'asc'
		? legacyKey
		: `${legacyKey}:orderby=${descriptor.orderby}:order=${descriptor.order}`;
}

export function parseReferenceLaneQueryKey(key: string): ParsedReferenceLaneQueryKey | null {
	const match = /^(categories|tags|brands|coupons):all(?::orderby=([^:]+):order=(asc|desc))?$/.exec(
		key
	);
	if (!match) return null;
	const collection = match[1] as ReferenceCollection;
	const orderby = match[2] ?? 'id';
	const order = (match[3] ?? 'asc') as ReferenceLaneOrder;
	if (orderby === 'id' && order === 'asc' && match[2] !== undefined) return null;
	if (collection === 'coupons' && isCouponReferenceOrderby(orderby)) {
		return { collection, descriptor: { orderby, order } };
	}
	if (collection !== 'coupons' && isTermReferenceOrderby(orderby)) {
		return { collection, descriptor: { orderby, order } };
	}
	return null;
}
