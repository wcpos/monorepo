import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import { useT } from '../../../../../contexts/translations';
import { EditForm } from '../../../components/edit-json-form';
import { useCollection } from '../../../hooks/use-collection';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

interface EditLineItemProps {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['line_items'][number];
}

/**
 *
 */
const EditButton = ({ uuid, item }: EditLineItemProps) => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();
	const { collection } = useCollection('orders');
	const { updateLineItem } = useUpdateLineItem();

	/**
	 * Get schema for line item
	 */
	const schema = React.useMemo(() => {
		const lineItemSchema = get(
			collection,
			'schema.jsonSchema.properties.line_items.items.properties'
		);
		const fields = [
			// 'name',
			'sku',
			// 'price',
			// 'quantity',
			'tax_class',
			// 'subtotal',
			// 'subtotal_tax',
			// 'total',
			// 'total_tax',
			// 'taxes',
			// 'meta_data',
		];
		return {
			properties: pick(lineItemSchema, fields),
			title: null,
			description: null,
		};
	}, [collection]);

	/**
	 *
	 */
	return (
		<>
			<Icon
				name="ellipsisVertical"
				onPress={() => setOpened(true)}
				// tooltip={t('Edit', { _tags: 'core' })}
			/>
			{opened && (
				<Modal
					title={t('Edit {name}', { _tags: 'core', name: item.name })}
					size="large"
					opened
					onClose={() => setOpened(false)}
				>
					<EditForm
						json={item}
						onChange={({ changes }) => updateLineItem(uuid, changes)}
						schema={schema}
						uiSchema={{
							'ui:title': null,
							'ui:description': null,
							// name: {
							// 	'ui:label': t('Name', { _tags: 'core' }),
							// },
							sku: {
								'ui:label': t('SKU', { _tags: 'core' }),
							},
							// price: {
							// 	'ui:label': t('Price', { _tags: 'core' }),
							// },
							// quantity: {
							// 	'ui:label': t('Quantity', { _tags: 'core' }),
							// },
							tax_class: {
								'ui:label': t('Tax Class', { _tags: 'core' }),
							},
							// subtotal: {
							// 	'ui:label': t('Subtotal', { _tags: 'core' }),
							// },
							// taxes: {
							// 	'ui:collapsible': 'closed',
							// 	'ui:title': t('Taxes', { _tags: 'core' }),
							// 	'ui:description': null,
							// },
							// meta_data: {
							// 	'ui:collapsible': 'closed',
							// 	'ui:title': t('Meta Data', { _tags: 'core' }),
							// 	'ui:description': null,
							// },
						}}
					/>
				</Modal>
			)}
		</>
	);
};

export default EditButton;
