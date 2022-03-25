import { nanoid } from 'nanoid';
import { getUiOptions } from '../../form.helpers';

type Schema = import('json-schema').JSONSchema7;
type UiSchema = import('../../types').UiSchema;

/**
 *
 */
export const canAddItem = (items: any[], schema: Schema, uiSchema: UiSchema) => {
	let { addable } = getUiOptions(uiSchema);
	if (addable !== false) {
		// if ui:options.addable was not explicitly set to false, we can add
		// another item if we have not exceeded maxItems yet
		if (schema.maxItems !== undefined) {
			addable = items.length < schema.maxItems;
		} else {
			addable = true;
		}
	}
	return addable;
};

/**
 *
 */
export function generateRowId() {
	return nanoid();
}

/**
 *
 */
export function generateKeyedFormData(formData: any[]) {
	return !Array.isArray(formData)
		? []
		: formData.map((item) => {
				return {
					key: generateRowId(),
					item,
				};
		  });
}

/**
 *
 */
export function keyedToPlainFormData(keyedFormData: any[]) {
	return keyedFormData.map((keyedItem) => keyedItem.item);
}
