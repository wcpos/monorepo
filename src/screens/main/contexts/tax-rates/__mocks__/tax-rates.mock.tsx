const useTaxRates = jest.fn(() => ({
	data: [
		{
			id: 72,
			country: 'CA',
			rate: '5.0000',
			name: 'GST',
			priority: 1,
			compound: false,
			shipping: true,
			order: 1,
			class: '',
		},
		{
			id: 17,
			country: 'CA',
			state: 'QC',
			rate: '8.5000',
			name: 'PST',
			priority: 2,
			compound: true,
			shipping: true,
			order: 2,
			class: '',
		},
	],
}));

export const TaxRateProvider = jest.fn(({ children }) => <>{children}</>);

export default useTaxRates;
