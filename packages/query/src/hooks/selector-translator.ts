import get from 'lodash/get';

const MANGO_OPERATOR_KEYS = new Set(['$and', '$or', '$nor', '$not', '$elemMatch']);

type SelectorRecord = Record<string, unknown>;
type SelectorId = number | string;

const isSelectorId = (value: unknown): value is SelectorId => {
	return typeof value === 'number' || typeof value === 'string';
};

export function extractDirectElemMatchId(
	selector: SelectorRecord,
	field: string
): SelectorId | undefined {
	const id = get(selector, [field, '$elemMatch', 'id']);
	return isSelectorId(id) ? id : undefined;
}

export function extractSameFieldOrElemMatchIds(
	selector: SelectorRecord,
	field: string
): SelectorId[] {
	const andConditions = Array.isArray(selector?.$and) ? selector.$and : [];

	for (const condition of andConditions) {
		const orConditions = Array.isArray(condition?.$or) ? condition.$or : [];
		if (orConditions.length === 0) {
			continue;
		}

		const ids = orConditions.map((orClause: unknown) => get(orClause, [field, '$elemMatch', 'id']));
		if (ids.every(isSelectorId)) {
			return ids;
		}
	}

	return [];
}

export function extractSameFieldAndElemMatchIds(
	selector: SelectorRecord,
	field: string
): SelectorId[] {
	const andConditions = Array.isArray(selector?.$and) ? selector.$and : [];
	if (andConditions.length === 0) {
		return [];
	}

	const ids = andConditions.map((condition: unknown) =>
		get(condition, [field, '$elemMatch', 'id'])
	);
	return ids.every(isSelectorId) ? ids : [];
}

export function removeMangoOperatorKeys(params: SelectorRecord): SelectorRecord {
	const clean: SelectorRecord = {};
	for (const [key, value] of Object.entries(params)) {
		if (!MANGO_OPERATOR_KEYS.has(key)) {
			clean[key] = value;
		}
	}
	return clean;
}
