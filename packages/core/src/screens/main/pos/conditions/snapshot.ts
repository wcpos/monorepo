import { isMiscProductLine, wooMetaCarrier } from '@wcpos/sync-core';

import { type ConditionRule, type ConditionSnapshot, evaluateConditions } from './evaluate';
import { netLineQuantity, type StockFields } from '../hooks/stock-guard';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type Read = (kind: 'product' | 'variation', id: number) => Promise<unknown>;

// Product lines (not misc, not retired), each net of the stock it already took (`_reduced_stock`,
// on a reopened order, as the server's validator skips it), and their records via the add guard's read.
export async function buildConditionSnapshot(
	lineItems: readonly LineItem[],
	read: Read
): Promise<ConditionSnapshot> {
	const lines = lineItems
		.filter((line) => line.product_id != null && !isMiscProductLine(line))
		.map((line) => ({
			uuid: wooMetaCarrier.lineUuid(line) ?? '',
			productId: line.product_id!,
			variationId: line.variation_id ?? 0,
			quantity: netLineQuantity(line),
			name: line.name ?? '',
		}))
		.filter((line) => line.quantity > 0);
	const stock: ConditionSnapshot['stock'] = {};
	const keys = new Set(lines.map((line) => `${line.productId}:${line.variationId}`));
	await Promise.all(
		[...keys].map(async (key) => {
			const [productId, variationId] = key.split(':').map(Number);
			const product = (await read('product', productId)) as StockFields | null;
			const variation = variationId
				? ((await read('variation', variationId)) as StockFields | null)
				: null;
			stock[key] = product && (!variationId || variation) ? { product, variation } : null;
		})
	);
	return { lines, stock };
}

/** Counted inside a tender's queue slot (on the record a queued write left), and live by the cart. */
export async function countConditionsInSlot(
	record: { getLatest(): { payload: { line_items?: LineItem[] | null } } },
	ctx: { read: { catalog: Read } },
	rules: readonly ConditionRule[]
) {
	if (!rules.some((rule) => rule.enabled)) return [];
	const lineItems = record.getLatest().payload.line_items ?? [];
	return evaluateConditions(await buildConditionSnapshot(lineItems, ctx.read.catalog), rules);
}
