/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

import { CustomersScreen } from './index';

import type { QueryStateOf } from '../../../query';

let mockCanCreate = true;
const mockPush = jest.fn();
const mockSync = jest.fn(async () => undefined);
const mockBinding = {
	resource: new ObservableResource(
		new BehaviorSubject({ hits: [], searchState: 'answered', searchActive: false })
	),
	active$: of(false),
	total$: of(7),
	sync: mockSync,
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
let mockDataTableProps: Record<string, unknown> = {};
let mockTooltipProps: { showOnNative?: boolean } = {};
let mockSortBy = 'last_name';
let mockSortDirection = 'asc';
let mockReadOnly = false;

jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: unknown, state: unknown) =>
			mockUseCollectionBinding(collection, state),
	};
});

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/query', () => ({
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
}));
jest.mock('expo-router', () => ({
	useRouter: () => ({ push: mockPush }),
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
	Suspense: React.Suspense,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({
		testID,
		disabled,
		onPress,
	}: {
		testID: string;
		disabled: boolean;
		onPress: () => void;
	}) => <button data-testid={testID} disabled={disabled} onClick={onPress} />,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children, ...props }: { children: React.ReactNode; showOnNative?: boolean }) => {
		mockTooltipProps = props;
		return <>{children}</>;
	},
	TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../components/data-table/v2', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		return <div data-testid="customers-table" />;
	},
}));
jest.mock('../components/data-table/v2/skeleton', () => ({
	DataTableSkeleton: ({ id }: { id: string }) => <div data-testid={`skeleton-${id}`} />,
}));
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
jest.mock('../contexts/pro-access', () => ({
	useProAccess: () => ({ readOnly: mockReadOnly }),
}));
jest.mock('../hooks/use-user-capabilities', () => ({
	useUserCapabilities: () => ({
		caps: { canCreateCustomers: mockCanCreate },
		known: false,
	}),
}));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/address', () => ({ Address: () => null }));
jest.mock('./cells/avatar', () => ({ Avatar: () => null }));
jest.mock('./cells/email', () => ({ CustomerEmail: () => null }));
jest.mock('../components/record-text-cell', () => ({ RecordTextCell: () => null }));
jest.mock('../components/record-date-cell', () => ({ RecordDateCell: () => null }));

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
		mockTooltipProps = {};
		mockSortBy = 'last_name';
		mockSortDirection = 'asc';
		mockReadOnly = false;
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
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
	});

	it('keeps the upgrade tooltip available when adding is read-only', () => {
		mockReadOnly = true;

		render(<CustomersScreen />);

		expect(mockTooltipProps.showOnNative).toBe(true);
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

		expect(latestState().sort).toEqual({
			field: 'last_name',
			direction: 'asc',
		});
		expect(mockDataTableProps.sort).toEqual({
			field: 'last_name',
			direction: 'asc',
		});
	});

	it('commits search through the store only after the input debounce', () => {
		render(<CustomersScreen />);

		fireEvent.change(screen.getByTestId('search-customers'), {
			target: { value: 'ada' },
		});
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
		expect(mockDataTableProps.sort).toEqual({
			field: 'email',
			direction: 'desc',
		});
	});
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// The legacy string loses the recovery action.
it('distinguishes an empty store from search results and clears search', () => {
	render(<CustomersScreen />);
	let empty = mockDataTableProps.noDataMessage as React.ReactElement<{
		kind: string;
		action?: { onPress: () => void };
	}>;
	expect(empty.props.kind).toBe('empty');
	fireEvent.change(screen.getByTestId('search-customers'), { target: { value: 'missing' } });
	act(() => jest.advanceTimersByTime(250));
	empty = mockDataTableProps.noDataMessage as typeof empty;
	expect(empty.props.kind).toBe('no-results');
	act(() => empty.props.action!.onPress());
	expect(latestState().search).toBe('');
});

// The guard and the licence hook pull app-state → expo-crypto (ESM), which CI's Node 22 jest
// cannot require; local Node 24 can, so the mock is what keeps the suite green in CI.
jest.mock('../components/pro-guard', () => ({
	withProAccess: (Component: React.ComponentType<object>, page: string) =>
		function Guarded(props: object) {
			return (
				<div data-testid={`guard-${page}`}>
					<Component {...props} />
				</div>
			);
		},
}));
jest.mock('../../../hooks/use-app-info', () => ({
	// The bar reads the licence for its `+`; the tests drive it through the same flag.
	useAppInfo: () => ({ license: { isPro: !mockReadOnly } }),
}));
jest.mock('../components/management-bar', () => ({
	ManagementBar: ({ children, search }: { children: React.ReactNode; search: React.ReactNode }) => (
		<>
			{search}
			{children}
		</>
	),
}));
jest.mock('./display-options', () => ({ DisplayOptions: () => null }));
jest.mock('./row', () => ({ CustomerRow: () => null }));
jest.mock('./cells/date', () => ({ DateCell: () => null }));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: { children: React.ReactNode }) => children,
}));

it('shows a skeleton while the resource suspends', () => {
	const resource = mockBinding.resource;
	mockBinding.resource = new ObservableResource(new Subject());
	render(<CustomersScreen />);
	expect(screen.getByTestId('skeleton-customers')).toBeTruthy();
	mockBinding.resource = resource;
});
it.each([
	[true, true],
	[false, false],
	[false, true],
])('keeps add rules for readOnly=%s capability=%s', (readOnly, canCreate) => {
	mockReadOnly = readOnly;
	mockCanCreate = canCreate;
	render(<CustomersScreen />);
	const button = screen.getByTestId('customers-add-button') as HTMLButtonElement;
	expect(button.disabled).toBe(readOnly || !canCreate);
	mockPush.mockClear();
	fireEvent.click(button);
	if (!readOnly && canCreate) expect(mockPush).toHaveBeenCalledWith({ pathname: '/customers/add' });
	else expect(mockPush).not.toHaveBeenCalled();
});

jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));

it('shows retained rows as searching only while results are pending', () => {
	const original = mockBinding.resource;
	const source = new BehaviorSubject({
		hits: [{ id: 'one', record: { uuid: 'one' } }],
		searchState: 'pending',
		searchActive: true,
	});
	mockBinding.resource = new ObservableResource(source) as typeof original;
	try {
		const { unmount } = render(<CustomersScreen />);
		expect(screen.getByTestId('customers-searching-line')).toBeTruthy();
		act(() => source.next({ ...source.value, searchState: 'answered' }));
		expect(screen.queryByTestId('customers-searching-line')).toBeNull();
		unmount();
	} finally {
		mockBinding.resource = original;
	}
});

jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ children }: React.PropsWithChildren) => children,
}));
