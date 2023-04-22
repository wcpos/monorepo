import * as React from 'react';

import useLocalData from '../../../contexts/local-data';
import Form from '../components/document-form';

export const GeneralSettings = () => {
	const { store } = useLocalData();

	return (
		<Form
			document={store}
			uiSchema={{
				'ui:title': null,
				'ui:description': null,
			}}
			fields={[
				'name',
				'locale',
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
