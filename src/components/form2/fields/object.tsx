import * as React from 'react';
import get from 'lodash/get';
import { ObjectTemplate } from '../templates/object';
import { orderProperties } from '../form.helpers';
import { NodeTemplate } from '../templates/node';

interface ObjectFieldProps {
	schema: import('../types').Schema;
	formData: any;
	uiSchema: any;
	idSchema: any;
}

export const ObjectField = ({ schema, formData, uiSchema, idSchema }: ObjectFieldProps) => {
	/**
	 *
	 */
	const properties = React.useMemo(() => {
		const props = get(schema, 'properties', {});
		const orderedProperties = orderProperties(Object.keys(props), uiSchema['ui:order']);

		return orderedProperties.map((name) => {
			return {
				content: (
					<NodeTemplate
						key={name}
						name={name}
						schema={get(props, name, {})}
						formData={get(formData, name, undefined)}
						uiSchema={get(uiSchema, name, {})}
						idSchema={get(idSchema, name, {})}
					/>
				),
			};
		});
	}, [formData, idSchema, schema, uiSchema]);

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
