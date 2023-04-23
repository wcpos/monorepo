import * as React from 'react';

import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';
import CurrencySelect from '../components/currency-select';
import Form from '../components/document-form';
import LanguageSelect from '../components/language-select';

export const GeneralSettings = () => {
	const { store } = useLocalData();

	return (
		<Form
			document={store}
			uiSchema={{
				'ui:title': null,
				'ui:description': null,
				name: {
					'ui:label': t('Store Name', { _tags: 'core' }),
				},
				locale: {
					'ui:label': t('Language', { _tags: 'core' }),
					'ui:widget': LanguageSelect,
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
			}}
			fields={[
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
			]}
		/>
	);
};
