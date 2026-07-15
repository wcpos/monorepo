/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { CustomersScreen } from './index';

import type { QueryStateOf } from '../../../query';

const mockSync = jest.fn(async () => undefined);
const mockBinding = {
	resource: { kind: 'customers-resource' },
	active$: of(false),
	total$: of(7),
	totalSource$: of('local' as const),
	sync: mockSync,
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'last_name';
let mockSortDirection = 'asc';

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
		return <div data-testid="customers-table" />;
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
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/address', () => ({ Address: () => null }));
jest.mock('./cells/avatar', () => ({ Avatar: () => null }));
jest.mock('./cells/email', () => ({ CustomerEmail: () => null }));
jest.mock('../components/text-cell', () => ({ TextCell: () => null }));
jest.mock('../components/date', () => ({ DateCell: () => null }));

function latestState(): QueryStateOf<'customers'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('customers binding was not called');
	return call[1] as QueryStateOf<'customers'>;
}

describe('CustomersScreen query-state wiring', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockDataTableProps = {};
		mockSortBy = 'last_name';
		mockSortDirection = 'asc';
	});

	afterEach(() => jest.useRealTimers());

	it('binds engine customers with the existing default sort and page size', () => {
		render(<CustomersScreen />);

		expect(latestState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		});
		expect(mockUseCollectionBinding).toHaveBeenLastCalledWith('customers', latestState());
		expect(mockDataTableProps).toMatchObject({
			resource: mockBinding.resource,
			sort: { field: 'last_name', direction: 'asc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
	});

	it('initializes binding sort from valid persisted customer settings', () => {
		mockSortBy = 'email';
		mockSortDirection = 'desc';

		render(<CustomersScreen />);

		expect(latestState().sort).toEqual({ field: 'email', direction: 'desc' });
	});

	it('falls back to the existing default when the persisted sort field is invalid', () => {
		mockSortBy = 'billing';
		mockSortDirection = 'desc';

		render(<CustomersScreen />);

		expect(latestState().sort).toEqual({ field: 'last_name', direction: 'asc' });
		expect(mockDataTableProps.sort).toEqual({ field: 'last_name', direction: 'asc' });
	});

	it('commits search through the store only after the input debounce', () => {
		render(<CustomersScreen />);

		fireEvent.change(screen.getByTestId('search-customers'), { target: { value: 'ada' } });
		expect(latestState().search).toBe('');

		act(() => jest.advanceTimersByTime(249));
		expect(latestState().search).toBe('');

		act(() => jest.advanceTimersByTime(1));
		expect(latestState().search).toBe('ada');
	});

	it('routes table sorting and pagination through narrow store actions', () => {
		render(<CustomersScreen />);
		const actions = mockDataTableProps.actions as {
			setSort: (field: 'email', direction: 'desc') => void;
			extendLimit: () => void;
		};

		act(() => actions.extendLimit());
		expect(latestState().limit).toBe(20);

		act(() => actions.setSort('email', 'desc'));
		expect(latestState()).toMatchObject({
			sort: { field: 'email', direction: 'desc' },
			limit: 10,
		});
		expect(mockDataTableProps.sort).toEqual({ field: 'email', direction: 'desc' });
	});
});
