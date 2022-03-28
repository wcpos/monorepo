import * as React from 'react';
import get from 'lodash/get';
import Text from '../../text';
import {
	orderProperties,
	retrieveSchema,
	getDefaultRegistry,
	canExpand,
	ADDITIONAL_PROPERTY_FLAG,
} from '../form.helpers';
import { DefaultObjectFieldTemplate } from './default-object-field-template';

/**
 *
 */
export function ObjectField<T extends object>({
	uiSchema = {},
	formData = {},
	errorSchema = {},
	idSchema = {},
	required = false,
	disabled = false,
	readonly = false,
	name,
	hideError,
	idPrefix,
	idSeparator,
	onBlur,
	onFocus,
	registry = getDefaultRegistry(),
	...props
}: import('../types').FieldProps<T>) {
	const [wasPropertyKeyModified, setWasPropertyKeyModified] = React.useState(false);
	const [additionalProperties, setAdditionalProperties] = React.useState({});

	const isRequired = (name) => {
		const { schema } = props;
		return Array.isArray(schema.required) && schema.required.indexOf(name) !== -1;
	};

	const onPropertyChange = (name, addedByAdditionalProperties = false) => {
		return (value, errorSchema) => {
			if (value === undefined && addedByAdditionalProperties) {
				// Don't set value = undefined for fields added by
				// additionalProperties. Doing so removes them from the
				// formData, which causes them to completely disappear
				// (including the input field for the property name). Unlike
				// fields which are "mandated" by the schema, these fields can
				// be set to undefined by clicking a "delete field" button, so
				// set empty values to the empty string.
				value = '';
			}
			const newFormData = { ...props.formData, [name]: value };
			console.log('onChange', newFormData);
			props.onChange(newFormData);
			// props.onChange(
			// 	newFormData,
			// 	errorSchema &&
			// 		props.errorSchema && {
			// 			...props.errorSchema,
			// 			[name]: errorSchema,
			// 		}
			// );
		};
	};

	const onDropPropertyClick = (key) => {
		return () => {
			const { onChange } = props;
			const copiedFormData = { ...formData };
			delete copiedFormData[key];
			console.log('onChange', copiedFormData);
			// onChange(copiedFormData);
		};
	};

	const getAvailableKey = (preferredKey, formData) => {
		let index = 0;
		let newKey = preferredKey;
		while (formData.hasOwnProperty(newKey)) {
			newKey = `${preferredKey}-${++index}`;
		}
		return newKey;
	};

	const onKeyChange = (oldValue) => {
		return (value, errorSchema) => {
			if (oldValue === value) {
				return;
			}

			value = getAvailableKey(value, props.formData);
			const newFormData = { ...props.formData };
			const newKeys = { [oldValue]: value };
			const keyValues = Object.keys(newFormData).map((key) => {
				const newKey = newKeys[key] || key;
				return { [newKey]: newFormData[key] };
			});
			const renamedObj = Object.assign({}, ...keyValues);

			// setWasPropertyKeyModified(true);

			console.log('onChange', renamedObj);

			// props.onChange(
			// 	renamedObj,
			// 	errorSchema &&
			// 		props.errorSchema && {
			// 			...props.errorSchema,
			// 			[value]: errorSchema,
			// 		}
			// );
		};
	};

	const getDefaultValue = (type) => {
		switch (type) {
			case 'string':
				return 'New Value';
			case 'array':
				return [];
			case 'boolean':
				return false;
			case 'null':
				return null;
			case 'number':
				return 0;
			case 'object':
				return {};
			default:
				// We don't have a datatype for some reason (perhaps additionalProperties was true)
				return 'New Value';
		}
	};

	const handleAddClick = (schema) => () => {
		let { type } = schema.additionalProperties;
		const newFormData = { ...props.formData };

		if (schema.additionalProperties.hasOwnProperty('$ref')) {
			const refSchema = retrieveSchema(
				{ $ref: schema.additionalProperties.$ref },
				registry.rootSchema,
				props.formData
			);

			type = refSchema.type;
		}

		newFormData[getAvailableKey('newKey', newFormData)] = getDefaultValue(type);

		console.log('onChange', newFormData);
		// props.onChange(newFormData);
	};

	const { rootSchema, fields, formContext } = registry;
	const { SchemaField, TitleField, DescriptionField } = fields;
	const schema = retrieveSchema(props.schema, rootSchema, formData);

	const title = schema.title === undefined ? name : schema.title;
	const description = uiSchema['ui:description'] || schema.description;
	let orderedProperties;
	try {
		const properties = Object.keys(schema.properties || {});
		orderedProperties = orderProperties(properties, uiSchema['ui:order']);
	} catch (err) {
		return (
			<div>
				<p className="config-error" style={{ color: 'red' }}>
					Invalid {name || 'root'} object field configuration:
					<em>{err.message}</em>.
				</p>
				<pre>{JSON.stringify(schema)}</pre>
			</div>
		);
	}

	const Template =
		uiSchema['ui:ObjectFieldTemplate'] ||
		registry.ObjectFieldTemplate ||
		DefaultObjectFieldTemplate;

	const templateProps = {
		title: uiSchema['ui:title'] || title,
		description,
		TitleField,
		DescriptionField,
		properties: orderedProperties.map((name) => {
			const addedByAdditionalProperties =
				schema.properties[name].hasOwnProperty(ADDITIONAL_PROPERTY_FLAG);
			const fieldUiSchema = addedByAdditionalProperties
				? uiSchema.additionalProperties
				: uiSchema[name];
			const hidden = fieldUiSchema && fieldUiSchema['ui:widget'] === 'hidden';

			return {
				content: (
					<SchemaField
						key={name}
						name={name}
						required={isRequired(name)}
						schema={schema.properties[name]}
						uiSchema={fieldUiSchema}
						errorSchema={errorSchema[name]}
						idSchema={idSchema[name]}
						idPrefix={idPrefix}
						idSeparator={idSeparator}
						formData={(formData || {})[name]}
						wasPropertyKeyModified={wasPropertyKeyModified}
						onKeyChange={onKeyChange(name)}
						onChange={onPropertyChange(name, addedByAdditionalProperties)}
						onBlur={onBlur}
						onFocus={onFocus}
						registry={registry}
						disabled={disabled}
						readonly={readonly}
						hideError={hideError}
						onDropPropertyClick={onDropPropertyClick}
					/>
				),
				name,
				readonly,
				disabled,
				required,
				hidden,
			};
		}),
		readonly,
		disabled,
		required,
		idSchema,
		uiSchema,
		schema,
		formData,
		formContext,
		registry,
	};

	return <Template {...templateProps} onAddClick={handleAddClick} />;
}
