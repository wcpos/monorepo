const useTaxRates = jest.fn(() => ({
	data: [
		{
			id: '72',
			country: 'GB',
			rate: '20.0000',
			name: 'VAT',
			priority: 1,
			compound: false,
			shipping: true,
			order: 1,
			class: 'standard',
		},
	],
}));

export const TaxRateProvider = jest.fn(({ children }) => <>{children}</>);

export default useTaxRates;
