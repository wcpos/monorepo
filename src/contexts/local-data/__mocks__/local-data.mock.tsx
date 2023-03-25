const useLocalData = jest.fn(() => ({
	store: {
		calc_taxes: 'yes',
		prices_include_tax: 'yes',
		tax_round_at_subtotal: true,
	},
}));

export const LocalDataProvider = jest.fn(({ children }) => <>{children}</>);

export default useLocalData;
