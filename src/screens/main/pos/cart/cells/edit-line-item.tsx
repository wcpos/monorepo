import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { InputWithLabel } from '@wcpos/components/src/form-layout';

import { useT } from '../../../../../contexts/translations';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import NumberInput from '../../../components/number-input';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { useCurrentOrder } from '../../contexts/current-order';
import { useLineItemData } from '../../hooks/use-line-item-data';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['line_items'][number];
}

/**
 *
 */
export const EditLineItemModal = ({ uuid, item }: Props) => {
	const t = useT();
	const { updateLineItem } = useUpdateLineItem();
	const { getLineItemData } = useLineItemData();
	const { price, regular_price, tax_status } = getLineItemData(item);
	const { currentOrder } = useCurrentOrder();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);

	/**
	 * We need to add the tax_status as a field for the Edit form
	 */
	const json = React.useMemo(() => {
		return {
			...item,
			price,
			regular_price,
			tax_status,
		};
	}, [item, price, regular_price, tax_status]);

	/**
	 * Get schema for fee lines
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				// name: { type: 'string', title: t('Fee Name', { _tags: 'core' }) },
				sku: { type: 'string', title: t('SKU', { _tags: 'core' }) },
				price: { type: 'string', title: t('Price', { _tags: 'core' }) },
				regular_price: { type: 'string', title: t('Regular Price', { _tags: 'core' }) },
				tax_status: {
					type: 'string',
					title: t('Tax Status', { _tags: 'core' }),
					enum: ['taxable', 'none'],
					default: 'taxable',
				},
				tax_class: {
					type: 'string',
					title: t('Tax Class', { _tags: 'core' }),
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
		[t]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			'ui:rootFieldId': 'line_item',
			'ui:title': null,
			'ui:description': null,
			price: {
				'ui:widget': (props) => (
					<InputWithLabel label={props.label} style={{ width: 200 }}>
						<NumberInput {...props} showDecimals prefix={currencySymbol} placement="right" />
					</InputWithLabel>
				),
			},
			regular_price: {
				'ui:widget': (props) => (
					<InputWithLabel label={props.label} style={{ width: 200 }}>
						<NumberInput {...props} showDecimals prefix={currencySymbol} placement="right" />
					</InputWithLabel>
				),
			},
			tax_class: {
				'ui:widget': (props) => <TaxClassSelect {...props} />,
			},
			meta_data: {
				'ui:collapsible': 'closed',
			},
		}),
		[currencySymbol]
	);

	/**
	 *
	 */
	return (
		<EditFormWithJSONTree
			json={json}
			onChange={({ changes }) => updateLineItem(uuid, changes)}
			schema={schema}
			uiSchema={uiSchema}
		/>
	);
};
