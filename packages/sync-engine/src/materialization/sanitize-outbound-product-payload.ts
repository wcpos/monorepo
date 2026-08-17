/**
 * The ONE outbound sanitization for a product payload — incompatible COGS and
 * low-stock shapes removed before the payload reaches wc/v3.
 *
 * The low_stock_amount rule is pinned to a specific failure: third-party REST
 * field re-registration (for example ATUM) can emit "", which the wc/v3
 * integer|null write schema rejects, producing a 400 and an automatic revert.
 * WCPOS never edits this field, so invalid values are omitted rather than
 * replaced.
 *
 * Why it lives here and not in the UI hook that happens to build the payload:
 * a dead-lettered mutation is recovered by REBUILDING its payload from the
 * current resident record. If a sanitizer lives in the caller, the rebuild
 * skips it and reproduces the exact 400 that stranded the product edit in the
 * first place. Anything the server will permanently refuse belongs on the
 * enqueue path, where both a normal write and a requeue pass through it.
 */
export function sanitizeOutboundProductPayload<T extends Record<string, unknown>>(payload: T): T {
	let sanitizedPayload = payload;
	if (Object.prototype.hasOwnProperty.call(payload, 'low_stock_amount')) {
		const lowStockAmount = payload.low_stock_amount;
		const numericLowStockAmount =
			typeof lowStockAmount === 'string' && lowStockAmount.trim() !== ''
				? Number(lowStockAmount)
				: lowStockAmount;

		if (typeof numericLowStockAmount === 'number' && Number.isInteger(numericLowStockAmount)) {
			sanitizedPayload = { ...payload, low_stock_amount: numericLowStockAmount };
		} else if (numericLowStockAmount !== null) {
			const { low_stock_amount: _invalid, ...rest } = payload;
			sanitizedPayload = rest as T;
		}
	}

	const costOfGoodsSold = sanitizedPayload.cost_of_goods_sold;
	if (
		typeof costOfGoodsSold !== 'object' ||
		costOfGoodsSold === null ||
		Array.isArray(costOfGoodsSold) ||
		(Object.getPrototypeOf(costOfGoodsSold) !== Object.prototype &&
			Object.getPrototypeOf(costOfGoodsSold) !== null)
	) {
		return sanitizedPayload;
	}

	const rawValues = (costOfGoodsSold as Record<string, unknown>).values;
	const definedValueIsAdditive = (costOfGoodsSold as Record<string, unknown>)
		.defined_value_is_additive;
	const values: unknown[] = Array.isArray(rawValues) ? rawValues : [];
	const writableValues = values.flatMap((entry) => {
		if (typeof entry !== 'object' || entry === null) return [];
		const definedValue = (entry as Record<string, unknown>).defined_value;
		return typeof definedValue === 'number' && Number.isFinite(definedValue)
			? [{ defined_value: definedValue }]
			: [];
	});

	if (writableValues.length === 0) {
		const { cost_of_goods_sold: _readOnly, ...rest } = sanitizedPayload;
		return rest as T;
	}

	return {
		...sanitizedPayload,
		cost_of_goods_sold: {
			values: writableValues,
			...(typeof definedValueIsAdditive === 'boolean'
				? { defined_value_is_additive: definedValueIsAdditive }
				: {}),
		},
	};
}
