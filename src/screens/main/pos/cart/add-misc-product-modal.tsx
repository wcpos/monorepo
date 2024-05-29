import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { InputWithLabel } from '@wcpos/components/src/form-layout';
import Modal from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';
import NumberInput from '../../components/number-input';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddProduct } from '../hooks/use-add-product';

const initialData = {
	name: '',
	price: '',
	sku: '',
	taxable: true,
	tax_class: 'standard',
};

/**
 *
 */
export const AddMiscProductModal = ({ onClose }: { onClose: () => void }) => {
	const [data, setData] = React.useState(initialData);
	const { currentOrder } = useCurrentOrder();
	const { addProduct } = useAddProduct();
	const currencySymbol = useObservableEagerState(currentOrder.currency_symbol$);
	const t = useT();
	const { taxClasses } = useTaxRates();

	/**
	 *
	 */
	const handleClose = React.useCallback(() => {
		setData(initialData);
		onClose();
	}, [onClose]);

	/**
	 *
	 */
	const handleAddMiscProduct = React.useCallback(() => {
		try {
			const { name, price, sku, taxable, tax_class } = data;
			addProduct({
				id: 0,
				name: isEmpty(name) ? t('Product', { _tags: 'core' }) : name,
				price: isEmpty(price) ? '0' : price,
				sku,
				regular_price: isEmpty(price) ? '0' : price,
				tax_status: taxable ? 'taxable' : 'none',
				tax_class,
			});
			handleClose();
		} catch (error) {
			log.error(error);
		}
	}, [addProduct, data, handleClose, t]);

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				name: { type: 'string', title: t('Name', { _tags: 'core' }) },
				sku: { type: 'string', title: t('SKU', { _tags: 'core' }) },
				price: { type: 'string', title: t('Price', { _tags: 'core' }) },
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
					default: taxClasses.includes('standrad') ? 'standard' : taxClasses[0],
				},
			},
		}),
		[t, taxClasses]
	);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			name: {
				'ui:placeholder': t('Product', { _tags: 'core' }),
			},
			price: {
				'ui:widget': (props) => (
					<InputWithLabel label={props.label} style={{ width: 200 }}>
						<NumberInput {...props} showDecimals prefix={currencySymbol} placement="right" />
					</InputWithLabel>
				),
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
			title={t('Add Miscellaneous Product', { _tags: 'core' })}
			primaryAction={{
				label: t('Add to Cart', { _tags: 'core' }),
				action: handleAddMiscProduct,
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
