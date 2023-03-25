const useLocalData = jest.fn(() => ({
	store: {
		calc_taxes: 'yes',
		prices_include_tax: 'no',
		tax_round_at_subtotal: true,
		currency: 'USD',
		currency_pos: 'left',
		price_decimal_sep: '.',
		price_thousand_sep: ',',
		price_num_decimals: 2,
	},
}));

export const LocalDataProvider = jest.fn(({ children }) => <>{children}</>);

export default useLocalData;
