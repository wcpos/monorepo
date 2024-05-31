import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Modal from '@wcpos/components/src/modal';

import { useT } from '../../../../../contexts/translations';
import { AmountWidget } from '../../../components/amount-widget';
import { EditFormWithJSONTree } from '../../../components/edit-form-with-json-tree';
import { TaxClassSelect } from '../../../components/tax-class-select';
import { useCurrentOrder } from '../../contexts/current-order';
import { useFeeLineData } from '../../hooks/use-fee-line-data';
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
	const { currentOrder } = useCurrentOrder();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);
	const { getFeeLineData } = useFeeLineData();
	const { amount, percent, prices_include_tax } = getFeeLineData(item);

	/**
	 *
	 */
	const json = React.useMemo(() => {
		return {
			...item,
			prices_include_tax,
		};
	}, [item, prices_include_tax]);

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
					title: percent
						? t('Percent of Cart Including Tax', { _tags: 'core' })
						: t('Amount Includes Tax', { _tags: 'core' }),
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
		[percent, t]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
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
			tax_class: {
				'ui:widget': (props) => <TaxClassSelect {...props} />,
			},
			meta_data: {
				'ui:collapsible': 'closed',
			},
		}),
		[amount, currencySymbol, percent, updateFeeLine, uuid]
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
				uiSchema={uiSchema}
			/>
		</Modal>
	);
};
