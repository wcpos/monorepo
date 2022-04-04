import * as React from 'react';
import cloneDeep from 'lodash/cloneDeep';
import { ArrayTemplate } from '../templates/array';
import { NodeTemplate } from '../templates/node';
import {
	retrieveSchema,
	allowAdditionalItems,
	toIdSchema,
	isFixedItems,
	getDefaultFormState,
	getUiOptions,
} from '../form.helpers';
import { generateKeyedFormData, generateRowId } from './array.helpers';
import { useFormContext } from '../context';

export const FixedArray = ({ schema, formData, uiSchema, idSchema, errorSchema, onChange }) => {
	const { rootSchema } = useFormContext();

	const itemSchemas = React.useMemo(
		() => schema.items.map((item, index) => retrieveSchema(item, rootSchema, formData[index])),
		[formData, rootSchema, schema.items]
	);

	const additionalSchema = allowAdditionalItems(schema)
		? retrieveSchema(schema.additionalItems, rootSchema, formData)
		: null;

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
		let _formData = cloneDeep(formData) || [];
		if (_formData.length < itemSchemas.length) {
			// to make sure at least all fixed items are generated
			_formData = _formData.concat(new Array(itemSchemas.length - _formData.length));
		}

		const keyedFormData = generateKeyedFormData(formData);

		return keyedFormData.map((keyedItem, index) => {
			const { key, item } = keyedItem;
			const additional = index >= itemSchemas.length;
			const itemSchema = additional
				? retrieveSchema(schema.additionalItems, rootSchema, item)
				: itemSchemas[index];
			const nodeIdSchema = toIdSchema(itemSchema, `${idSchema.$id}.${index}`, rootSchema, item);
			const nodeUiSchema = additional
				? uiSchema.additionalItems || {}
				: Array.isArray(uiSchema.items)
				? uiSchema.items[index]
				: uiSchema.items || {};
			const nodeErrorSchema = errorSchema ? errorSchema[index] : undefined;

			return {
				key,
				index,
				canMoveUp: index >= itemSchemas.length + 1,
				canMoveDown: additional && index < _formData.length - 1,
				canRemove: additional,
				onReorder: handleReorder,
				onRemoveIndex: handleRemoveIndex,
				children: (
					<NodeTemplate
						schema={schema.items}
						formData={item}
						idSchema={nodeIdSchema}
						uiSchema={nodeUiSchema}
						errorSchema={nodeErrorSchema}
					/>
				),
			};
		});
	}, [
		errorSchema,
		formData,
		handleRemoveIndex,
		handleReorder,
		idSchema.$id,
		itemSchemas,
		rootSchema,
		schema.additionalItems,
		schema.items,
		uiSchema.additionalItems,
		uiSchema.items,
	]);

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
		return addable && additionalSchema;
	}, [additionalSchema, formData.length, schema.maxItems, uiSchema]);

	/**
	 *
	 */
	const handleOnAdd = React.useCallback(() => {
		const newRow = getNewFormDataRow();
		const newArray = Array.isArray(formData) ? [...formData, newRow] : [newRow];
		onChange({ [idSchema.$id]: newArray });
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
