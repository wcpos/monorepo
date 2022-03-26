import * as React from 'react';
import {
	retrieveSchema,
	toIdSchema,
	getDefaultFormState,
	isFixedItems,
	allowAdditionalItems,
	getDefaultRegistry,
} from '../../form.helpers';
import { ArrayItemField } from './array-item-field';
import { DefaultArrayFieldTemplate } from './default-array-field-template';
import {
	canAddItem,
	generateRowId,
	generateKeyedFormData,
	keyedToPlainFormData,
} from './array.helpers';

/**
 *
 */
export function NormalArray<T extends object>({
	schema,
	uiSchema,
	errorSchema,
	idSchema,
	name,
	required,
	disabled,
	readonly,
	hideError,
	autofocus,
	registry = getDefaultRegistry(),
	onBlur,
	onFocus,
	idPrefix,
	idSeparator,
	rawErrors,
	onChange,
	...props
}: import('../../types').FieldProps<T>): React.ReactElement {
	const title = schema.title === undefined ? name : schema.title;
	const { ArrayFieldTemplate, rootSchema, fields, formContext } = registry;
	const { TitleField, DescriptionField } = fields;
	const [keyedFormData, setKeyFormData] = React.useState(generateKeyedFormData(props.formData));

	const itemsSchema = retrieveSchema(schema.items, rootSchema);
	const formData = keyedToPlainFormData(keyedFormData);

	const getNewFormDataRow = () => {
		let itemSchema = schema.items;
		if (isFixedItems(schema) && allowAdditionalItems(schema)) {
			itemSchema = schema.additionalItems;
		}
		return getDefaultFormState(itemSchema, undefined, rootSchema);
	};

	const onAddClick = () => {
		const { onChange } = props;
		const newKeyedFormDataRow = {
			key: generateRowId(),
			item: getNewFormDataRow(),
		};

		const newKeyedFormData = [...keyedFormData, newKeyedFormDataRow];
		setKeyFormData(newKeyedFormData);
		// this.setState(
		// 	{
		// 		keyedFormData: newKeyedFormData,
		// 		updatedKeyedFormData: true,
		// 	},
		// 	() => onChange(keyedToPlainFormData(newKeyedFormData))
		// );
	};

	const arrayProps = {
		canAdd: canAddItem(formData, schema, uiSchema),
		items: keyedFormData.map((keyedItem, index) => {
			const { key, item } = keyedItem;
			const itemSchema = retrieveSchema(schema.items, rootSchema, item);
			const itemErrorSchema = errorSchema ? errorSchema[index] : undefined;
			const itemIdPrefix = `${idSchema.$id}_${index}`;
			const itemIdSchema = toIdSchema(
				itemSchema,
				itemIdPrefix,
				rootSchema,
				item,
				idPrefix,
				idSeparator
			);
			return ArrayItemField({
				key,
				index,
				canMoveUp: index > 0,
				canMoveDown: index < formData.length - 1,
				itemSchema,
				itemIdSchema,
				itemErrorSchema,
				itemData: item,
				itemUiSchema: uiSchema.items,
				autofocus: autofocus && index === 0,
				onBlur,
				onFocus,
				registry,
				uiSchema,
				formData,
				onChange,
				disabled,
				readonly,
			});
		}),
		// className: `field field-array field-array-of-${itemsSchema.type}`,
		DescriptionField,
		disabled,
		idSchema,
		uiSchema,
		onAddClick,
		readonly,
		hideError,
		required,
		schema,
		title,
		TitleField,
		formContext,
		formData,
		rawErrors,
		registry,
	};

	// Check if a custom render function was passed in
	const Component =
		uiSchema['ui:ArrayFieldTemplate'] || ArrayFieldTemplate || DefaultArrayFieldTemplate;
	return <Component {...arrayProps} />;
}
