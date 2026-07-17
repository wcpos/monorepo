import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useQueryManager } from '@wcpos/query';
import { resolveLegacyField, wrapEngineDocument } from '@wcpos/query/engine-compat';
import { getLogger } from '@wcpos/utils/logger';

import {
	aggregateExistingCartQuantity,
	evaluateStockForCartChange,
	type StockFields,
	type StockGuardResult,
} from './stock-guard';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type EngineRxDocument = Parameters<typeof wrapEngineDocument>[1];

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

function isEngineRxDocument(value: unknown): value is EngineRxDocument {
	if (value === null || typeof value !== 'object') return false;
	const candidate = value as {
		id?: unknown;
		payload?: unknown;
		getLatest?: unknown;
		collection?: unknown;
	};
	return (
		typeof candidate.id === 'string' &&
		candidate.payload !== null &&
		typeof candidate.payload === 'object' &&
		typeof candidate.getLatest === 'function' &&
		candidate.collection !== null &&
		typeof candidate.collection === 'object'
	);
}

function latest(document: StockDocument): StockDocument {
	return document.getLatest ? document.getLatest() : document;
}

export const useCartStockGuard = () => {
	const { store } = useAppState();
	const preventOverselling = useObservableEagerState(store.prevent_overselling$!);
	const manager = useQueryManager();
	const t = useT();

	const readStockDocument = React.useCallback(
		async (collectionName: 'products' | 'variations', wooId: number) => {
			const collection = manager.engine.active()?.database.collections[collectionName];
			if (!collection) return null;
			const field = resolveLegacyField(collectionName, 'id').enginePath;
			const result = await collection.findOne({ selector: { [field]: wooId } }).exec();
			return isEngineRxDocument(result)
				? (wrapEngineDocument(collectionName, result) as unknown as StockDocument)
				: null;
		},
		[manager]
	);

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
			if (preventOverselling !== true || productId === 0) {
				return { ...ALLOWED_RESULT, name: suppliedName ?? '' };
			}

			const product = suppliedProduct
				? latest(suppliedProduct)
				: await readStockDocument('products', productId);
			if (!product) {
				const name = suppliedName ?? '';
				cartLogger.warn(t('pos_products.out_of_stock', { name }), {
					showToast: true,
					context: { productId, variationId, reason: 'missing_stock_record' },
				});
				return { allowed: false, warning: null, available: null, name };
			}
			const variation = variationId
				? suppliedVariation
					? latest(suppliedVariation)
					: await readStockDocument('variations', variationId)
				: undefined;
			const name = suppliedName ?? product.name ?? '';
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
				const message =
					result.available === null
						? t('pos_products.out_of_stock', { name })
						: t('pos_cart.only_n_available', { quantity: result.available, name });
				cartLogger.warn(message, {
					showToast: true,
					context: { productId, variationId, available: result.available },
				});
			}

			return { ...result, name };
		},
		[preventOverselling, readStockDocument, t]
	);

	const showBackorderWarning = React.useCallback(
		(name: string) => {
			cartLogger.warn(t('pos_cart.will_be_backordered', { name }), {
				showToast: true,
			});
		},
		[t]
	);

	return {
		stockGuardEnabled: preventOverselling === true,
		checkCartStock,
		showBackorderWarning,
	};
};
