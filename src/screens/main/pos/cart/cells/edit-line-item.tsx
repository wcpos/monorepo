import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import { TextInputWithLabel } from '@wcpos/components/src/textinput';

import { useT } from '../../../../../contexts/translations';
import EditForm from '../../../components/edit-form-with-json';

interface EditLineItemProps {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 *
 */
const EditButton = ({ item }: EditLineItemProps) => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();

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
					document={item}
					fields={[
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
					]}
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
