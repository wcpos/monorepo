import * as React from 'react';

import pick from 'lodash/pick';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
// import Tooltip from '@wcpos/components/src/tooltip';

import { t } from '../../../../../lib/translations';
import EditForm from '../../../components/edit-form';

interface EditShippingLineProps {
	item: import('@wcpos/database').ShippingLineDocument;
}

/**
 *
 */
const EditButton = ({ item }: EditShippingLineProps) => {
	const [opened, setOpened] = React.useState(false);

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...item.collection.schema.jsonSchema,
			properties: pick(item.collection.schema.jsonSchema.properties, [
				'method_title',
				'method_id',
				// 'instance_id',
				'total',
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
			method_title: {
				'ui:label': t('Shipping Method Title', { _tags: 'core' }),
			},
			method_id: {
				'ui:label': t('Shipping Method ID', { _tags: 'core' }),
			},
			// instance_id: {
			// 	'ui:label': t('ID', { _tags: 'core' }),
			// },
			total: {
				'ui:label': t('Total', { _tags: 'core' }),
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
				title={t('Edit {name}', { _tags: 'core', name: item.method_title })}
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
