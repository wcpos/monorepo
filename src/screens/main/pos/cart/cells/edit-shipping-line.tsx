import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import Modal from '@wcpos/components/src/modal';
// import Tooltip from '@wcpos/components/src/tooltip';

import { useT } from '../../../../../contexts/translations';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import { useCollection } from '../../../hooks/use-collection';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['shipping_lines'][number];
	onClose?: () => void;
}

/**
 *
 */
export const EditShippingLineModal = ({ uuid, item, onClose }: Props) => {
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
			'meta_data',
		];
		return {
			properties: pick(shippingLineSchema, fields),
		};
	}, [collection]);

	/**
	 *
	 */
	return (
		<Modal
			title={t('Edit {name}', { _tags: 'core', name: item.method_title })}
			opened
			onClose={() => setOpened(false)}
		>
			<EditFormWithJSONTree
				json={item}
				schema={schema}
				onChange={({ changes }) => updateShippingLine(uuid, changes)}
				uiSchema={{
					'ui:rootFieldId': 'shipping_line',
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
