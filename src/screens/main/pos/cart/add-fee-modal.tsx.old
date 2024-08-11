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
 *
 */
export const AddFeeModal = ({ onClose }: { onClose: () => void }) => {
	const { store } = useAppState();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);
	const [data, setData] = React.useState({
		name: '',
		tax_status: 'taxable',
		tax_class: '',
		prices_include_tax: pricesIncludeTax === 'yes',
		percent_of_cart_total_with_tax: pricesIncludeTax === 'yes',
	});
	const { currentOrder } = useCurrentOrder();
	const { addFee } = useAddFee();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);
	const t = useT();
	const [additionalData, setAdditionalData] = React.useState({ amount: '0', percent: false });

	/**
	 *
	 */
	const handleClose = React.useCallback(() => {
		setData({
			name: '',
			tax_status: 'taxable',
			tax_class: '',
			prices_include_tax: pricesIncludeTax === 'yes',
			percent_of_cart_total_with_tax: pricesIncludeTax === 'yes',
		});
		setAdditionalData({ amount: '0', percent: false });
		onClose();
	}, [onClose, pricesIncludeTax]);

	/**
	 *
	 */
	const handleAddFee = React.useCallback(async () => {
		const { name, tax_status, tax_class, prices_include_tax, percent_of_cart_total_with_tax } =
			data;
		const { amount, percent } = additionalData;
		await addFee({
			name: isEmpty(name) ? t('Fee', { _tags: 'core' }) : name,
			// total: isEmpty(total) ? '0' : total,
			amount,
			tax_status,
			tax_class,
			percent,
			prices_include_tax,
			percent_of_cart_total_with_tax,
		});
		onClose();
	}, [addFee, additionalData, data, onClose, t]);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const baseSchema = {
			type: 'object',
			properties: {
				name: { type: 'string', title: t('Fee Name', { _tags: 'core' }) },
				// total: { type: 'string', title: t('Total', { _tags: 'core' }) },
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
			},
		};
		// Add the percent_of_cart_total_with_tax property conditionally
		if (additionalData.percent) {
			baseSchema.properties.percent_of_cart_total_with_tax = {
				type: 'boolean',
				title: t('Percent of Cart Total Including Tax', { _tags: 'core' }),
			};
		}

		return baseSchema;
	}, [additionalData.percent, pricesIncludeTax, t]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			'ui:order': [
				'name',
				'amount',
				'prices_include_tax',
				'percent_of_cart_total_with_tax',
				'tax_status',
				'tax_class',
			],
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
