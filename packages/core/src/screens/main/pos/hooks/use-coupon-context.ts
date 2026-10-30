import * as React from 'react';

import { firstValueFrom } from 'rxjs';

import {
	type EngineRecord,
	observeCatalogByWooIds,
	readCouponCatalog,
	useQueryRuntime,
} from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';
import type { CouponContext, CouponInput, LineItemInput, TaxStatus } from '@wcpos/order-math';

import { quickDiscountCouponInput, readQuickDiscountIntent } from './quick-discount';
type QueryRuntime = ReturnType<typeof useQueryRuntime>;
type CouponLine = import('@wcpos/query').OrderCouponLine;

export async function readCatalogTaxStatuses(
	engine: QueryRuntime['engine'],
	lines: readonly LineItemInput[]
): Promise<(line: LineItemInput) => TaxStatus | undefined> {
	const { products, variations, available } = await firstValueFrom(
		observeCatalogByWooIds(engine, {
			productIds: lines.map((line) => line.product_id),
			variationIds: lines.map((line) => line.variation_id),
		})
	);
	const key = (line: LineItemInput) =>
		JSON.stringify([line.product_id ?? 0, line.variation_id ?? 0]);
	const statuses = new Map<string, TaxStatus | undefined>();
	const status = (
		records: readonly (EngineRecord<'products'> | EngineRecord<'variations'>)[],
		id: number | null | undefined
	): TaxStatus | undefined =>
		(records.find((record) => record.remoteId !== null && wooIdOf(record.remoteId) === id)?.payload
			.tax_status as TaxStatus | '' | undefined) || undefined;
	if (available)
		for (const line of lines) {
			// A variation inherits its parent's status when it has none or is not resident yet.
			const own = (line.variation_id ?? 0) > 0 ? status(variations, line.variation_id) : undefined;
			statuses.set(key(line), own ?? status(products, line.product_id));
		}
	return (line) => statuses.get(key(line));
}

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
		lineItems: readonly LineItemInput[];
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

	return {
		coupons,
		productCategories,
		categoryParents,
		taxStatusFor: await readCatalogTaxStatuses(runtime.engine, lineItems),
	};
}

export const useCouponContext = () => {
	const runtime = useQueryRuntime();
	const getCouponContext = React.useCallback(
		(lineItems: readonly LineItemInput[], couponLines: readonly CouponLine[] = []) =>
			readCouponContext(runtime, { lineItems, couponLines }),
		[runtime]
	);
	return { getCouponContext };
};
