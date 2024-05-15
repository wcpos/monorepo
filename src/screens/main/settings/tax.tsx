import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import pick from 'lodash/pick';

import Box from '@wcpos/components/src/box';
import Button from '@wcpos/components/src/button';
import Form from '@wcpos/react-native-jsonschema-form';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';

export const TaxSettings = () => {
	const { store } = useAppState();
	const navigation = useNavigation();
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const orderSchema = get(store.collection, 'schema.jsonSchema.properties');
		const fields = [
			'calc_taxes',
			'prices_include_tax',
			'tax_based_on',
			'shipping_tax_class',
			'tax_round_at_subtotal',
			'tax_display_shop',
			'tax_display_cart',
			'price_display_suffix',
			'tax_total_display',
		];
		return {
			properties: pick(orderSchema, fields),
		};
	}, [store.collection]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			'ui:title': null,
			'ui:description': null,
			calc_taxes: {
				'ui:label': t('Enable taxes', { _tags: 'core' }),
			},
			prices_include_tax: {
				'ui:label': t('Prices entered with tax', { _tags: 'core' }),
			},
			tax_based_on: {
				'ui:label': t('Calculate tax based on', { _tags: 'core' }),
			},
			shipping_tax_class: {
				'ui:label': t('Shipping tax class', { _tags: 'core' }),
			},
			tax_round_at_subtotal: {
				'ui:label': t('Round tax at subtotal level', { _tags: 'core' }),
			},
			tax_display_shop: {
				'ui:label': t('Display prices in the shop', { _tags: 'core' }),
			},
			tax_display_cart: {
				'ui:label': t('Display prices during cart and checkout', { _tags: 'core' }),
			},
			price_display_suffix: {
				'ui:label': t('Price display suffix', { _tags: 'core' }),
			},
			tax_total_display: {
				'ui:label': t('Display tax totals', { _tags: 'core' }),
			},
		}),
		[t]
	);

	return (
		<Box space="normal">
			<Box horizontal>
				<Button
					type="secondary"
					size="small"
					title={t('View all tax rates', { _tags: 'core' })}
					onPress={() => navigation.navigate('TaxRates')}
				/>
			</Box>
			<Form
				formData={store.toMutableJSON()}
				schema={schema}
				uiSchema={uiSchema}
				onChange={({ changes }) => localPatch({ document: store, data: changes })}
			/>
		</Box>
	);
};
