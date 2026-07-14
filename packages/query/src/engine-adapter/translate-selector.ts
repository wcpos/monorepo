import {
	type EngineDocument,
	type LegacyCollectionName,
	readEnginePath,
	readLegacyField,
	resolveLegacyField,
} from './collection-map';

import type { MangoQuerySelector } from 'rxdb';

export type LegacyMangoSelector = Record<string, unknown>;

export class EngineAdapterSelectorError extends Error {
	public constructor(operator: string) {
		super(`Unsupported Mango operator "${operator}" in engine adapter selector`);
		this.name = 'EngineAdapterSelectorError';
	}
}

const FIELD_OPERATORS = new Set([
	'$eq',
	'$ne',
	'$gt',
	'$gte',
	'$lt',
	'$lte',
	'$in',
	'$nin',
	'$elemMatch',
	'$allMatch',
	'$not',
	'$exists',
	'$regex',
	'$options',
	'$all',
	'$size',
	'$mod',
]);

const ROOT_OPERATORS = new Set(['$and', '$or', '$not', '$nor']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}
	if (Array.isArray(left) && Array.isArray(right)) {
		return left.length === right.length && left.every((item, index) => equal(item, right[index]));
	}
	if (isRecord(left) && isRecord(right)) {
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);
		return (
			leftKeys.length === rightKeys.length &&
			leftKeys.every((key) => key in right && equal(left[key], right[key]))
		);
	}
	return false;
}

function compare(left: unknown, right: unknown): number {
	if (left === right) {
		return 0;
	}
	if (left === undefined || left === null) {
		return -1;
	}
	if (right === undefined || right === null) {
		return 1;
	}
	if (typeof left === 'number' && typeof right === 'number') {
		return left < right ? -1 : 1;
	}
	return String(left).localeCompare(String(right));
}

function includesValue(actual: unknown, expected: unknown): boolean {
	return Array.isArray(actual)
		? actual.some((item) => equal(item, expected))
		: equal(actual, expected);
}

function validateFieldCondition(condition: unknown): void {
	if (!isRecord(condition)) {
		return;
	}
	for (const [operator, operand] of Object.entries(condition)) {
		if (!operator.startsWith('$')) {
			continue;
		}
		if (!FIELD_OPERATORS.has(operator)) {
			throw new EngineAdapterSelectorError(operator);
		}
		if (operator === '$elemMatch' || operator === '$not') {
			validateFieldCondition(operand);
			if (isRecord(operand)) {
				validateSelector(operand, false);
			}
		}
		if (operator === '$allMatch' && Array.isArray(operand)) {
			operand.forEach((entry) => validateSelector(entry, false));
		}
	}
}

function validateSelector(selector: unknown, root = true): void {
	if (!isRecord(selector)) {
		return;
	}
	for (const [key, condition] of Object.entries(selector)) {
		if (key.startsWith('$')) {
			if (root && ROOT_OPERATORS.has(key)) {
				const branches = Array.isArray(condition) ? condition : [condition];
				branches.forEach((branch) => validateSelector(branch));
				continue;
			}
			if (!root && FIELD_OPERATORS.has(key)) {
				validateFieldCondition({ [key]: condition });
				continue;
			}
			throw new EngineAdapterSelectorError(key);
		}
		validateFieldCondition(condition);
	}
}

function matchesSelectorObject(actual: unknown, selector: unknown): boolean {
	if (!isRecord(selector)) {
		return equal(actual, selector);
	}
	if (Object.keys(selector).some((key) => key.startsWith('$'))) {
		return matchesFieldCondition(actual, selector);
	}
	if (!isRecord(actual)) {
		return false;
	}
	return Object.entries(selector).every(([key, condition]) =>
		matchesFieldCondition(readEnginePath(actual as EngineDocument, key), condition)
	);
}

function matchesFieldCondition(actual: unknown, condition: unknown): boolean {
	if (!isRecord(condition) || !Object.keys(condition).some((key) => key.startsWith('$'))) {
		return equal(actual, condition);
	}

	return Object.entries(condition).every(([operator, operand]) => {
		switch (operator) {
			case '$eq':
				return includesValue(actual, operand);
			case '$ne':
				return !includesValue(actual, operand);
			case '$gt':
				return compare(actual, operand) > 0;
			case '$gte':
				return compare(actual, operand) >= 0;
			case '$lt':
				return compare(actual, operand) < 0;
			case '$lte':
				return compare(actual, operand) <= 0;
			case '$in':
				return Array.isArray(operand) && operand.some((item) => includesValue(actual, item));
			case '$nin':
				return Array.isArray(operand) && !operand.some((item) => includesValue(actual, item));
			case '$exists':
				return Boolean(operand) === (actual !== undefined);
			case '$regex': {
				if (typeof actual !== 'string') {
					return false;
				}
				const flags = typeof condition.$options === 'string' ? condition.$options : undefined;
				const expression =
					operand instanceof RegExp
						? new RegExp(operand.source, flags ?? operand.flags)
						: new RegExp(String(operand), flags);
				return expression.test(actual);
			}
			case '$options':
				return true;
			case '$elemMatch':
				return Array.isArray(actual) && actual.some((item) => matchesSelectorObject(item, operand));
			case '$not':
				return !matchesFieldCondition(actual, operand);
			case '$allMatch':
				return genericAllMatch(actual, operand);
			case '$all':
				return (
					Array.isArray(actual) &&
					Array.isArray(operand) &&
					operand.every((item) => actual.some((entry) => equal(entry, item)))
				);
			case '$size':
				return Array.isArray(actual) && actual.length === Number(operand);
			case '$mod': {
				if (!Array.isArray(operand) || operand.length !== 2) {
					return false;
				}
				const numeric = Number(actual);
				const divisor = Number(operand[0]);
				return (
					Number.isFinite(numeric) && divisor !== 0 && numeric % divisor === Number(operand[1])
				);
			}
			default:
				throw new EngineAdapterSelectorError(operator);
		}
	});
}

