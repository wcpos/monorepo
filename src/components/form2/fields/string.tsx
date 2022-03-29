import * as React from 'react';
import get from 'lodash/get';
import { useFormContext } from '../context';
import { isSelect, optionsList } from '../form.helpers';
import { widgetMap } from '../widgets';

interface StringFieldProps {
	schema: import('../types').Schema;
	formData: any;
	name: string;
}

export const StringField = ({ schema, formData, name }: StringFieldProps) => {
	const [value, setValue] = React.useState(formData);
	const { registry, onChange } = useFormContext();
	const enumOptions = isSelect(schema) && optionsList(schema);
	const defaultWidget = enumOptions ? 'select' : 'text';

	const widget = get(widgetMap, ['string', defaultWidget]);
	const Widget = get(registry, ['widgets', widget]);

	/**
	 * How best to handle changes?
	 * - would rather if the textinput didn't update the form data on every change
	 * - either use a ref to reach and get the value, or store temporary value in state here
	 */
	const handleOnBlur = React.useCallback(() => {
		if (onChange) {
			onChange({ [name]: value });
		}
	}, [name, onChange, value]);

	/**
	 *
	 */
	const handleOnChange = React.useCallback((text: string) => {
		setValue(text);
	}, []);

	return (
		<Widget label={schema.title} onBlur={handleOnBlur} value={value} onChange={handleOnChange} />
	);
};
