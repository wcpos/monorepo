import * as React from 'react';

import pick from 'lodash/pick';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
// import Tooltip from '@wcpos/components/src/tooltip';

import { t } from '../../../../../lib/translations';
import EditForm from '../../../components/edit-form';

interface EditLineItemProps {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 *
 */
const EditButton = ({ item }: EditLineItemProps) => {
	const [opened, setOpened] = React.useState(false);

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...item.collection.schema.jsonSchema,
			properties: pick(item.collection.schema.jsonSchema.properties, [
				'name',
				'sku',
				'price',
				'quantity',
				'tax_class',
				// 'subtotal',
				// 'subtotal_tax',
				// 'total',
				// 'total_tax',
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
		}),
		[]
	);

	/**
	 *
	 */
	return (
		<>
			<Icon
				name="ellipsisVertical"
				onPress={() => setOpened(true)}
				tooltip={t('Edit', { _tags: 'core' })}
			/>
			<Modal
				title={t('Edit {name}', { _tags: 'core', name: item.name })}
				size="large"
				opened={opened}
				onClose={() => {
					setOpened(false);
				}}
			>
				<EditForm formData={item.toMutableJSON()} schema={schema} uiSchema={uiSchema} />
			</Modal>
		</>
	);
};

export default EditButton;
