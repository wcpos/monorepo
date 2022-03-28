import * as React from 'react';
import get from 'lodash/get';
import Box from '../../box';
import {
	getSchemaType,
	orderProperties,
	retrieveSchema,
	getDefaultRegistry,
	canExpand,
	ADDITIONAL_PROPERTY_FLAG,
	mergeObjects,
	toIdSchema,
	getDisplayLabel,
	isSelect,
} from '../form.helpers';
import { DefaultTemplate, Help, ErrorList } from './default-template';

type Schema = import('json-schema').JSONSchema7;
type UiSchema = import('../types').UiSchema;
type IdSchema = import('../types').IdSchema;
type Fields = import('../types').Registry['fields'];

const REQUIRED_FIELD_SYMBOL = '*';
const COMPONENT_TYPES = {
	array: 'ArrayField',
	boolean: 'BooleanField',
	integer: 'NumberField',
	number: 'NumberField',
	object: 'ObjectField',
	string: 'StringField',
	null: 'NullField',
};

function getFieldComponent(schema: Schema, uiSchema: UiSchema, idSchema: IdSchema, fields: Fields) {
	const field = get(uiSchema, 'ui:field');
	if (typeof field === 'function') {
		return field;
	}
	if (typeof field === 'string' && field in fields) {
		return fields[field];
	}

	const componentName = get(COMPONENT_TYPES, getSchemaType(schema));

	// If the type is not defined and the schema uses 'anyOf' or 'oneOf', don't
	// render a field and let the MultiSchemaField component handle the form display
	if (!componentName && (schema.anyOf || schema.oneOf)) {
		return () => null;
	}

	return componentName in fields
		? fields[componentName]
		: () => {
				const { UnsupportedField } = fields;

				return (
					<UnsupportedField
						schema={schema}
						idSchema={idSchema}
						reason={`Unknown field type ${schema.type}`}
					/>
				);
		  };
}

/**
 *
 */
export function SchemaField<T extends object>({
	registry = getDefaultRegistry(),
	uiSchema = {},
	formData,
	idPrefix,
	idSeparator,
	errorSchema = {},
	idSchema: _idSchema = {},
	disabled: _disabled = false,
	readonly: _readonly = false,
	autofocus: _autofocus = false,
	hideError: _hideError = false,
	wasPropertyKeyModified = false,
	onChange,
	onKeyChange,
	onDropPropertyClick,
	required,
	...props
}: import('../types').FieldProps<T>): React.ReactElement {
	const { rootSchema, fields, formContext } = registry;
	const FieldTemplate = uiSchema['ui:FieldTemplate'] || registry.FieldTemplate || DefaultTemplate;
	const schema = retrieveSchema(props.schema, rootSchema, formData);
	const idSchema = mergeObjects(
		toIdSchema(schema, null, rootSchema, formData, idPrefix, idSeparator),
		_idSchema
	);
	const FieldComponent = getFieldComponent(schema, uiSchema, idSchema, fields);
	const { DescriptionField } = fields;
	const disabled = Boolean(_disabled || uiSchema['ui:disabled']);
	const readonly = Boolean(
		_readonly || uiSchema['ui:readonly'] || props.schema.readOnly || schema.readOnly
	);
	const uiSchemaHideError = uiSchema['ui:hideError'];
	// Set hideError to the value provided in the uiSchema, otherwise stick with the prop to propagate to children
	const hideError = uiSchemaHideError === undefined ? _hideError : Boolean(uiSchemaHideError);
	const autofocus = Boolean(_autofocus || uiSchema['ui:autofocus']);
	if (Object.keys(schema).length === 0) {
		return null;
	}

	const displayLabel = getDisplayLabel(schema, uiSchema, rootSchema);

	const { __errors, ...fieldErrorSchema } = errorSchema;

	// See #439: uiSchema: Don't pass consumed class names to child components
	const field = (
		<FieldComponent
			{...props}
			formData={formData}
			idSchema={idSchema}
			registry={registry}
			idPrefix={idPrefix}
			idSeparator={idSeparator}
			schema={schema}
			uiSchema={{ ...uiSchema, classNames: undefined }}
			disabled={disabled}
			readonly={readonly}
			hideError={hideError}
			autofocus={autofocus}
			errorSchema={fieldErrorSchema}
			formContext={formContext}
			rawErrors={__errors}
			onChange={onChange}
		/>
	);

	const id = idSchema.$id;

	// If this schema has a title defined, but the user has set a new key/label, retain their input.
	let label;
	if (wasPropertyKeyModified) {
		label = name;
	} else {
		label = uiSchema['ui:title'] || props.schema.title || schema.title || name;
	}

	const description = uiSchema['ui:description'] || props.schema.description || schema.description;
	const errors = __errors;
	const help = uiSchema['ui:help'];
	const hidden = uiSchema['ui:widget'] === 'hidden';

	const fieldProps = {
		description: (
			<DescriptionField
				id={`${id}__description`}
				description={description}
				formContext={formContext}
			/>
		),
		rawDescription: description,
		help: <Help id={`${id}__help`} help={help} />,
		rawHelp: typeof help === 'string' ? help : undefined,
		errors: hideError ? undefined : <ErrorList errors={errors} />,
		rawErrors: hideError ? undefined : errors,
		id,
		label,
		hidden,
		onChange,
		onKeyChange,
		onDropPropertyClick,
		required,
		disabled,
		readonly,
		hideError,
		displayLabel,
		formContext,
		formData,
		fields,
		schema,
		uiSchema,
		registry,
	};

	const { AnyOfField, OneOfField } = registry.fields;

	return (
		<FieldTemplate {...fieldProps}>
			<>
				{field}

				{/*
        If the schema `anyOf` or 'oneOf' can be rendered as a select control, don't
        render the selection and let `StringField` component handle
        rendering
      */}
				{schema.anyOf && !isSelect(schema) && (
					<AnyOfField
						disabled={disabled}
						readonly={readonly}
						hideError={hideError}
						errorSchema={errorSchema}
						formData={formData}
						idPrefix={idPrefix}
						idSchema={idSchema}
						idSeparator={idSeparator}
						onBlur={props.onBlur}
						onChange={props.onChange}
						onFocus={props.onFocus}
						options={schema.anyOf.map((_schema) => retrieveSchema(_schema, rootSchema, formData))}
						baseType={schema.type}
						registry={registry}
						schema={schema}
						uiSchema={uiSchema}
					/>
				)}

				{schema.oneOf && !isSelect(schema) && (
					<OneOfField
						disabled={disabled}
						readonly={readonly}
						hideError={hideError}
						errorSchema={errorSchema}
						formData={formData}
						idPrefix={idPrefix}
						idSchema={idSchema}
						idSeparator={idSeparator}
						onBlur={props.onBlur}
						onChange={props.onChange}
						onFocus={props.onFocus}
						options={schema.oneOf.map((_schema) => retrieveSchema(_schema, rootSchema, formData))}
						baseType={schema.type}
						registry={registry}
						schema={schema}
						uiSchema={uiSchema}
					/>
				)}
			</>
		</FieldTemplate>
	);
}
