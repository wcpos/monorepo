import * as React from 'react';

import pick from 'lodash/pick';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { EditButton } from './edit-button';
import { t } from '../../../../../../lib/translations';

interface Props {
	item: import('@wcpos/database').ShippingLineDocument;
}

export const ShippingTitle = ({ item }: Props) => {
	const methodTitle = useObservableState(item.method_title$, item.method_title);

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...item.collection.schema.jsonSchema,
			properties: pick(item.collection.schema.jsonSchema.properties, [
				'method_title',
				'method_id',
				'instance_id',
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
				<Text>{methodTitle}</Text>
			</Box>
			<Box distribution="center">
				<EditButton schema={schema} uiSchema={uiSchema} item={item} />
			</Box>
		</Box>
	);
};
