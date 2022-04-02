import * as React from 'react';
import get from 'lodash/get';
import Box from '../../box';
import Collapsible from '../../collapsible';
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

	const collapsible = get(uiSchema, 'ui:collapsible', false);
	if (collapsible) {
		return (
			<Box space="small" paddingBottom="small">
				<Collapsible
					title={<TitleField title={title || uiSchema['ui:title']} />}
					initExpand={collapsible === 'open'}
				>
					{description && <DescriptionField description={description} />}
					{properties.map(({ content }) => content)}
				</Collapsible>
			</Box>
		);
	}

	return (
		<Box space="small" paddingBottom="small">
			{(uiSchema['ui:title'] || title) && (
				<TitleField title={title || uiSchema['ui:title']} required={required} />
			)}
			{description && <DescriptionField description={description} />}
			{properties.map(({ content }) => content)}
		</Box>
	);
};
