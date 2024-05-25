import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import { useT } from '../../../../../contexts/translations';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import { useCollection } from '../../../hooks/use-collection';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';
import { getMetaDataValueByKey } from '../../hooks/utils';

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['line_items'][number];
	onClose?: () => void;
}

/**
 *
 */
export const EditLineItemModal = ({ uuid, item, onClose }: Props) => {
	const t = useT();
	const { collection } = useCollection('orders');
	const { updateLineItem } = useUpdateLineItem();

	/**
	 * We need to add the tax_status as a field for the Edit form
	 */
	const json = React.useMemo(() => {
		const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
		const { tax_status } = JSON.parse(posData);
		return { ...item, tax_status: tax_status === 'taxable' };
	}, [item]);

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
			'tax_status', // Insert tax_status before tax_class
			'tax_class',
			// 'subtotal',
			// 'subtotal_tax',
			// 'total',
			// 'total_tax',
			// 'taxes',
			'meta_data',
		];

		const properties = {
			...pick(lineItemSchema, fields),
			tax_status: { type: 'boolean' },
		};

		// Ensure the order is correct by explicitly setting it after spreading
		return {
			properties: {
				sku: properties.sku,
				tax_status: properties.tax_status,
				tax_class: properties.tax_class,
				meta_data: properties.meta_data,
			},
			title: null,
			description: null,
		};
	}, [collection]);

	/**
	 *
	 */
	return (
		<Modal
			title={t('Edit {name}', { _tags: 'core', name: item.name })}
			size="large"
			opened
			onClose={onClose}
		>
			<EditFormWithJSONTree
				json={json}
				onChange={({ changes }) => updateLineItem(uuid, changes)}
				schema={schema}
				uiSchema={{
					'ui:rootFieldId': 'line_item',
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
					tax_status: {
						'ui:label': t('Taxable', { _tags: 'core' }),
					},
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
					meta_data: {
						'ui:collapsible': 'closed',
						'ui:title': t('Meta Data', { _tags: 'core' }),
						'ui:description': null,
					},
				}}
			/>
		</Modal>
	);
};

/**
 *
 */
export const EditButton = ({ uuid, item }: Props) => {
	const [opened, setOpened] = React.useState(false);

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
			{opened && <EditModal uuid={uuid} item={item} onClose={() => setOpened(false)} />}
		</>
	);
};
