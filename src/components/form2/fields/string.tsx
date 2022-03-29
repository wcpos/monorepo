import * as React from 'react';
import get from 'lodash/get';
import { useFormContext } from '../context';
import { isSelect, optionsList } from '../form.helpers';
import { widgetMap } from '../widgets';

interface StringFieldProps {
	schema: import('../types').Schema;
}

export const StringField = ({ schema }: StringFieldProps) => {
	const { registry } = useFormContext();
	const enumOptions = isSelect(schema) && optionsList(schema);
	const defaultWidget = enumOptions ? 'select' : 'text';

	const widget = get(widgetMap, ['string', defaultWidget]);
	const Widget = get(registry, ['widgets', widget]);

	return <Widget label={schema.title} />;
};
