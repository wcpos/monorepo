/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { ZReport } from './template';
import { QueryStateProvider } from '../../../../query';

jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
}));

jest.mock('react-native', () => ({
	View: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<div data-testid={testID}>{children}</div>
	),
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('@wcpos/components/print', () => ({
	Br: () => <br />,
	Line: () => <hr />,
	Row: jest.requireActual('@wcpos/components/print/row').Row,
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
		registerArray: mockRegisterTotals,
		totalItemsSold: 1,
		shippingTotalsArray: [],
		averageOrderValue: 10,
	}),
}));
jest.mock('../../../../contexts/app-state', () => {
	const useAppState = () => ({
		store: {
			id: 9,
			name$: new BehaviorSubject('Madrid'),
			price_num_decimals$: new BehaviorSubject(2),
		},
		wpCredentials: { id: 7, toJSON: () => ({ id: 7 }) },
	});
	return { useAppState, useStoreSession: useAppState };
});
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
// Stable identities: a fresh { formatDate } per call put a new function into
// the component's reach every render, and toISOString's ms precision meant a
// distinct output per call — the recipe for the intermittent 'Maximum update
// depth' warning under full-suite load (see template.update-depth.test.tsx).
const LOCAL_DATE = { formatDate: (date: Date) => date.toISOString() };
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	useLocalDate: () => LOCAL_DATE,
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

		// Print Text does not forward testID; these existing date lines remain text-selected.
		expect(screen.getByText(/reports.report_period_start/).textContent).toContain(
			'2026-07-01T08:00:00.000Z'
		);
		expect(screen.getByText(/reports.report_period_end/).textContent).toContain(
			'2026-07-02T18:00:00.000Z'
		);
	});
});

jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': 'Front desk' }),
}));

const mockRegisterTotals: { registerId: string; totalOrders: number; totalAmount: number }[] = [];
describe('native register totals block', () => {
	it('renders only when more than one register appears', () => {
		mockRegisterTotals.push({
			registerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
			totalOrders: 2,
			totalAmount: 40,
		});
		const report = () => (
			<QueryStateProvider
				collection="orders"
				initialPageSize={10}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<ZReport />
			</QueryStateProvider>
		);
		const { rerender } = render(report());
		expect(screen.queryByTestId('report-by-register')).toBeNull();
		mockRegisterTotals.push({
			registerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
			totalOrders: 1,
			totalAmount: 20,
		});
		rerender(report());
		expect(screen.getByTestId('report-by-register')).toBeTruthy();
		const row = screen.getByTestId('report-register-row-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
		expect(Array.from(row.querySelectorAll('span'), (cell) => cell.textContent)).toEqual([
			'Front desk',
			'2',
			'40',
		]);
		mockRegisterTotals.length = 0;
	});
});
