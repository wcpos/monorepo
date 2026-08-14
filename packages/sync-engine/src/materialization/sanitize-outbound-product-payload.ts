/**
 * The ONE outbound sanitization for a product payload — the read-only COGS
 * shape WooCommerce returns removed before the payload reaches wc/v3.
 *
 * Why it lives here and not in the UI hook that happens to build the payload:
 * a dead-lettered mutation is recovered by REBUILDING its payload from the
 * current resident record. If a sanitizer lives in the caller, the rebuild
 * skips it and reproduces the exact 400 that stranded the product edit in the
 * first place. Anything the server will permanently refuse belongs on the
 * enqueue path, where both a normal write and a requeue pass through it.
 */
export function sanitizeOutboundProductPayload<T extends Record<string, unknown>>(payload: T): T {
	const costOfGoodsSold = payload.cost_of_goods_sold;
	if (
		typeof costOfGoodsSold !== 'object' ||
		costOfGoodsSold === null ||
		Array.isArray(costOfGoodsSold) ||
		(Object.getPrototypeOf(costOfGoodsSold) !== Object.prototype &&
			Object.getPrototypeOf(costOfGoodsSold) !== null)
	) {
		return payload;
	}

	const rawValues = (costOfGoodsSold as Record<string, unknown>).values;
	const values: unknown[] = Array.isArray(rawValues) ? rawValues : [];
	const writableValues = values.flatMap((entry) => {
		if (typeof entry !== 'object' || entry === null) return [];
		const definedValue = (entry as Record<string, unknown>).defined_value;
		return typeof definedValue === 'number' && Number.isFinite(definedValue)
			? [{ defined_value: definedValue }]
			: [];
	});

	if (writableValues.length === 0) {
		const { cost_of_goods_sold: _readOnly, ...rest } = payload;
		return rest as T;
	}

	return { ...payload, cost_of_goods_sold: { values: writableValues } };
}
