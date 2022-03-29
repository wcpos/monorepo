import * as React from 'react';
import { ArrayTemplate } from '../templates/array';
import { ArrayItem } from './array-item';
import { generateKeyedFormData } from './array.helpers';
/**
 *
 */
export const NormalArray = ({ schema, uiSchema, formData }) => {
	/**
	 *
	 */
	const items = React.useMemo(() => {
		const keyedFormData = generateKeyedFormData(formData);

		return keyedFormData.map((keyedItem, index) => {
			const { key, item } = keyedItem;
			// const nodeSchema = get(props, name, {});

			return <ArrayItem key={key} item={item} />;
		});
	}, [formData]);

	/**
	 *
	 */
	return <ArrayTemplate schema={schema} uiSchema={uiSchema} items={items} />;
};
