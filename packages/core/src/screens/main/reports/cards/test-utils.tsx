import * as React from 'react';

import { calculateTotals } from '../report/utils';

import type { ReportOrder, ReportsData } from '../context';

export const mockState = {
	screenSize: 'lg',
	store: {
		id: 9,
		currency: 'GBP',
		currency_pos: 'left',
		price_num_decimals: 2,
		price_decimal_sep: '.',
		price_thousand_sep: ',',
	} as
		| {
				id: number;
				currency: string;
				currency_pos: string;
				price_num_decimals: number;
				price_decimal_sep: string;
				price_thousand_sep: string;
		  }
		| undefined,
	statusMode: 'done',
	from: '2026-07-15',
	to: '2026-07-15',
	data: {} as ReportsData,
};
export function setOrders(orders: ReportOrder[]) {
	const dateRange = {
		start: new Date('2026-07-15T00:00:00Z'),
		end: new Date('2026-07-15T23:59:59Z'),
	};
	mockState.data = {
		allOrders: orders,
		selectedOrders: orders,
		dateRange,
		comparisonRange: dateRange,
		comparisonOrders: [],
		wholeComparisonOrders: [],
		live: true,
		totals: calculateTotals({ orders }),
	};
}
setOrders([]);
jest.mock('../context', () => ({
	useReportsData: () => mockState.data,
	useReportsScope: () => ({ statusMode: mockState.statusMode }),
	useReportsPeriod: () => ({
		dateRange: {
			start: new Date(`${mockState.from}T00:00:00Z`),
			end: new Date(`${mockState.to}T23:59:59Z`),
		},
		timezone: 'UTC',
		storeId: 9,
		period: 'day',
		live: true,
	}),
}));
jest.mock('../../../../contexts/theme', () => ({
	useTheme: () => ({ screenSize: mockState.screenSize }),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockState.store }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (source: unknown, select: (source: unknown) => unknown) => source && select(source),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	...jest.requireActual('../../../../hooks/use-store-day'),
	useViewedStore: () => mockState.store,
	useStoreDay: () => ({
		timezone: 'UTC',
		presets: () =>
			jest
				.requireActual('../../../../hooks/use-store-day')
				.storeDayPresets(new Date('2026-07-15T12:00:00Z'), 'UTC'),
	}),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: jest.requireActual('date-fns').format }),
}));
jest.mock('../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: true } }),
}));
jest.mock('../bar', () => ({ ScopeHint: () => null }));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: jest.requireActual('react-error-boundary').ErrorBoundary,
}));
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/calendar', () => ({ Calendar: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: jest.requireActual('react-native').Text,
	TextClassContext: React.createContext(undefined),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: jest.requireActual('react-native').View,
	ButtonText: jest.requireActual('react-native').Text,
}));
jest.mock('@wcpos/components/popover', () => ({
	Popover: ({ children }: React.PropsWithChildren) => children,
	PopoverTrigger: ({ children }: React.PropsWithChildren) => children,
	PopoverContent: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
