import find from 'lodash/find';
import get from 'lodash/get';

/**
 *
 */
export const findMetaDataSelector = (obj: any, key: '_pos_user' | '_pos_store') => {
	const elemMatch = get(obj, 'selector.meta_data.$elemMatch');

	if (elemMatch) {
		if (Array.isArray(elemMatch.$and)) {
			const userCondition = find(elemMatch.$and, { key });
			return userCondition ? userCondition.value : null;
		} else if (elemMatch?.key === key) {
			return elemMatch?.value;
		}
	}

	return null;
};
