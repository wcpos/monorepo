import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { InputWithLabel } from '@wcpos/components/src/form-layout';
import Modal from '@wcpos/components/src/modal';

// import Tooltip from '@wcpos/components/src/tooltip';
import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import NumberInput from '../../../components/number-input';
import { ShippingMethodSelect } from '../../../components/shipping-method-select';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { useCurrentOrder } from '../../contexts/current-order';
import { useShippingLineData } from '../../hooks/use-shipping-line-data';
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
	const { updateShippingLine } = useUpdateShippingLine();
	const { store } = useAppState();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);
	const { currentOrder } = useCurrentOrder();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);
	const { getShippingLineData } = useShippingLineData();
	const { amount, tax_status, tax_class, prices_include_tax } = getShippingLineData(item);

	/**
	 *
	 */
	const json = React.useMemo(() => {
		return {
			...item,
			amount,
			tax_status,
			tax_class,
			prices_include_tax,
		};
	}, [amount, item, prices_include_tax, tax_class, tax_status]);

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				method_id: { type: 'string', title: t('Shipping Method', { _tags: 'core' }) },
				instance_id: { type: 'string', title: t('Instance ID', { _tags: 'core' }) },
				amount: { type: 'string', title: t('Amount', { _tags: 'core' }) },
				prices_include_tax: {
					type: 'boolean',
					title: t('Amount Includes Tax', { _tags: 'core' }),
					default: pricesIncludeTax === 'yes',
				},
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
							id: { type: 'number', title: t('ID', { _tags: 'core' }) },
							key: { type: 'string', title: t('Key', { _tags: 'core' }) },
							value: { type: 'string', title: t('Value', { _tags: 'core' }) },
						},
					},
				},
			},
		}),
		[pricesIncludeTax, t]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			'ui:rootFieldId': 'shipping_line',
			amount: {
				'ui:widget': (props) => (
					<InputWithLabel label={props.label} style={{ width: 200 }}>
						<NumberInput {...props} showDecimals prefix={currencySymbol} placement="right" />
					</InputWithLabel>
				),
			},
			method_id: {
				'ui:widget': (props) => <ShippingMethodSelect {...props} />,
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
		<Modal
			title={t('Edit {name}', { _tags: 'core', name: item.method_title })}
			opened
			onClose={onClose}
		>
			<EditFormWithJSONTree
				json={json}
				schema={schema}
				onChange={({ changes }) => updateShippingLine(uuid, changes)}
				uiSchema={uiSchema}
			/>
		</Modal>
	);
};
