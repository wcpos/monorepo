import * as React from 'react';
import get from 'lodash/get';
import { ObjectTemplate } from '../templates/object';
import { orderProperties } from '../form.helpers';
import { NodeTemplate } from '../templates/node';

interface ObjectFieldProps {
	schema: import('../types').Schema;
	formData: any;
	uiSchema: any;
}

export const ObjectField = ({ schema, formData, uiSchema }: ObjectFieldProps) => {
	/**
	 *
	 */
	const properties = React.useMemo(() => {
		const props = get(schema, 'properties', {});
		const orderedProperties = orderProperties(Object.keys(props), uiSchema['ui:order']);

		return orderedProperties.map((name) => {
			const nodeSchema = get(props, name, {});

			return {
				content: (
					<NodeTemplate
						schema={nodeSchema}
						formData={(formData || {})[name]}
						uiSchema={uiSchema[name]}
					/>
				),
			};
		});
	}, [formData, schema, uiSchema]);

	/**
	 *
	 */
	return (
		<ObjectTemplate
			title={schema.title}
			description={uiSchema['ui:description'] || schema.description}
			uiSchema={uiSchema}
			properties={properties}
		/>
	);
};
