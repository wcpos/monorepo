/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { Report } from './index';
import { QueryStateProvider } from '../../../../query';

const mockGenerateZReportHTML = jest.fn((_input: unknown) => '<html />');

jest.mock('react-native', () => ({
	ScrollView: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: () => null,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectValue: () => null,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('./template', () => ({ ZReport: () => null }));
jest.mock('./generate-html', () => ({
	generateZReportHTML: (input: unknown) => mockGenerateZReportHTML(input),
}));
jest.mock('./utils', () => ({
	calculateTotals: () => ({
		total: 10,
		refundTotal: 0,
		paymentMethodsArray: [],
		taxTotalsArray: [],
		totalTax: 2,
		discountTotal: 0,
		userStoreArray: [],
		totalItemsSold: 1,
		shippingTotalsArray: [],
		averageOrderValue: 10,
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		store: {
			id: 9,
			name$: new BehaviorSubject('Madrid'),
			price_num_decimals$: new BehaviorSubject(2),
		},
		wpCredentials: { id: 7 },
	}),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	useLocalDate: () => ({ formatDate: (date: Date) => date.toISOString() }),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Grace' }),
}));
jest.mock('../../hooks/use-number-format', () => ({
	useNumberFormat: () => ({ format: String }),
}));
jest.mock('../../hooks/use-print', () => ({
	usePrint: () => ({ print: jest.fn(), isPrinting: false }),
}));
jest.mock('../context', () => ({
	useReports: () => ({ selectedOrders: [] }),
}));

describe('Report query-state dates', () => {
	it('generates HTML from the dateRange filter without a contextual Query', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
				initialFilters={{
					dateRange: {
						from: '2026-07-01T08:00:00.000Z',
						to: '2026-07-02T18:00:00.000Z',
					},
				}}
			>
				<Report />
			</QueryStateProvider>
		);

		expect(mockGenerateZReportHTML).toHaveBeenCalledWith(
			expect.objectContaining({
				reportPeriod: {
					from: '2026-07-01T08:00:00.000Z',
					to: '2026-07-02T18:00:00.000Z',
				},
			})
		);
	});
});
