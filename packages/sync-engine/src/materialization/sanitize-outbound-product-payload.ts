/**
 * Sanitize the WooCommerce product COGS block without touching any other field.
 *
 * Rules, each pinned to the failure it prevents:
 *  - non-plain-object COGS and non-array `values` are left alone, avoiding a broader
 *    product-payload scrub that could hide unrelated server rejections;
 *  - entries survive only when `defined_value` is a number, preventing the
 *    echoed `null` from WooCommerce reads from returning as a number-type 400;
 *  - non-number `effective_value` and `total_value` keys are omitted because
 *    those computed/read-only number slots can carry the same invalid echo;
 *  - when no entry survives, the whole block is omitted because a product with
 *    no entered cost has no COGS value to assert.
 */
export function sanitizeOutboundProductPayload<T extends Record<string, unknown>>(payload: T): T {
	const costOfGoodsSold = payload.cost_of_goods_sold;
	if (!isPlainObject(costOfGoodsSold) || !Array.isArray(costOfGoodsSold.values)) {
		return payload;
	}

	let changed = false;
	const values: Record<string, unknown>[] = [];
	for (const entry of costOfGoodsSold.values) {
		if (!isPlainObject(entry) || typeof entry.defined_value !== 'number') {
			changed = true;
			continue;
		}
		if (Object.hasOwn(entry, 'effective_value') && typeof entry.effective_value !== 'number') {
			const { effective_value: _invalid, ...rest } = entry;
			values.push(rest);
			changed = true;
		} else {
			values.push(entry);
		}
	}

	if (values.length === 0) {
		const { cost_of_goods_sold: _empty, ...rest } = payload;
		return rest as T;
	}

	let sanitizedCostOfGoodsSold: Record<string, unknown> = costOfGoodsSold;
	if (
		Object.hasOwn(costOfGoodsSold, 'total_value') &&
		typeof costOfGoodsSold.total_value !== 'number'
	) {
		const { total_value: _invalid, ...rest } = costOfGoodsSold;
		sanitizedCostOfGoodsSold = rest;
		changed = true;
	}

	if (!changed) return payload;
	return {
		...payload,
		cost_of_goods_sold: { ...sanitizedCostOfGoodsSold, values },
	};
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
