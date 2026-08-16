/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render } from '@testing-library/react';
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

// The adversarial shape this test exists for: the real useLocalDate returns a
// fresh formatDate closure on every render, and every call yields a distinct
// string (here a counter; in production, time advancing across a granularity
// boundary). If formatDate participates in a set-state effect's dependencies,
// each render re-runs the effect with an always-new value — a nested-update
// loop. On fast machines the real-clock version only manifested under
// full-suite CPU load; the counter makes it deterministic. The counter caps at
// 1000 (comfortably past React's nested-update limit of 50) so the loop terminates via the
// same-value bailout instead of hanging the test run.
let formatCallCount = 0;
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	useLocalDate: () => ({
		formatDate: () => `formatted-${Math.min((formatCallCount += 1), 1000)}`,
	}),
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
const REPORTS = { selectedOrders: [] };
jest.mock('../context', () => ({
	useReportsData: () => REPORTS,
}));

describe('ZReport render stability', () => {
	it('renders without a nested-update loop when formatDate identity and output churn', () => {
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
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

			const maxDepthErrors = consoleError.mock.calls.filter((call) =>
				String(call[0]).includes('Maximum update depth exceeded')
			);
			expect(maxDepthErrors).toEqual([]);
		} finally {
			consoleError.mockRestore();
		}
	});
});
