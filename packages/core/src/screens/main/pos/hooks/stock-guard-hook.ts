import { isMiscProductLine, MISC_PRODUCT_ID } from '@wcpos/sync-core';

import { aggregateExistingCartQuantity, evaluateStockForCartChange } from './stock-guard';
import { registerActionHook } from '../../../../extensions/actions';

import type {
	ActionContext,
	ActionEvent,
	ActionEventInput,
	ActionHook,
	ActionNext,
} from '../../../../extensions/actions';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
/** The category the hook it replaced logged under; the logs screen filters by prefix. */
const STOCK_LOG_CATEGORY = ['wcpos', 'pos', 'cart', 'stock'] as const;
type StockArgs = Omit<
	Parameters<typeof aggregateExistingCartQuantity>[0],
	'product' | 'variation'
> & {
	requestedQuantity: number;
	name?: string;
};

export async function evaluateCartStock(ctx: ActionContext, args: StockArgs) {
	const { productId, variationId = 0, requestedQuantity } = args;
	const product = await ctx.read.catalog('product', productId);
	const variation =
		product && variationId ? await ctx.read.catalog('variation', variationId) : undefined;
	const name = args.name ?? (product?.name as string | undefined) ?? '';
	const missing = !product || (variationId && !variation);
	const result = missing
		? { allowed: false, warning: null, available: null }
		: evaluateStockForCartChange({
				product,
				variation,
				requestedQuantity,
				existingCartQuantity: aggregateExistingCartQuantity({ ...args, product, variation }),
			});
	const reasonKey =
		result.available === null ? 'pos_products.out_of_stock' : 'pos_cart.only_n_available';
	const params: Record<string, string | number> =
		result.available === null ? { name } : { quantity: result.available, name };
	if (!result.allowed) {
		ctx.log(
			'warn',
			missing
				? 'Product is out of stock'
				: result.available === null
					? 'Stock check failed because availability is unknown'
					: 'Stock check found insufficient inventory',
			{
				category: STOCK_LOG_CATEGORY,
				showToast: true,
				toast: { title: ctx.t(reasonKey, params) },
				context: missing
					? { productId, variationId, reason: 'missing_stock_record' }
					: { productId, variationId, available: result.available },
			}
		);
	}
	return { ...result, name, reasonKey, params };
}

async function guardStock<E extends ActionEvent>(
	ctx: ActionContext,
	e: ActionEventInput<E>,
	next: ActionNext<E>,
	args: StockArgs
) {
	const stock = await evaluateCartStock(ctx, args);
	if (!stock.allowed)
		return {
			deny: {
				reasonKey: stock.reasonKey,
				params: stock.params,
				presented: true, // the toast above is the guard's own; the caller shows nothing more
				detail: {
					productId: args.productId,
					variationId: args.variationId,
					available: stock.available,
				},
			},
		};
	const result = await next(e);
	if (stock.warning === 'backorder')
		ctx.log('warn', 'Product will be backordered', {
			category: STOCK_LOG_CATEGORY,
			toast: { title: ctx.t('pos_cart.will_be_backordered', { name: stock.name }) },
			showToast: true,
		});
	return result;
}

/** A finite number from a number or a non-empty numeric string; null for anything else. */
function numericQuantity(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

export const stockGuardOnAdd: ActionHook<'cart.line.add'> = async (ctx, e, next) => {
	const { type, lineItems } = e.payload;
	const line = e.payload.line as LineItem;
	if (!ctx.store.preventOverselling || type !== 'line_items' || isMiscProductLine(line))
		return next(e);
	return guardStock(ctx, e, next, {
		lineItems,
		productId: line.product_id ?? MISC_PRODUCT_ID,
		variationId: line.variation_id ?? 0,
		requestedQuantity: line.quantity ?? 1,
		name: line.name,
	});
};

export const stockGuardOnUpdate: ActionHook<'cart.line.update'> = async (ctx, e, next) => {
	const { lineUuid, changes, lineItems, options } = e.payload;
	const line = e.payload.line as LineItem | null;
	// The native quantity cell hands the hook the typed text; the web one a number. The
	// guard judges the number either way (the old inline check only ran for numbers, so a
	// quantity typed on a phone skipped it). A string that is not a number is left to the
	// writer, as before.
	const requested = numericQuantity(changes.quantity);
	if (
		!ctx.store.preventOverselling ||
		options.skipStockGuard ||
		!line ||
		isMiscProductLine(line) ||
		requested === null ||
		requested <= (line.quantity ?? 0)
	)
		return next(e);
	return guardStock(ctx, e, next, {
		lineItems,
		productId: line.product_id ?? MISC_PRODUCT_ID,
		variationId: line.variation_id ?? 0,
		requestedQuantity: requested,
		excludedLineItemUuid: lineUuid,
		name: line.name,
	});
};

registerActionHook('cart.line.add', stockGuardOnAdd, { id: 'stock.guard.add', tier: 'guard' });
registerActionHook('cart.line.update', stockGuardOnUpdate, {
	id: 'stock.guard.update',
	tier: 'guard',
});
