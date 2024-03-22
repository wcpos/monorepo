import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';
import { useAddProduct } from '../hooks/use-add-product';

const initialData = {
	name: '',
	price: '',
	taxable: true,
	tax_class: '',
};

/**
 *
 */
export const AddMiscProduct = () => {
	const [opened, setOpened] = React.useState(false);
	const [data, setData] = React.useState(initialData);
	const { currentOrder } = useCurrentOrder();
	const { addProduct } = useAddProduct();
	const currencySymbol = useObservableState(
		currentOrder.currency_symbol$,
		currentOrder.currency_symbol
	);
	const t = useT();

	/**
	 *
	 */
	const handleChange = React.useCallback(
		(newData) => {
			setData((prev) => ({ ...prev, ...newData }));
		},
		[setData]
	);

	/**
	 *
	 */
	const handleAddMiscProduct = React.useCallback(() => {
		try {
			const { name, price, taxable, tax_class } = data;
			addProduct({
				id: 0,
				name: isEmpty(name) ? t('Product', { _tags: 'core' }) : name,
				price: isEmpty(price) ? '0' : price,
				regular_price: isEmpty(price) ? '0' : price,
				tax_status: taxable ? 'taxable' : 'none',
				tax_class,
				sku: 'misc-pos-product', // a sku is required but not used by woocommerce
			});
			setData(initialData);
			setOpened(false);
		} catch (error) {
			log.error(error);
		}
	}, [addProduct, data, t]);

	/**
	 *
	 */
	const schema = React.useMemo(
		() => ({
			type: 'object',
			properties: {
				name: { type: 'string', title: t('Name', { _tags: 'core' }) },
				price: { type: 'string', title: t('Price', { _tags: 'core' }) },
				taxable: { type: 'boolean', title: t('Taxable', { _tags: 'core' }) },
				tax_class: { type: 'string', title: t('Tax Class', { _tags: 'core' }) },
			},
		}),
		[t]
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
				'ui:options': { prefix: currencySymbol },
				'ui:placeholder': '0',
			},
		}),
		[currencySymbol, t]
	);

	/**
	 *
	 */
	return (
		<>
			<Box horizontal space="small" padding="small" align="center">
				<Box fill>
					<Text>{t('Add Miscellaneous Product', { _tags: 'core' })}</Text>
				</Box>
				<Box>
					<Icon name="circlePlus" onPress={() => setOpened(true)} />
				</Box>
			</Box>
			<Modal
				opened={opened}
				onClose={() => setOpened(false)}
				title={t('Add Miscellaneous Product', { _tags: 'core' })}
				primaryAction={{
					label: t('Add to Cart', { _tags: 'core' }),
					action: handleAddMiscProduct,
				}}
				secondaryActions={[
					{ label: t('Cancel', { _tags: 'core' }), action: () => setOpened(false) },
				]}
			>
				<Box space="small">
					<Form formData={data} schema={schema} uiSchema={uiSchema} onChange={handleChange} />
				</Box>
			</Modal>
		</>
	);
};
