import * as React from 'react';

import { type EngineRecord, readCouponCatalog, useQueryRuntime } from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';
import type { CouponContext, CouponInput } from '@wcpos/order-math';

import { quickDiscountCouponInput, readQuickDiscountIntent } from './quick-discount';
type QueryRuntime = ReturnType<typeof useQueryRuntime>;
type CouponLine = import('@wcpos/query').OrderCouponLine;

function isDiscountType(value: unknown): value is CouponInput['discount_type'] {
	return value === 'percent' || value === 'fixed_cart' || value === 'fixed_product';
}

/** Build settle's raw category_id -> parent_id map from engine-backed adapter proxies. */
function buildCategoryParents(
	categoryDocuments: EngineRecord<'categories'>[]
): Map<number, number> {
	const categoryParentMap = new Map<number, number>();
	for (const document of categoryDocuments) {
		if (document.remoteId !== null && document.payload.parent != null) {
			categoryParentMap.set(wooIdOf(document.remoteId), document.payload.parent);
		}
	}
	return categoryParentMap;
}

/** Read raw CouponContext inputs; order-math owns eligibility and ancestry. */
export async function readCouponContext(
	runtime: QueryRuntime,
	{
		lineItems,
		couponLines,
	}: {
		lineItems: readonly { product_id?: number | null }[];
		couponLines: readonly CouponLine[];
	}
): Promise<CouponContext> {
	const productIds = lineItems
		.map((item) => item.product_id)
		.filter((id): id is number => id != null && id > 0);
	const {
		coupons: couponRecords,
		products: productRecords,
		categories: categoryRecords,
	} = await readCouponCatalog(runtime.engine, productIds);

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

	for (const line of couponLines) {
		const intent = readQuickDiscountIntent(line);
		if (line.code != null && intent) {
			coupons.set(line.code.toLowerCase(), quickDiscountCouponInput(line.code, intent));
		}
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
}

export const useCouponContext = () => {
	const runtime = useQueryRuntime();
	const getCouponContext = React.useCallback(
		(
			lineItems: readonly { product_id?: number | null }[],
			couponLines: readonly CouponLine[] = []
		) => readCouponContext(runtime, { lineItems, couponLines }),
		[runtime]
	);
	return { getCouponContext };
};
