const lineFields = [
	'line_items',
	'shipping_lines',
	'fee_lines',
	'coupon_lines',
	'tax_lines',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripMetaData(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	let changed = false;
	const stripped = value.map((entry) => {
		if (!isRecord(entry)) return entry;
		const stripKey = 'display_key' in entry && typeof entry.display_key !== 'string';
		const stripValue = 'display_value' in entry && typeof entry.display_value !== 'string';
		if (!stripKey && !stripValue) return entry;
		const clean = { ...entry };
		if (stripKey) delete clean.display_key;
		if (stripValue) delete clean.display_value;
		changed = true;
		return clean;
	});
	return changed ? stripped : value;
}

function stripLineMetaData(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	let changed = false;
	const stripped = value.map((entry) => {
		if (!isRecord(entry)) return entry;
		const metaData = stripMetaData(entry.meta_data);
		if (metaData === entry.meta_data) return entry;
		changed = true;
		return { ...entry, meta_data: metaData };
	});
	return changed ? stripped : value;
}

export function stripNonStringMetaDisplayFields<T extends Record<string, unknown>>(payload: T): T {
	let stripped: Record<string, unknown> = payload;
	const metaData = stripMetaData(payload.meta_data);
	if (metaData !== payload.meta_data) stripped = { ...stripped, meta_data: metaData };
	for (const field of lineFields) {
		const lines = stripLineMetaData(payload[field]);
		if (lines !== payload[field]) stripped = { ...stripped, [field]: lines };
	}
	return stripped as T;
}
