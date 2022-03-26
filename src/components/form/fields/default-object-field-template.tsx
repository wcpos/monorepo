import * as React from 'react';
import Box from '../../box';
import Button from '../../button';
import { canExpand } from '../form.helpers';

export const DefaultObjectFieldTemplate = (props) => {
	const { TitleField, DescriptionField } = props;
	return (
		<Box>
			{(props.uiSchema['ui:title'] || props.title) && (
				<TitleField
					id={`${props.idSchema.$id}__title`}
					title={props.title || props.uiSchema['ui:title']}
					required={props.required}
					formContext={props.formContext}
				/>
			)}
			{props.description && (
				<DescriptionField
					id={`${props.idSchema.$id}__description`}
					description={props.description}
					formContext={props.formContext}
				/>
			)}
			{props.properties.map((prop) => prop.content)}
			{canExpand(props.schema, props.uiSchema, props.formData) && (
				<Button
					onPress={props.onAddClick(props.schema)}
					disabled={props.disabled || props.readonly}
				/>
			)}
		</Box>
	);
};
