import {
	aggregateExistingCartQuantity,
	evaluateStockForCartChange,
	type StockFields,
} from '../hooks/stock-guard';

// A condition is a rule, data not code (roadmap#62); the kinds are a closed first-party list. Reserved
// for consumers under roadmap#226: note {}, line-meta { keys }, min-total { minor }, customer {}.
export type ConditionRule = { id: 'stock'; kind: 'stock'; enabled: boolean };
export type StockFacts = { product: StockFields; variation: StockFields | null };
export type ConditionSnapshot = {
	lines: { uuid: string; productId: number; variationId: number; quantity: number; name: string }[];
	/** Keyed `${productId}:${variationId}`; `null` when the local catalog does not hold it. */
	stock: Record<string, StockFacts | null>;
};
export type UnmetCondition = {
	id: 'stock';
	reasonKey: 'pos_cart.only_n_available' | 'pos_products.out_of_stock';
	params: { quantity: number; name: string } | { name: string }; // the strings' own names
	lineUuid: string;
	fix: 'reduce' | 'remove';
	available: number | null;
};

/** The rules the cart state and the tender gate both judge by. */
export const conditionRules = (preventOverselling: boolean): ConditionRule[] => [
	{ id: 'stock', kind: 'stock', enabled: preventOverselling },
];

/**
 * The one pure predicate for the cart state and the gate: the add guard's judgement per line, with
 * the stock owner's other lines summed. A backorder warning is not unmet; an unknown record is.
 */
export function evaluateConditions(
	snapshot: ConditionSnapshot,
	rules: readonly ConditionRule[]
): UnmetCondition[] {
	if (!rules.some((rule) => rule.kind === 'stock' && rule.enabled)) return [];
	const identities = snapshot.lines.map((line) => ({
		product_id: line.productId,
		variation_id: line.variationId,
		quantity: line.quantity,
	}));
	return snapshot.lines.flatMap((line, index): UnmetCondition[] => {
		const facts = snapshot.stock[`${line.productId}:${line.variationId}`];
		const { allowed, available } = facts
			? evaluateStockForCartChange({
					...facts,
					requestedQuantity: line.quantity,
					existingCartQuantity: aggregateExistingCartQuantity({
						...facts,
						productId: line.productId,
						variationId: line.variationId,
						lineItems: identities.filter((_, other) => other !== index),
					}),
				})
			: { allowed: false, available: null };
		if (allowed) return [];
		const counted = available !== null;
		return [
			{
				id: 'stock',
				reasonKey: counted ? 'pos_cart.only_n_available' : 'pos_products.out_of_stock',
				params: counted ? { quantity: available, name: line.name } : { name: line.name },
				lineUuid: line.uuid,
				fix: counted && available > 0 ? 'reduce' : 'remove',
				available,
			},
		];
	});
}
