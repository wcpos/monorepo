import * as React from 'react';

import { useQueryRuntime } from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';
import type { CouponContext, CouponInput, LineItemInput } from '@wcpos/order-math';

import {
	readEngineCategories,
	readEngineCoupons,
	readEngineProductRecordsByWooId,
} from './engine-coupon-data';
import { buildCategoryParents } from './coupon-helpers-engine';

function isDiscountType(value: unknown): value is CouponInput['discount_type'] {
	return value === 'percent' || value === 'fixed_cart' || value === 'fixed_product';
}

/** Assemble settle's prefetched coupon inputs without pre-enriching product categories. */
export const useCouponContext = () => {
	const runtime = useQueryRuntime();

	const getCouponContext = React.useCallback(
		async (lineItems: readonly LineItemInput[]): Promise<CouponContext> => {
			const productIds = lineItems
				.map((item) => item.product_id)
				.filter((id): id is number => id != null);
			const [couponRecords, productRecords, categoryRecords] = await Promise.all([
				readEngineCoupons(runtime),
				readEngineProductRecordsByWooId(runtime, productIds),
				readEngineCategories(runtime),
			]);

			const coupons = new Map<string, CouponInput>();
			for (const record of couponRecords) {
				const payload = record.payload;
				if (typeof payload.code !== 'string' || !isDiscountType(payload.discount_type)) continue;
				coupons.set(payload.code.toLowerCase(), {
					...payload,
					code: payload.code,
					discount_type: payload.discount_type,
					amount: payload.amount || '0',
				});
			}

			const productCategories = new Map<number, { id: number }[]>();
			for (const record of productRecords) {
				if (record.remoteId === null) continue;
				const categories = (record.payload.categories || [])
					.map((category) => category.id)
					.filter((id): id is number => typeof id === 'number')
					.map((id) => ({ id }));
				productCategories.set(wooIdOf(record.remoteId), categories);
			}

			const categoryParents = buildCategoryParents(categoryRecords);

			return { coupons, productCategories, categoryParents };
		},
		[runtime]
	);

	return { getCouponContext };
};