function genericAllMatch(actual: unknown, requested: unknown): boolean {
	if (!Array.isArray(actual) || !Array.isArray(requested)) {
		return false;
	}
	return requested.every((criteria) =>
		actual.some((item) => matchesSelectorObject(item, criteria))
	);
}

function variationAllMatch(actual: unknown, requested: unknown): boolean {
	if (!Array.isArray(actual) || !Array.isArray(requested)) {
		return false;
	}
	return requested.every((criteria) => {
		if (!isRecord(criteria)) {
			return false;
		}
		const sameAttribute = actual.filter(
			(attribute) =>
				isRecord(attribute) &&
				(criteria.id === undefined || Number(attribute.id) === Number(criteria.id)) &&
				(criteria.name === undefined || String(attribute.name) === String(criteria.name))
		);
		return (
			sameAttribute.length === 0 ||
			sameAttribute.some((attribute) => matchesSelectorObject(attribute, criteria))
		);
	});
}

function legacyValue(
	collection: LegacyCollectionName,
	document: EngineDocument,
	field: string
): unknown {
	if (collection === 'variations' && field === 'attributes') {
		return document.attributes;
	}
	return readLegacyField(collection, document, field);
}

function matchesLegacySelector(
	collection: LegacyCollectionName,
	document: EngineDocument,
	selector: LegacyMangoSelector
): boolean {
	return Object.entries(selector).every(([field, condition]) => {
		if (field === '$and') {
			return (
				Array.isArray(condition) &&
				condition.every(
					(branch) => isRecord(branch) && matchesLegacySelector(collection, document, branch)
				)
			);
		}
		if (field === '$or') {
			return (
				Array.isArray(condition) &&
				condition.some(
					(branch) => isRecord(branch) && matchesLegacySelector(collection, document, branch)
				)
			);
		}
		if (field === '$not') {
			return isRecord(condition) && !matchesLegacySelector(collection, document, condition);
		}
		if (field === '$nor') {
			return (
				Array.isArray(condition) &&
				!condition.some(
					(branch) => isRecord(branch) && matchesLegacySelector(collection, document, branch)
				)
			);
		}

		const actual = legacyValue(collection, document, field);
		if (
			collection === 'variations' &&
			field === 'attributes' &&
			isRecord(condition) &&
			'$allMatch' in condition
		) {
			const remaining = Object.fromEntries(
				Object.entries(condition).filter(([operator]) => operator !== '$allMatch')
			);
			return (
				variationAllMatch(actual, condition.$allMatch) &&
				(Object.keys(remaining).length === 0 || matchesFieldCondition(actual, remaining))
			);
		}
		return matchesFieldCondition(actual, condition);
	});
}

function taxonomyMembership(condition: unknown): number | undefined {
	if (!isRecord(condition) || !isRecord(condition.$elemMatch)) {
		return undefined;
	}
	const idCondition = condition.$elemMatch.id;
	const value = isRecord(idCondition) && '$eq' in idCondition ? idCondition.$eq : idCondition;
	return typeof value === 'number' ? value : undefined;
}

function buildPrefilter(
	collection: LegacyCollectionName,
	selector: LegacyMangoSelector
): Record<string, unknown> | undefined {
	const result: Record<string, unknown> = {};

	for (const [field, condition] of Object.entries(selector)) {
		if (field === '$and') {
			if (!Array.isArray(condition)) {
				continue;
			}
			const branches = condition
				.map((branch) => (isRecord(branch) ? buildPrefilter(collection, branch) : undefined))
				.filter((branch): branch is Record<string, unknown> => branch !== undefined);
			if (branches.length > 0) {
				result.$and = branches;
			}
			continue;
		}
		if (field === '$or') {
			if (!Array.isArray(condition)) {
				continue;
			}
			const branches = condition.map((branch) =>
				isRecord(branch) ? buildPrefilter(collection, branch) : undefined
			);
			if (branches.length > 0 && branches.every((branch) => branch !== undefined)) {
				result.$or = branches;
			}
			continue;
		}
		if (field.startsWith('$')) {
			continue;
		}

		if (collection === 'products' && (field === 'categories' || field === 'brands')) {
			const membership = taxonomyMembership(condition);
			if (membership !== undefined) {
				result[field === 'categories' ? 'categoryIds' : 'brandIds'] = {
					$in: [membership],
				};
			}
			continue;
		}

		const mapping = resolveLegacyField(collection, field);
		if (
			(mapping.kind === 'promoted' || mapping.kind === 'identifier') &&
			(mapping.readEnginePath === undefined ||
				(collection === 'variations' && field === 'attributes')) &&
			!(isRecord(condition) && ('$all' in condition || '$allMatch' in condition))
		) {
			result[mapping.enginePath] = condition;
		}
	}

	return Object.keys(result).length > 0 ? result : undefined;
}

export function translateSelector(
	collection: LegacyCollectionName,
	legacyMangoSelector: LegacyMangoSelector = {}
): {
	prefilter: MangoQuerySelector<EngineDocument>;
	residual: (engineDocument: EngineDocument) => boolean;
} {
	validateSelector(legacyMangoSelector);
	const prefilter = buildPrefilter(collection, legacyMangoSelector) ?? {};
	return {
		prefilter: prefilter as MangoQuerySelector<EngineDocument>,
		residual: (engineDocument) =>
			matchesLegacySelector(collection, engineDocument, legacyMangoSelector),
	};
}
