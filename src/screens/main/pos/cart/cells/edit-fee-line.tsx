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
	const amountDataRef = React.useRef({ amount: '0', percent: false });
	const { currentOrder } = useCurrentOrder();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);

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
				json={item}
				onChange={({ changes }) => updateFeeLine(uuid, changes)}
				schema={schema}
				uiSchema={{
					'ui:rootFieldId': 'fee_line',
					'ui:title': null,
					'ui:description': null,
					amount: {
						'ui:widget': () => (
							<AmountWidget currencySymbol={currencySymbol} amountDataRef={amountDataRef} />
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
