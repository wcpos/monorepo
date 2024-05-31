import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { InputWithLabel } from '@wcpos/components/src/form-layout';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import NumberInput from '../../components/number-input';
import { ShippingMethodSelect } from '../../components/shipping-method-select';
import { TaxClassSelect } from '../../components/tax-class-select';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddShipping } from '../hooks/use-add-shipping';

/**
 * @TODO - what tax_class should be used when tax settings are set to 'inherit'?
 */
export const AddShippingModal = ({ onClose }: { onClose: () => void }) => {
	const { store } = useAppState();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);
	const [data, setData] = React.useState({
		method_title: '',
		method_id: '',
		amount: '0',
		tax_status: 'taxable',
		tax_class: shippingTaxClass === 'inherit' ? '' : shippingTaxClass,
	});
	const { currentOrder } = useCurrentOrder();
	const { addShipping } = useAddShipping();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);
	const t = useT();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);

	/**
	 *
	 */
	const handleClose = React.useCallback(() => {
		setData({
			method_title: '',
			method_id: '',
			amount: '0',
			tax_status: 'taxable',
			tax_class: shippingTaxClass === 'inherit' ? '' : shippingTaxClass,
		});
		onClose();
	}, [onClose, shippingTaxClass]);

	/**
	 *
	 */
	const handleAddShipping = () => {
		try {
			const { method_title, method_id, amount, tax_status, tax_class } = data;
			addShipping({
				method_title: isEmpty(method_title) ? t('Shipping', { _tags: 'core' }) : method_title,
				method_id: isEmpty(method_id) ? 'local_pickup' : method_id,
				amount: isEmpty(amount) ? '0' : amount,
				tax_status,
				tax_class,
				prices_include_tax: isEmpty(data.prices_include_tax)
					? pricesIncludeTax === 'yes'
					: data.prices_include_tax,
			});
			handleClose();
		} catch (error) {
			log.error(error);
		}
	};

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				method_title: { type: 'string', title: t('Shipping Method Title', { _tags: 'core' }) },
				method_id: { type: 'string', title: t('Shipping Method ID', { _tags: 'core' }) },
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
		}),
		[pricesIncludeTax, t]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			amount: {
				'ui:widget': (props) => (
					<InputWithLabel label={props.label} style={{ width: 200 }}>
						<NumberInput {...props} showDecimals prefix={currencySymbol} placement="right" />
					</InputWithLabel>
				),
			},
			method_title: {
				'ui:placeholder': t('Shipping', { _tags: 'core' }),
			},
			method_id: {
				'ui:widget': (props) => <ShippingMethodSelect {...props} />,
			},
			tax_class: {
				'ui:widget': (props) => <TaxClassSelect {...props} />,
			},
		}),
		[currencySymbol, t]
	);

	/**
	 *
	 */
	return (
		<Modal
			opened
			onClose={handleClose}
			title={t('Add Shipping', { _tags: 'core' })}
			primaryAction={{
				label: t('Add to Cart', { _tags: 'core' }),
				action: handleAddShipping,
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
