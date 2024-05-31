import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { AmountWidget } from '../../components/amount-widget';
import { TaxClassSelect } from '../../components/tax-class-select';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddFee } from '../hooks/use-add-fee';

/**
 * TODO: tax_status = taxable by default, perhaps put this as setting?
 */
const initialData = {
	name: '',
	tax_status: 'taxable',
	tax_class: '',
};

/**
 *
 */
export const AddFeeModal = ({ onClose }: { onClose: () => void }) => {
	const [data, setData] = React.useState(initialData);
	const { currentOrder } = useCurrentOrder();
	const { addFee } = useAddFee();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);
	const t = useT();
	const { store } = useAppState();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);
	const [additionalData, setAdditionalData] = React.useState({ amount: '0', percent: false });

	/**
	 *
	 */
	const handleClose = React.useCallback(() => {
		setData(initialData);
		setAdditionalData({ amount: '0', percent: false });
		onClose();
	}, [onClose]);

	/**
	 *
	 */
	const handleAddFee = React.useCallback(async () => {
		const { name, tax_status, tax_class } = data;
		const { amount, percent } = additionalData;
		await addFee({
			name: isEmpty(name) ? t('Fee', { _tags: 'core' }) : name,
			// total: isEmpty(total) ? '0' : total,
			amount,
			tax_status,
			tax_class,
			percent,
			prices_include_tax: isEmpty(data.prices_include_tax)
				? pricesIncludeTax === 'yes'
				: data.prices_include_tax,
		});
		onClose();
	}, [addFee, additionalData, data, onClose, pricesIncludeTax, t]);

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				name: { type: 'string', title: t('Fee Name', { _tags: 'core' }) },
				// total: { type: 'string', title: t('Total', { _tags: 'core' }) },
				amount: { type: 'string', title: t('Amount', { _tags: 'core' }) },
				prices_include_tax: {
					type: 'boolean',
					title: additionalData.percent
						? t('Percent of Cart Including Tax', { _tags: 'core' })
						: t('Amount Includes Tax', { _tags: 'core' }),
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
			},
		}),
		[additionalData.percent, pricesIncludeTax, t]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			amount: {
				'ui:widget': () => (
					<AmountWidget
						amount={additionalData.amount}
						percent={additionalData.percent}
						currencySymbol={currencySymbol}
						onChange={(changes) => {
							setAdditionalData((prev) => ({ ...prev, ...changes }));
						}}
					/>
				),
			},
			name: {
				'ui:placeholder': t('Fee', { _tags: 'core' }),
			},
			tax_class: {
				'ui:widget': (props) => <TaxClassSelect {...props} />,
			},
		}),
		[additionalData, currencySymbol, t]
	);

	/**
	 *
	 */
	return (
		<Modal
			opened
			onClose={handleClose}
			title={t('Add Fee', { _tags: 'core' })}
			primaryAction={{
				label: t('Add to Cart', { _tags: 'core' }),
				action: handleAddFee,
			}}
			secondaryActions={[{ label: t('Cancel', { _tags: 'core' }), action: handleClose }]}
		>
			<Box space="small">
				<Form
					formData={data}
					schema={schema}
					uiSchema={uiSchema}
					onChange={({ formData }) => {
						setData(formData);
					}}
				/>
			</Box>
		</Modal>
	);
};
