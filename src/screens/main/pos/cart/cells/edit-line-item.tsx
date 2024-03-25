import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import { useT } from '../../../../../contexts/translations';
import { EditForm } from '../../../components/edit-json-form';
import { useCollection } from '../../../hooks/use-collection';

interface EditLineItemProps {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 *
 */
const EditButton = ({ item }: EditLineItemProps) => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();
	const { collection } = useCollection('orders');

	/**
	 * Get schema for line item
	 */
	const schema = React.useMemo(() => {
		const lineItemSchema = get(
			collection,
			'schema.jsonSchema.properties.line_items.items.properties'
		);
		const fields = [
			'name',
			'sku',
			'price',
			'quantity',
			'tax_class',
			'subtotal',
			// 'subtotal_tax',
			// 'total',
			// 'total_tax',
			'taxes',
			'meta_data',
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
	const handleChange = React.useCallback((newData) => {
		console.log(newData);
	}, []);

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
			<Modal
				title={t('Edit {name}', { _tags: 'core', name: item.name })}
				size="large"
				opened={opened}
				onClose={() => setOpened(false)}
			>
				<EditForm
					json={item}
					onChange={handleChange}
					schema={schema}
					uiSchema={{
						'ui:title': null,
						'ui:description': null,
						name: {
							'ui:label': t('Name', { _tags: 'core' }),
						},
						sku: {
							'ui:label': t('SKU', { _tags: 'core' }),
						},
						price: {
							'ui:label': t('Price', { _tags: 'core' }),
						},
						quantity: {
							'ui:label': t('Quantity', { _tags: 'core' }),
						},
						tax_class: {
							'ui:label': t('Tax Class', { _tags: 'core' }),
						},
						subtootal: {
							'ui:label': t('Subtotal', { _tags: 'core' }),
						},
						taxes: {
							'ui:collapsible': 'closed',
							'ui:title': t('Taxes', { _tags: 'core' }),
							'ui:description': null,
						},
						meta_data: {
							'ui:collapsible': 'closed',
							'ui:title': t('Meta Data', { _tags: 'core' }),
							'ui:description': null,
						},
					}}
				/>
			</Modal>
		</>
	);
};

export default EditButton;
