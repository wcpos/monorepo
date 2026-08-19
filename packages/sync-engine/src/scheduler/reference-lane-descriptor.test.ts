import { describe, expect, it } from 'vitest';

import {
	COUPON_REFERENCE_ORDERBY_VALUES,
	parseReferenceLaneQueryKey,
	referenceLaneQueryKey,
	TERM_REFERENCE_ORDERBY_VALUES,
} from './reference-lane-descriptor';

describe('reference lane descriptor grammar', () => {
	it('round-trips every descriptor the encoder accepts', () => {
		for (const collection of ['categories', 'tags', 'brands'] as const) {
			for (const orderby of TERM_REFERENCE_ORDERBY_VALUES) {
				for (const order of ['asc', 'desc'] as const) {
					const descriptor = { orderby, order };
					expect(parseReferenceLaneQueryKey(referenceLaneQueryKey(collection, descriptor))).toEqual(
						{
							collection,
							descriptor,
						}
					);
				}
			}
		}
		for (const orderby of COUPON_REFERENCE_ORDERBY_VALUES) {
			for (const order of ['asc', 'desc'] as const) {
				const descriptor = { orderby, order };
				expect(parseReferenceLaneQueryKey(referenceLaneQueryKey('coupons', descriptor))).toEqual({
					collection: 'coupons',
					descriptor,
				});
			}
		}
	});

	// Paul's ruling 2026-08-19: the term lanes default to `name asc` — the order every
	// UI shows — spelled as the legacy key, so the flip carries ZERO key migration.
	// `id asc` survives as an ordinary non-default spelling.
	it.each(['categories', 'tags', 'brands'] as const)(
		'keeps the legacy %s key as the only spelling of the name-asc default',
		(collection) => {
			expect(referenceLaneQueryKey(collection, { orderby: 'name', order: 'asc' })).toBe(
				`${collection}:all`
			);
			expect(referenceLaneQueryKey(collection)).toBe(`${collection}:all`);
			expect(parseReferenceLaneQueryKey(`${collection}:all`)).toEqual({
				collection,
				descriptor: { orderby: 'name', order: 'asc' },
			});
			expect(parseReferenceLaneQueryKey(`${collection}:all:orderby=name:order=asc`)).toBeNull();
			expect(parseReferenceLaneQueryKey(`${collection}:all:orderby=id:order=asc`)).toEqual({
				collection,
				descriptor: { orderby: 'id', order: 'asc' },
			});
		}
	);

	it('keeps the legacy coupons key as the only spelling of the id-asc default', () => {
		expect(referenceLaneQueryKey('coupons', { orderby: 'id', order: 'asc' })).toBe('coupons:all');
		expect(referenceLaneQueryKey('coupons')).toBe('coupons:all');
		expect(parseReferenceLaneQueryKey('coupons:all')).toEqual({
			collection: 'coupons',
			descriptor: { orderby: 'id', order: 'asc' },
		});
		expect(parseReferenceLaneQueryKey('coupons:all:orderby=id:order=asc')).toBeNull();
		// name asc is a term default, NOT a coupon one — for coupons it is an
		// ordinary... not even that: coupons have no `name` orderby at all.
		expect(parseReferenceLaneQueryKey('coupons:all:orderby=name:order=asc')).toBeNull();
	});

	it('rejects unsupported and cross-collection orderby values', () => {
		expect(parseReferenceLaneQueryKey('categories:all:orderby=date:order=desc')).toBeNull();
		expect(parseReferenceLaneQueryKey('coupons:all:orderby=count:order=asc')).toBeNull();
		expect(parseReferenceLaneQueryKey('brands:all:orderby=name:order=sideways')).toBeNull();
	});
});
