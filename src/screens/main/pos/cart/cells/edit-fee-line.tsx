import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
// import Tooltip from '@wcpos/components/src/tooltip';

import { useT } from '../../../../../contexts/translations';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import { useCollection } from '../../../hooks/use-collection';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

interface EditFeelLineProps {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['fee_lines'][number];
}

/**
 *
 */
const EditButton = ({ uuid, item }: EditFeelLineProps) => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();
	const { collection } = useCollection('orders');
	const { updateFeeLine } = useUpdateFeeLine();

	/**
	 * Get schema for fee lines
	 */
	const schema = React.useMemo(() => {
		const feeLineSchema = get(
			collection,
			'schema.jsonSchema.properties.fee_lines.items.properties'
		);
		const fields = [
			// 'name',
			// 'total',
			// 'amount', // amount is weird, it's in the WC REST API, but always returns empty
			'tax_class',
			'tax_status',
			// 'subtotal',
			// 'subtotal_tax',
			// 'total_tax',
			// 'taxes',
			'meta_data',
		];
		return {
			properties: pick(feeLineSchema, fields),
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
					<EditFormWithJSONTree
						json={item}
						onChange={({ changes }) => updateFeeLine(uuid, changes)}
						schema={schema}
						uiSchema={{
							'ui:rootFieldId': 'fee_line',
							'ui:title': null,
							'ui:description': null,
							// name: {
							// 	'ui:label': t('Name', { _tags: 'core' }),
							// },
							// total: {
							// 	'ui:label': t('Total', { _tags: 'core' }),
							// },
							tax_class: {
								'ui:label': t('Tax Class', { _tags: 'core' }),
							},
							tax_status: {
								'ui:label': t('Tax Status', { _tags: 'core' }),
							},
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
			)}
		</>
	);
};

export default EditButton;
