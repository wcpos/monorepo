import * as React from 'react';
import includes from 'core-js-pure/es/array/includes';

type Schema = import('json-schema').JSONSchema7;
type FieldProps = import('../../types').FieldProps;

interface ArrayFieldItemProps<T = any> extends FieldProps {
	key: string;
	index: number;
	canRemove: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	itemSchema: Schema;
	itemData: T;
	itemUiSchema: any;
	itemIdSchema: any;
	itemErrorSchema: any;
	rawErrors: any;
}

export function ArrayItemField<T = any>({
	key,
	index,
	canRemove = true,
	canMoveUp = true,
	canMoveDown = true,
	itemSchema,
	itemData,
	itemUiSchema,
	itemIdSchema,
	itemErrorSchema,
	autofocus,
	onBlur,
	onFocus,
	rawErrors,
	registry,
	uiSchema,
	formData,
	onChange,
	disabled,
	readonly,
}: ArrayFieldItemProps<T>) {
	const { SchemaField } = registry.fields;
	const { orderable, removable } = {
		orderable: true,
		removable: true,
		...uiSchema['ui:options'],
	};
	const has = {
		moveUp: orderable && canMoveUp,
		moveDown: orderable && canMoveDown,
		remove: removable && canRemove,
	};
	has.toolbar = Object.keys(has).some((key) => has[key]);

	const isItemRequired = React.useCallback((itemSchema) => {
		if (Array.isArray(itemSchema.type)) {
			// While we don't yet support composite/nullable jsonschema types, it's
			// future-proof to check for requirement against these.
			return !includes(itemSchema.type, 'null');
		}
		// All non-null array item types are inherently required by design
		return itemSchema.type !== 'null';
	}, []);

	const onChangeForIndex = React.useCallback(
		(idx) => {
			return (value, errorSchema) => {
				const newFormData = formData.map((item, i) => {
					// We need to treat undefined items as nulls to have validation.
					// See https://github.com/tdegrunt/jsonschema/issues/206
					const jsonValue = typeof value === 'undefined' ? null : value;
					return idx === i ? jsonValue : item;
				});
				onChange(
					newFormData,
					errorSchema &&
						errorSchema && {
							...errorSchema,
							[idx]: errorSchema,
						}
				);
			};
		},
		[formData, onChange]
	);

	return {
		children: (
			<SchemaField
				index={index}
				// name={`${idPrefix}${idSeparator}${index}`}
				schema={itemSchema}
				uiSchema={itemUiSchema}
				formData={itemData}
				errorSchema={itemErrorSchema}
				// idPrefix={idPrefix}
				// idSeparator={idSeparator}
				idSchema={itemIdSchema}
				required={isItemRequired(itemSchema)}
				onChange={onChangeForIndex(index)}
				onBlur={onBlur}
				onFocus={onFocus}
				registry={registry}
				disabled={disabled}
				readonly={readonly}
				// hideError={hideError}
				autofocus={autofocus}
				rawErrors={rawErrors}
			/>
		),
		disabled,
		hasToolbar: has.toolbar,
		hasMoveUp: has.moveUp,
		hasMoveDown: has.moveDown,
		hasRemove: has.remove,
		index,
		key,
		// onAddIndexClick: this.onAddIndexClick,
		// onDropIndexClick: this.onDropIndexClick,
		// onReorderClick: this.onReorderClick,
		readonly,
	};
}
