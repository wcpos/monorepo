import * as React from 'react';

import useLocalData from '../../../contexts/local-data';
import Form from '../components/document-form';

export const TaxSettings = () => {
	const { store } = useLocalData();

	return (
		<Form
			document={store}
			uiSchema={{
				'ui:title': null,
				'ui:description': null,
			}}
			fields={[
				'calc_taxes',
				'prices_include_tax',
				'tax_based_on',
				'shipping_tax_class',
				'tax_round_at_subtotal',
				'tax_display_shop',
				'tax_display_cart',
				'price_display_suffix',
				'tax_total_display',
			]}
		/>
	);
};
