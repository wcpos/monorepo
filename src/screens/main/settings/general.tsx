import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
import { useObservableSuspense } from 'observable-hooks';

import { InputWithLabel } from '@wcpos/components/src/form-layout';
import Form from '@wcpos/react-native-jsonschema-form';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import CurrencySelect from '../components/currency-select';
import CustomerSelect from '../components/customer-select';
import { LanguageSelect } from '../components/language-select';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
import { useDefaultCustomer } from '../hooks/use-default-customer';

export const GeneralSettings = () => {
	const { store } = useAppState();
	const { defaultCustomerResource } = useDefaultCustomer();
	const defaultCustomer = useObservableSuspense(defaultCustomerResource);
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const handleCustomerSelect = React.useCallback(
		(customer) => {
			if (customer.id !== defaultCustomer.id) {
				localPatch({
					document: store,
					data: { default_customer: customer.id },
				});
			}
		},
		[defaultCustomer.id, localPatch, store]
	);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const orderSchema = get(store.collection, 'schema.jsonSchema.properties');
		const fields = [
			'name',
			'locale',
			'default_customer',
			'default_customer_is_cashier',
			// 'store_address',
			// 'store_address_2',
			// 'store_city',
			// 'default_country',
			// 'store_postcode',
			// 'enable_coupons',
			// 'calc_discounts_sequentially',
			'currency',
			'currency_pos',
			'price_thousand_sep',
			'price_decimal_sep',
			'price_num_decimals',
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
			name: {
				'ui:label': t('Store Name', { _tags: 'core' }),
			},
			locale: {
				'ui:label': t('Language', { _tags: 'core' }),
				'ui:widget': LanguageSelect,
			},
			default_customer: {
				'ui:label': t('Default Customer', { _tags: 'core' }),
				'ui:widget': ({ label, ...props }) => {
					return (
						// TODO - a label prop should automatically switch to InputWithLabel?
						<InputWithLabel label={label}>
							<CustomerSelect
								// {...props}
								value={defaultCustomer}
								onSelectCustomer={handleCustomerSelect}
							/>
						</InputWithLabel>
					);
				},
			},
			default_customer_is_cashier: {
				'ui:label': t('Default Customer is cashier', { _tags: 'core' }),
			},
			currency: {
				'ui:label': t('Currency', { _tags: 'core' }),
				'ui:widget': CurrencySelect,
			},
			currency_pos: {
				'ui:label': t('Currency Position', { _tags: 'core' }),
			},
			price_thousand_sep: {
				'ui:label': t('Thousand Separator', { _tags: 'core' }),
			},
			price_decimal_sep: {
				'ui:label': t('Decimal Separator', { _tags: 'core' }),
			},
			price_num_decimals: {
				'ui:label': t('Number of Decimals', { _tags: 'core' }),
			},
		}),
		[defaultCustomer, handleCustomerSelect, t]
	);

	/**
	 *
	 */
	return (
		<Form
			formData={store.toMutableJSON()}
			schema={schema}
			uiSchema={uiSchema}
			onChange={({ changes }) => localPatch({ document: store, data: changes })}
		/>
	);
};
