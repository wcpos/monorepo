type Selector = Record<string, unknown>;
const isObject = (value: unknown): value is Selector =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/** Recognise our explicit null-inclusive $nin branch so repeated door crossings are idempotent. */
function isNullInclusiveNin(branches: unknown): boolean {
	if (!Array.isArray(branches) || branches.length !== 2) return false;
	const [outside, missing] = branches;
	if (!isObject(outside) || !isObject(missing)) return false;
	const keys = Object.keys(outside);
	if (keys.length !== 1 || Object.keys(missing).length !== 1) return false;
	const field = keys[0];
	const nin = outside[field];
	const eq = missing[field];
	return (
		isObject(nin) &&
		Object.keys(nin).length === 1 &&
		Array.isArray(nin.$nin) &&
		isObject(eq) &&
		Object.keys(eq).length === 1 &&
		eq.$eq === null
	);
}

/** App semantics: exists means non-nullish; exclusions include rows with no value. */
export function normalizeSelectorSemantics(selector: Selector): Selector {
	const result: Selector = {};
	const extra: Selector[] = [];
	for (const [field, condition] of Object.entries(selector)) {
		if (['$and', '$or', '$nor'].includes(field) && Array.isArray(condition)) {
			result[field] =
				field === '$or' && isNullInclusiveNin(condition)
					? condition.map((branch) => ({ ...branch }))
					: condition.map((branch) => normalizeSelectorSemantics(branch));
			continue;
		}
		if (field.startsWith('$') || !isObject(condition)) {
			result[field] = condition;
			continue;
		}
		const operators: Selector = {};
		for (const [operator, operand] of Object.entries(condition)) {
			if (operator === '$exists') {
				const replacement = operand ? '$ne' : '$eq';
				if (replacement in condition) extra.push({ [field]: { [replacement]: null } });
				else operators[replacement] = null;
			} else if (operator === '$nin') {
				extra.push({ $or: [{ [field]: { $nin: operand } }, { [field]: { $eq: null } }] });
			} else {
				operators[operator] =
					operator === '$elemMatch' && isObject(operand)
						? normalizeSelectorSemantics(operand)
						: operand;
			}
		}
		if (Object.keys(operators).length || !Object.keys(condition).length) result[field] = operators;
	}
	if (!extra.length) return result;
	const parts = [...(Object.keys(result).length ? [result] : []), ...extra];
	return parts.length === 1 ? parts[0] : { $and: parts };
}
