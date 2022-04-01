import * as React from 'react';
import Box from '../../box';
import { useFormContext } from '../context';

interface ObjectTemplateProps {
	uiSchema: any;
	title?: string;
	description?: string;
	required?: boolean;
	properties: any[];
}

export const ObjectTemplate = ({
	uiSchema,
	title,
	description,
	required,
	properties,
}: ObjectTemplateProps) => {
	const { registry } = useFormContext();
	const { TitleField, DescriptionField } = registry.fields;

	return (
		<Box space="small">
			{(uiSchema['ui:title'] || title) && (
				<TitleField title={title || uiSchema['ui:title']} required={required} />
			)}
			{description && <DescriptionField description={description} />}
			{properties.map(({ content }) => content)}
		</Box>
	);
};
