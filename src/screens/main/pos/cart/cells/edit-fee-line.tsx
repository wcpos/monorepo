import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Modal from '@wcpos/components/src/modal';

import { useT } from '../../../../../contexts/translations';
import { AmountWidget } from '../../../components/amount-widget';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import { useTaxRates } from '../../../contexts/tax-rates';
import { useCurrentOrder } from '../../contexts/current-order';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

interface Props {
	uuid: string;
	item: import('@wcpos/database').OrderDocument['fee_lines'][number];
	onClose?: () => void;
}

/**
 *
 */
export const EditFeeLineModal = ({ uuid, item, onClose }: Props) => {
	const t = useT();
	const { updateFeeLine } = useUpdateFeeLine();
	const { taxClasses } = useTaxRates();
	const { currentOrder } = useCurrentOrder();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);

	/**
	 *
	 */
	const { json, amount, percent } = React.useMemo(() => {
		const posData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_data');
		const { amount, percent, prices_include_tax } = JSON.parse(posData.value);

		return {
			json: {
				...item,
				prices_include_tax,
			},
			amount,
			percent,
		};
	}, [item]);

	/**
	 * Get schema for fee lines
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				// name: { type: 'string', title: t('Fee Name', { _tags: 'core' }) },
				amount: { type: 'string', title: t('Amount', { _tags: 'core' }) },
				prices_include_tax: {
					type: 'boolean',
					title: t('Amount Includes Tax', { _tags: 'core' }),
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
					enum: taxClasses,
					default: taxClasses.includes('standard') ? 'standard' : taxClasses[0],
				},
				meta_data: {
					type: 'array',
					title: t('Meta Data', { _tags: 'core' }),
					items: {
						type: 'object',
						properties: {
							key: {
								description: 'Meta key.',
								type: 'string',
							},
							value: {
								description: 'Meta value.',
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
		<Modal title={t('Edit {name}', { _tags: 'core', name: item.name })} opened onClose={onClose}>
			<EditFormWithJSONTree
				json={json}
				onChange={({ changes }) => updateFeeLine(uuid, changes)}
				schema={schema}
				uiSchema={{
					'ui:rootFieldId': 'fee_line',
					'ui:title': null,
					'ui:description': null,
					amount: {
						'ui:widget': () => (
							<AmountWidget
								amount={amount}
								percent={percent}
								currencySymbol={currencySymbol}
								onChange={(changes) => updateFeeLine(uuid, changes)}
							/>
						),
					},
					meta_data: {
						'ui:collapsible': 'closed',
					},
				}}
			/>
		</Modal>
	);
};
