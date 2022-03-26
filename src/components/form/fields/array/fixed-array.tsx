import * as React from 'react';
import {
	retrieveSchema,
	toIdSchema,
	allowAdditionalItems,
	getDefaultRegistry,
} from '../../form.helpers';
import { ArrayItemField } from './array-item-field';
import { DefaultArrayFieldTemplate } from './default-array-field-template';
import { canAddItem, generateKeyedFormData } from './array.helpers';

/**
 *
 */
export function FixedArray<T extends object>({
	schema,
	uiSchema,
	formData,
	errorSchema,
	idPrefix,
	idSeparator,
	idSchema,
	name,
	required = getDefaultRegistry(),
	disabled,
	readonly,
	autofocus,
	registry,
	onBlur,
	onFocus,
	rawErrors,
	...props
}: import('../../types').FieldProps<T>): React.ReactElement {
	const title = schema.title || name;
	let items = props.formData;

	const { ArrayFieldTemplate, rootSchema, fields, formContext } = registry;
	const { TitleField } = fields;
	const [keyedFormData, setKeyFormData] = React.useState(generateKeyedFormData(props.formData));

	const itemSchemas = schema.items.map((item, index) =>
		retrieveSchema(item, rootSchema, formData[index])
	);
	const additionalSchema = allowAdditionalItems(schema)
		? retrieveSchema(schema.additionalItems, rootSchema, formData)
		: null;

	if (!items || items.length < itemSchemas.length) {
		// to make sure at least all fixed items are generated
		items = items || [];
		items = items.concat(new Array(itemSchemas.length - items.length));
	}

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

	// These are the props passed into the render function
	const arrayProps = {
		canAdd: canAddItem(items, schema, uiSchema) && additionalSchema,
		// className: 'field field-array field-array-fixed-items',
		disabled,
		idSchema,
		formData,
		items: keyedFormData.map((keyedItem, index) => {
			const { key, item } = keyedItem;
			const additional = index >= itemSchemas.length;
			const itemSchema = additional
				? retrieveSchema(schema.additionalItems, rootSchema, item)
				: itemSchemas[index];
			const itemIdPrefix = `${idSchema.$id}_${index}`;
			const itemIdSchema = toIdSchema(
				itemSchema,
				itemIdPrefix,
				rootSchema,
				item,
				idPrefix,
				idSeparator
			);
			const itemUiSchema = additional
				? uiSchema.additionalItems || {}
				: Array.isArray(uiSchema.items)
				? uiSchema.items[index]
				: uiSchema.items || {};
			const itemErrorSchema = errorSchema ? errorSchema[index] : undefined;

			return ArrayItemField({
				key,
				index,
				itemSchema,
				itemData: item,
				itemUiSchema,
				itemIdSchema,
				itemErrorSchema,
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
		onAddClick,
		readonly,
		required,
		schema,
		uiSchema,
		title,
		TitleField,
		formContext,
		rawErrors,
	};

	// Check if a custom template template was passed in
	const Template =
		uiSchema['ui:ArrayFieldTemplate'] || ArrayFieldTemplate || DefaultArrayFieldTemplate;
	return <Template {...arrayProps} />;
}
