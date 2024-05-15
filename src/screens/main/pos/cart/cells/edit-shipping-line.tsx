import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
// import Tooltip from '@wcpos/components/src/tooltip';

import { useT } from '../../../../../contexts/translations';
import { EditForm } from '../../../components/edit-json-form';
import { useCollection } from '../../../hooks/use-collection';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

interface EditShippingLineProps {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['shipping_lines'][number];
}

/**
 *
 */
const EditButton = ({ uuid, item }: EditShippingLineProps) => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();
	const { collection } = useCollection('orders');
	const { updateShippingLine } = useUpdateShippingLine();

	/**
	 * Get schema for fee lines
	 */
	const schema = React.useMemo(() => {
		const shippingLineSchema = get(
			collection,
			'schema.jsonSchema.properties.shipping_lines.items.properties'
		);
		const fields = [
			// 'method_title',
			'method_id',
			'instance_id',
			// 'total',
			// 'total_tax',
			// 'taxes',
			// 'meta_data',
		];
		return {
			properties: pick(shippingLineSchema, fields),
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
					title={t('Edit {name}', { _tags: 'core', name: item.method_title })}
					size="large"
					opened
					onClose={() => setOpened(false)}
				>
					<EditForm
						json={item}
						schema={schema}
						onChange={({ changes }) => updateShippingLine(uuid, changes)}
						uiSchema={{
							'ui:title': null,
							'ui:description': null,
							// method_title: {
							// 	'ui:label': t('Shipping Method Title', { _tags: 'core' }),
							// },
							method_id: {
								'ui:label': t('Shipping Method ID', { _tags: 'core' }),
							},
							instance_id: {
								'ui:label': t('Instance ID', { _tags: 'core' }),
							},
							// total: {
							// 	'ui:label': t('Total', { _tags: 'core' }),
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
