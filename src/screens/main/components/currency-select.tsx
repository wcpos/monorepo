import * as React from 'react';

import { decode } from 'html-entities';

import { ComboboxWithLabel } from '@wcpos/components/src/combobox';

import useCurrencies, { CurrenciesProvider } from '../../../contexts/currencies';

/**
 *
 */
const CurrencySelect = ({ label, value = 'USD', onChange }) => {
	const allCurrencies = useCurrencies();
	const options = allCurrencies.map((currency) => ({
		label: `${currency.name} (${decode(currency.symbol)})`,
		value: currency.code,
	}));

	return <ComboboxWithLabel label={label} options={options} value={value} onChange={onChange} />;
};

/**
 *
 */
const CurrencySelectWithProvider = (props) => {
	return (
		<CurrenciesProvider>
			<CurrencySelect {...props} />
		</CurrenciesProvider>
	);
};

export default CurrencySelectWithProvider;
