/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { CouponsScreen } from './index';

import type { QueryStateOf } from '../../../query';

const mockSync = jest.fn(async () => undefined);
const mockBinding = {
	resource: { kind: 'coupons-resource' },
	active$: of(false),
	total$: of(27),
	totalSource$: of('coverage' as const),
	sync: mockSync,
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
const mockPatch = jest.fn();
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'date_created_gmt';
let mockSortDirection = 'desc';

jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: unknown, state: unknown) =>
			mockUseCollectionBinding(collection, state),
	};
});

jest.mock('@wcpos/query', () => ({
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
}));

jest.mock('expo-router', () => ({
	useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		testID?: string;
	}) => (
		<input
			data-testid={testID}
			value={value}
			onChange={(event) => onChangeText(event.currentTarget.value)}
		/>
	),
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/data-table', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		return <div data-testid="coupons-table" />;
	},
}));
jest.mock('../components/data-table/skeleton', () => ({ DataTableSkeleton: () => null }));
jest.mock('../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { sortBy: mockSortBy, sortDirection: mockSortDirection },
	}),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../contexts/pro-access', () => ({ useProAccess: () => ({ readOnly: false }) }));
jest.mock('../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ patch: mockPatch }),
}));
jest.mock('./filter-bar', () => ({ FilterBar: () => null }));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/active', () => ({ Active: () => null }));
jest.mock('./cells/discount-type', () => ({ DiscountType: () => null }));
jest.mock('./cells/editable-amount', () => ({ EditableAmount: () => null }));
jest.mock('./cells/editable-code', () => ({ EditableCode: () => null }));
jest.mock('./cells/editable-date', () => ({ EditableDate: () => null }));
jest.mock('./cells/editable-description', () => ({ EditableDescription: () => null }));
jest.mock('./cells/status', () => ({ Status: () => null }));
jest.mock('./cells/usage', () => ({ Usage: () => null }));
jest.mock('../components/text-cell', () => ({ TextCell: () => null }));
jest.mock('../components/date', () => ({ DateCell: () => null }));

function latestState(): QueryStateOf<'coupons'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('coupons binding was not called');
	return call[1] as QueryStateOf<'coupons'>;
}

describe('CouponsScreen query-state wiring', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockDataTableProps = {};
		mockSortBy = 'date_created_gmt';
		mockSortDirection = 'desc';
	});

	afterEach(() => jest.useRealTimers());

	it('binds engine coupons with the existing default sort and page size', () => {
		render(<CouponsScreen />);

		expect(latestState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			resource: mockBinding.resource,
			sort: { field: 'date_created_gmt', direction: 'desc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
	});

	it('initializes binding sort from valid persisted coupon settings', () => {
		mockSortBy = 'status';
		mockSortDirection = 'asc';

		render(<CouponsScreen />);

		expect(latestState().sort).toEqual({ field: 'status', direction: 'asc' });
	});

	it('falls back to the existing default when the persisted sort field is invalid', () => {
		mockSortBy = 'description';
		mockSortDirection = 'asc';

		render(<CouponsScreen />);

		expect(latestState().sort).toEqual({ field: 'date_created_gmt', direction: 'desc' });
	});

	it('commits search through the store only after the input debounce', () => {
		render(<CouponsScreen />);

		fireEvent.change(screen.getByTestId('search-coupons'), { target: { value: 'summer' } });
		expect(latestState().search).toBe('');

		act(() => jest.advanceTimersByTime(249));
		expect(latestState().search).toBe('');

		act(() => jest.advanceTimersByTime(1));
		expect(latestState().search).toBe('summer');
	});

	it('routes table sorting and pagination through narrow store actions', () => {
		render(<CouponsScreen />);
		const actions = mockDataTableProps.actions as {
			setSort: (field: 'code', direction: 'asc') => void;
			extendLimit: () => void;
		};

		act(() => actions.extendLimit());
		expect(latestState().limit).toBe(20);

		act(() => actions.setSort('code', 'asc'));
		expect(latestState()).toMatchObject({
			sort: { field: 'code', direction: 'asc' },
			limit: 10,
		});
		expect(mockDataTableProps.sort).toEqual({ field: 'code', direction: 'asc' });
	});
});
