import * as React from 'react';

import Modal from '@wcpos/components/src/modal';

import { useT } from '../../../../../contexts/translations';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import { useTaxRates } from '../../../contexts/tax-rates';
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
	const { updateLineItem } = useUpdateLineItem();
	const { taxClasses } = useTaxRates();

	/**
	 * We need to add the tax_status as a field for the Edit form
	 */
	const json = React.useMemo(() => {
		const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
		const { tax_status } = JSON.parse(posData);
		return { ...item, tax_status, tax_class: item.tax_class || 'standard' };
	}, [item]);

	/**
	 * Get schema for fee lines
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				// name: { type: 'string', title: t('Fee Name', { _tags: 'core' }) },
				sku: { type: 'string', title: t('SKU', { _tags: 'core' }) },
				tax_status: {
					type: 'string',
					title: t('Tax Status', { _tags: 'core' }),
					enum: ['taxable', 'none'],
					default: 'taxable',
				},
				tax_class: {
					type: 'string',
					title: t('Tax Class', { _tags: 'core' }),
					enum: taxClasses,
					default: taxClasses.includes('standard') ? 'standard' : taxClasses[0],
				},
				meta_data: {
					type: 'array',
					title: t('Meta Data', { _tags: 'core' }),
					items: {
						type: 'object',
						properties: {
							id: {
								description: t('Meta ID', { _tags: 'core' }),
								type: 'integer',
							},
							key: {
								description: t('Meta key', { _tags: 'core' }),
								type: 'string',
							},
							value: {
								description: t('Meta value', { _tags: 'core' }),
								type: 'string',
							},
							display_key: {
								description: t('Display key', { _tags: 'core' }),
								type: 'string',
							},
							display_value: {
								description: t('Display value', { _tags: 'core' }),
								type: 'string',
							},
						},
					},
				},
			},
		}),
		[t, taxClasses]
	);

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
						'ui:label': t('Tax Status', { _tags: 'core' }),
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
