/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { ZReport } from './template';
import { QueryStateProvider } from '../../../../query';

jest.mock('react-native', () => ({
	View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('@wcpos/components/print', () => ({
	Br: () => <br />,
	Line: () => <hr />,
	Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
jest.mock('../context', () => ({
	useReports: () => ({ selectedOrders: [] }),
}));

describe('ZReport query-state dates', () => {
	it('renders the dateRange filter without reading a contextual Query selector', () => {
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
				<ZReport />
			</QueryStateProvider>
		);

		expect(screen.getByText(/reports.report_period_start/).textContent).toContain(
			'2026-07-01T08:00:00.000Z'
		);
		expect(screen.getByText(/reports.report_period_end/).textContent).toContain(
			'2026-07-02T18:00:00.000Z'
		);
	});
});
