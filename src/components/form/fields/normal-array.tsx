import * as React from 'react';
import { ArrayTemplate } from '../templates/array';
import { NodeTemplate } from '../templates/node';
import { useFormContext } from '../context';
import { generateKeyedFormData, generateRowId } from './array.helpers';
import {
	toIdSchema,
	isFixedItems,
	allowAdditionalItems,
	getDefaultFormState,
	getUiOptions,
} from '../form.helpers';

/**
 *
 */
export const NormalArray = ({ schema, uiSchema, formData, name, idSchema }) => {
	const { registry, onChange, rootSchema } = useFormContext();

	/**
	 * @TODO - need to handle errorSchema
	 */
	const handleReorder = React.useCallback(
		(curr, next) => {
			const newArray = [...formData];
			newArray.splice(curr, 1);
			newArray.splice(next, 0, formData[curr]);
			onChange({ [idSchema.$id]: newArray });
		},
		[formData, idSchema.$id, onChange]
	);

	/**
	 * @TODO - need to handle errorSchema
	 */
	const handleRemoveIndex = React.useCallback(
		(idx) => {
			const newArray = [...formData];
			newArray.splice(idx, 1);
			onChange({ [idSchema.$id]: newArray });
		},
		[formData, idSchema.$id, onChange]
	);

	/**
	 * @TODO - do we really need to generate keys here?
	 * - if form is being controlled, we can just use the schema id?
	 */
	const items = React.useMemo(() => {
		const keyedFormData = generateKeyedFormData(formData);

		return keyedFormData.map((keyedItem, index) => {
			const { key, item } = keyedItem;
			/**
			 *  @TODO - toIdSchema function sucks, need to refactor
			 */
			const nodeIdSchema = toIdSchema(schema.items, `${idSchema.$id}.${index}`, rootSchema, item);
			const orderable = true;
			const has = {
				moveUp: orderable && index > 0,
				moveDown: orderable && index < formData.length - 1,
				// remove: removable && canRemove,
				remove: true,
				toolbar: false,
			};
			has.toolbar = Object.keys(has).some((key) => has[key]);

			return {
				key,
				index,
				hasToolbar: has.toolbar,
				hasMoveUp: has.moveUp,
				hasMoveDown: has.moveDown,
				hasRemove: has.remove,
				onReorder: handleReorder,
				onRemoveIndex: handleRemoveIndex,
				children: <NodeTemplate schema={schema.items} formData={item} idSchema={nodeIdSchema} />,
			};
		});
	}, [formData, handleRemoveIndex, handleReorder, idSchema.$id, rootSchema, schema.items]);

	/**
	 *
	 */
	const getNewFormDataRow = React.useCallback(() => {
		let itemSchema = schema.items;
		if (isFixedItems(schema) && allowAdditionalItems(schema)) {
			itemSchema = schema.additionalItems;
		}
		return getDefaultFormState(itemSchema, undefined, rootSchema);
	}, [rootSchema, schema]);

	/**
	 *
	 */
	const canAddItem = React.useMemo(() => {
		let { addable } = getUiOptions(uiSchema);
		if (addable !== false) {
			// if ui:options.addable was not explicitly set to false, we can add
			// another item if we have not exceeded maxItems yet
			if (schema.maxItems !== undefined) {
				addable = formData.length < schema.maxItems;
			} else {
				addable = true;
			}
		}
		return addable;
	}, [formData.length, schema.maxItems, uiSchema]);

	/**
	 *
	 */
	const handleOnAdd = React.useCallback(() => {
		const newRow = getNewFormDataRow();
		onChange({ [idSchema.$id]: [...formData, newRow] });
	}, [formData, getNewFormDataRow, idSchema.$id, onChange]);

	/**
	 *
	 */
	return (
		<ArrayTemplate
			schema={schema}
			uiSchema={uiSchema}
			items={items}
			canAdd={canAddItem}
			onAdd={handleOnAdd}
		/>
	);
};
