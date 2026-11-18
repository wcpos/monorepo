import {
	aggregateExistingCartQuantity,
	evaluateStockForCartChange,
	type StockFields,
} from '../hooks/stock-guard';

// A condition is a rule, data not code (roadmap#62); the kinds are a closed first-party list. Reserved
// for consumers under roadmap#226: note {}, line-meta { keys }, min-total { minor }, customer {}.
export type ConditionRule =
	| { id: 'stock'; kind: 'stock'; enabled: boolean }
	| { id: 'total'; kind: 'total'; enabled: boolean };
export type StockFacts = { product: StockFields; variation: StockFields | null };
export type ConditionSnapshot = {
	// stock is keyed `${productId}:${variationId}`; `null` when the local catalog does not hold it.
	lines: { uuid: string; productId: number; variationId: number; quantity: number; name: string }[];
	stock: Record<string, StockFacts | null>;
	/** What Checkout pays (`getNetPaymentTotal`), when the snapshot judges the total. */
	total?: number;
};
export type UnmetCondition =
	| {
			id: 'stock';
			reasonKey: 'pos_cart.only_n_available' | 'pos_products.out_of_stock';
			params: { quantity: number; name: string } | { name: string }; // the strings' own names
			lineUuid: string;
			fix: 'reduce' | 'remove';
			available: number | null;
	  }
	// The whole cart, not a line: no line to reach, nothing the row itself can fix.
	| {
			id: 'total';
			reasonKey: 'pos.checkout_negative_total';
			params: Record<string, never>;
			lineUuid: '';
			fix: 'none';
			available: null;
	  };

/**
 * A cart may hold a returned line (a negative quantity) only while the sale still totals 0 or
 * more; below 0 is a refund, which is Refund on the original order. Always on: no store setting
 * makes a negative sale checkable.
 */
export const conditionRules = (preventOverselling: boolean): ConditionRule[] => [
	{ id: 'stock', kind: 'stock', enabled: preventOverselling },
	{ id: 'total', kind: 'total', enabled: true },
];

export const NEGATIVE_TOTAL: UnmetCondition = {
	id: 'total',
	reasonKey: 'pos.checkout_negative_total',
	params: {},
	lineUuid: '',
	fix: 'none',
	available: null,
};

/** The total rule alone: a sale below 0 is unmet, exactly 0 is not (a fully returned swap). */
export function evaluateTotal(
	total: number | undefined,
	rules: readonly ConditionRule[]
): UnmetCondition[] {
	const enabled = rules.some((rule) => rule.kind === 'total' && rule.enabled);
	return enabled && total !== undefined && total < 0 ? [NEGATIVE_TOTAL] : [];
}

// The one pure predicate for the cart and the gate: the add guard's, per line, with the stock
// owner's other lines summed. A backorder warning is not unmet; an unknown record is. The total
// rule's row comes after the lines'.
export function evaluateConditions(
	snapshot: ConditionSnapshot,
	rules: readonly ConditionRule[]
): UnmetCondition[] {
	return [...evaluateStock(snapshot, rules), ...evaluateTotal(snapshot.total, rules)];
}

function evaluateStock(snapshot: ConditionSnapshot, rules: readonly ConditionRule[]) {
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
		const counted = available !== null && available > 0; // none left reads as out of stock
		return [
			{
				id: 'stock',
				reasonKey: counted ? 'pos_cart.only_n_available' : 'pos_products.out_of_stock',
				params: counted ? { quantity: available, name: line.name } : { name: line.name },
				lineUuid: line.uuid,
				fix: counted ? 'reduce' : 'remove',
				available,
			},
		];
	});
}
