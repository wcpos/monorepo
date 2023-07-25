import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import set from 'lodash/set';

import type { QueryState } from './use-query';

/**
 * Handle attribute selection
 * Attributes queries have the form:
 * {
 * 	selector: {
 * 		attributes: {
 * 			$allMatch: [
 * 				{
 * 					name: 'Color',
 * 					option: 'Blue',
 * 				},
 * 			],
 * 		},
 * 	}
 *
 * Note: $allMatch is an array so we need to check if it exists and add/remove to it
 */
export function updateVariationAttributeSearch(
	search: QueryState['search'] | null,
	attribute: { name: string; value: string }
) {
	// if null, remove the attribute search
	if (attribute === null) {
		return { attributes: null };
	}
	// add attribute to query
	const $allMatch = get(search, 'attributes', []);
	const index = $allMatch.findIndex((a) => a.name === attribute.name);
	if (index > -1) {
		$allMatch[index] = attribute;
	} else {
		$allMatch.push(attribute);
	}
	return { attributes: $allMatch };
}
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export const normalizeVariationAttributes = (
	attributes: {
		name: string;
		option: string;
	}[]
) => {
	if (!Array.isArray(attributes)) {
		return [];
	}

	return attributes.filter((item) => {
		if (!item.hasOwnProperty('name') || !item.hasOwnProperty('option')) return false;
		if (typeof item.name !== 'string' || typeof item.option !== 'string') return false;
		return true;
	});
};

/**
 *
 */
export const filterVariationsByAttributes = (
	result: ProductVariationDocument[],
	allMatch: { name: string; option: string }[]
) => {
	// normalize attributes
	allMatch = normalizeVariationAttributes(allMatch);

	// early return if there are no attributes to match
	if (isEmpty(allMatch)) {
		return result;
	}

	return result.filter((variation) => {
		return allMatch.every((attribute) => {
			// What to do if the variation doesn't have attributes?
			if (!variation.attributes) {
				return false;
			}

			const isAttributeInAllMatch = variation.attributes.some(
				(vAttribute) => vAttribute.name === attribute.name
			);

			// If the attribute is not present in the variation attributes, consider it as an "any" attribute
			if (!isAttributeInAllMatch) {
				return true;
			}

			return variation.attributes.some((vAttribute) => {
				return vAttribute.name === attribute.name && vAttribute.option === attribute.option;
			});
		});
	});
};
