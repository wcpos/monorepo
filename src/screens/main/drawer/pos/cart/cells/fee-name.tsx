import * as React from 'react';

import pick from 'lodash/pick';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { EditButton } from './edit-button';
import { t } from '../../../../../../lib/translations';

interface Props {
	item: import('@wcpos/database').FeeLineDocument;
}

export const FeeName = ({ item }: Props) => {
	const name = useObservableState(item.name$, item.name);

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...item.collection.schema.jsonSchema,
			properties: pick(item.collection.schema.jsonSchema.properties, [
				'name',
				'tax_class',
				'tax_status',
				'total',
				'total_tax',
				'taxes',
				'meta_data',
			]),
		};
	}, [item.collection.schema.jsonSchema]);

	/**
	 *  uiSchema
	 */
	const uiSchema = React.useMemo(
		() => ({
			taxes: { 'ui:collapsible': 'closed', 'ui:title': t('Taxes', { _tags: 'core' }) },
			meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data', { _tags: 'core' }) },
		}),
		[]
	);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<Text>{name}</Text>
			</Box>
			<Box distribution="center">
				<EditButton schema={schema} uiSchema={uiSchema} item={item} />
			</Box>
		</Box>
	);
};
