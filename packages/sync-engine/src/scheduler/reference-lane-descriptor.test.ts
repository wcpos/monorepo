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

	it.each(['categories', 'tags', 'brands', 'coupons'] as const)(
		'keeps the legacy %s key as the only spelling of the default',
		(collection) => {
			expect(referenceLaneQueryKey(collection, { orderby: 'id', order: 'asc' })).toBe(
				`${collection}:all`
			);
			expect(parseReferenceLaneQueryKey(`${collection}:all`)).toEqual({
				collection,
				descriptor: { orderby: 'id', order: 'asc' },
			});
			expect(parseReferenceLaneQueryKey(`${collection}:all:orderby=id:order=asc`)).toBeNull();
		}
	);

	it('rejects unsupported and cross-collection orderby values', () => {
		expect(parseReferenceLaneQueryKey('categories:all:orderby=date:order=desc')).toBeNull();
		expect(parseReferenceLaneQueryKey('coupons:all:orderby=count:order=asc')).toBeNull();
		expect(parseReferenceLaneQueryKey('brands:all:orderby=name:order=sideways')).toBeNull();
	});
});
