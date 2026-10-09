import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';
import { MISC_PRODUCT_ID } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { readStockDocument } from './read-stock-document';
import {
	aggregateExistingCartQuantity,
	evaluateStockForCartChange,
	type StockFields,
	type StockGuardResult,
} from './stock-guard';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type StockDocument = StockFields & {
	id?: number;
	name?: string;
	getLatest?: () => StockDocument;
};

interface CheckCartStockArgs {
	lineItems: LineItem[];
	productId: number;
	variationId?: number;
	requestedQuantity: number;
	excludedLineItemUuid?: string;
	product?: StockDocument;
	variation?: StockDocument;
	name?: string;
}

export interface CartStockGuardResult extends StockGuardResult {
	name: string;
}

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'stock']);
const ALLOWED_RESULT: CartStockGuardResult = {
	allowed: true,
	warning: null,
	available: null,
	name: '',
};

function latest(document: StockDocument): StockDocument {
	return document.getLatest ? document.getLatest() : document;
}

export const useCartStockGuard = () => {
	const { store } = useAppState();
	const preventOverselling = useDocField(store, (value) => value.prevent_overselling);
	const runtime = useQueryRuntime();
	const t = useT();

	const checkCartStock = React.useCallback(
		async ({
			lineItems,
			productId,
			variationId = 0,
			requestedQuantity,
			excludedLineItemUuid,
			product: suppliedProduct,
			variation: suppliedVariation,
			name: suppliedName,
		}: CheckCartStockArgs): Promise<CartStockGuardResult> => {
			if (preventOverselling !== true || productId === MISC_PRODUCT_ID) {
				return { ...ALLOWED_RESULT, name: suppliedName ?? '' };
			}

			const product = suppliedProduct
				? latest(suppliedProduct)
				: await readStockDocument(runtime, 'products', productId);
			if (!product) {
				const name = suppliedName ?? '';
				cartLogger.warn('Product is out of stock', {
					showToast: true,
					toast: { title: t('pos_products.out_of_stock', { name }) },
					context: { productId, variationId, reason: 'missing_stock_record' },
				});
				return { allowed: false, warning: null, available: null, name };
			}
			const variation = variationId
				? suppliedVariation
					? latest(suppliedVariation)
					: await readStockDocument(runtime, 'variations', variationId)
				: undefined;
			const name = suppliedName ?? product.name ?? '';
			if (variationId && !variation) {
				cartLogger.warn('Product is out of stock', {
					showToast: true,
					toast: { title: t('pos_products.out_of_stock', { name }) },
					context: { productId, variationId, reason: 'missing_stock_record' },
				});
				return { allowed: false, warning: null, available: null, name };
			}
			const existingCartQuantity = aggregateExistingCartQuantity({
				lineItems,
				productId,
				variationId,
				product,
				variation,
				excludedLineItemUuid,
			});
			const result = evaluateStockForCartChange({
				product,
				variation,
				existingCartQuantity,
				requestedQuantity,
			});

			if (!result.allowed) {
				const toastTitle =
					result.available === null
						? t('pos_products.out_of_stock', { name })
						: t('pos_cart.only_n_available', { quantity: result.available, name });
				const message =
					result.available === null
						? 'Stock check failed because availability is unknown'
						: 'Stock check found insufficient inventory';
				cartLogger.warn(message, {
					showToast: true,
					toast: { title: toastTitle },
					context: { productId, variationId, available: result.available },
				});
			}

			return { ...result, name };
		},
		[preventOverselling, runtime, t]
	);

	const resolveStockOwnerId = React.useCallback(
		async (productId: number, variationId = 0) => {
			if (!variationId) return productId;
			const variation = await readStockDocument(runtime, 'variations', variationId);
			if (!variation) return variationId;
			return variation?.manage_stock === true ? variationId : productId;
		},
		[runtime]
	);

	const showBackorderWarning = React.useCallback(
		(name: string) => {
			cartLogger.warn('Product will be backordered', {
				toast: { title: t('pos_cart.will_be_backordered', { name }) },
				showToast: true,
			});
		},
		[t]
	);

	return {
		stockGuardEnabled: preventOverselling === true,
		checkCartStock,
		resolveStockOwnerId,
		showBackorderWarning,
	};
};
