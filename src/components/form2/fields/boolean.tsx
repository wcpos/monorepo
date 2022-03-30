import * as React from 'react';
import get from 'lodash/get';
import { useFormContext } from '../context';
import { isSelect, optionsList } from '../form.helpers';
import { widgetMap } from '../widgets';

interface BooleanFieldProps {
	schema: import('../types').Schema;
	formData: any;
	name: string;
}

export const BooleanField = ({ schema, formData, name, idSchema }: BooleanFieldProps) => {
	const { registry, onChange } = useFormContext();

	const widget = get(widgetMap, ['boolean', 'checkbox']);
	const Widget = get(registry, ['widgets', widget]);

	/**
	 * @TODO - how to handle nested
	 */
	const handleOnChange = React.useCallback(
		(value: boolean) => {
			if (onChange) {
				onChange({ [idSchema.$id]: value });
			}
		},
		[idSchema.$id, onChange]
	);

	return <Widget label={schema.title} value={formData} onChange={handleOnChange} />;
};
