/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { LogsScreen } from './index';

import type { QueryStateOf } from '../../../query';

const mockSync = jest.fn(async () => undefined);
const mockBinding = {
	resource: { kind: 'logs-resource' },
	active$: of(false),
	total$: of(27),
	totalSource$: of('local' as const),
	sync: mockSync,
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'timestamp';
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
	useLocalQuery: () => {
		throw new Error('legacy useLocalQuery reached');
	},
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

jest.mock('../components/data-table', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		return <div data-testid="logs-table" />;
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
jest.mock('./filter-bar', () => ({
	DEFAULT_LOG_LEVELS: ['error', 'warn', 'info', 'success'],
	FilterBar: () => null,
}));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./footer', () => ({ LogsFooter: () => null }));
jest.mock('../components/text-cell', () => ({ TextCell: () => null }));
jest.mock('./cells/context', () => ({ Context: () => null }));
jest.mock('./cells/date', () => ({ Date: () => null }));
jest.mock('./cells/level', () => ({ Level: () => null }));
jest.mock('./cells/code', () => ({ Code: () => null }));

function latestState(): QueryStateOf<'logs'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('logs binding was not called');
	return call[1] as QueryStateOf<'logs'>;
}

describe('LogsScreen query-state wiring', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockDataTableProps = {};
		mockSortBy = 'timestamp';
		mockSortDirection = 'desc';
	});

	afterEach(() => jest.useRealTimers());

	it('binds local logs with the existing initial filter, sort, and page size', () => {
		render(<LogsScreen />);

		expect(latestState()).toEqual({
			search: '',
			filters: { level: ['error', 'warn', 'info', 'success'] },
			sort: { field: 'timestamp', direction: 'desc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			resource: mockBinding.resource,
			sort: { field: 'timestamp', direction: 'desc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
	});

	it('initializes the binding sort from persisted logs settings', () => {
		mockSortBy = 'level';
		mockSortDirection = 'asc';

		render(<LogsScreen />);

		expect(latestState().sort).toEqual({ field: 'level', direction: 'asc' });
	});

	it('falls back to timestamp descending when the persisted sort field is invalid', () => {
		mockSortBy = 'message';
		mockSortDirection = 'asc';

		render(<LogsScreen />);

		expect(latestState().sort).toEqual({ field: 'timestamp', direction: 'desc' });
	});

	it('commits search through the store only after the input debounce', () => {
		render(<LogsScreen />);

		fireEvent.change(screen.getByTestId('search-logs'), { target: { value: 'timeout' } });
		expect(latestState().search).toBe('');

		act(() => jest.advanceTimersByTime(249));
		expect(latestState().search).toBe('');

		act(() => jest.advanceTimersByTime(1));
		expect(latestState().search).toBe('timeout');
	});

	it('routes table sorting and pagination through narrow store actions', () => {
		render(<LogsScreen />);
		const actions = mockDataTableProps.actions as {
			setSort: (field: 'level', direction: 'asc') => void;
			extendLimit: () => void;
		};

		act(() => actions.extendLimit());
		expect(latestState().limit).toBe(20);

		act(() => actions.setSort('level', 'asc'));
		expect(latestState()).toMatchObject({
			sort: { field: 'level', direction: 'asc' },
			limit: 10,
		});
		expect(mockDataTableProps.sort).toEqual({ field: 'level', direction: 'asc' });
	});
});
