/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

import { CouponsScreen } from './index';

import type { QueryStateOf } from '../../../query';

let mockCanCreate = true;
const mockPush = jest.fn();
const mockSync = jest.fn(async () => undefined);
const mockBinding = {
	resource: new ObservableResource(
		new BehaviorSubject({ hits: [], searchState: 'answered', searchActive: false })
	),
	active$: of(false),
	total$: of(27),
	sync: mockSync,
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
const mockPatch = jest.fn();
let mockDataTableProps: Record<string, unknown> = {};
let mockTooltipProps: { showOnNative?: boolean } = {};
let mockSortBy = 'date_created_gmt';
let mockSortDirection = 'desc';
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
		return <div data-testid="coupons-table" />;
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
		caps: { canCreateCoupons: mockCanCreate },
		known: false,
	}),
}));
jest.mock('../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ patch: mockPatch }),
}));
jest.mock('../hooks/use-date-format', () => ({
	useDateFormat: (value: string | undefined) => value ?? '',
}));
jest.mock('./filter-bar', () => ({ FilterBar: () => null }));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/active', () => ({ Active: () => null }));
jest.mock('./cells/discount-type', () => ({ DiscountType: () => null }));
jest.mock('./cells/editable-amount', () => ({ EditableAmount: () => null }));
jest.mock('./cells/editable-code', () => ({ EditableCode: () => null }));
jest.mock('./cells/editable-date', () => ({ EditableDate: () => null }));
jest.mock('./cells/editable-description', () => ({
	EditableDescription: () => null,
}));
jest.mock('./cells/status', () => ({ Status: () => null }));
jest.mock('./cells/usage', () => ({ Usage: () => null }));

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
		mockTooltipProps = {};
		mockSortBy = 'date_created_gmt';
		mockSortDirection = 'desc';
		mockReadOnly = false;
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
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
	});

	it('keeps the upgrade tooltip available when adding is read-only', () => {
		mockReadOnly = true;

		render(<CouponsScreen />);

		expect(mockTooltipProps.showOnNative).toBe(true);
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

		expect(latestState().sort).toEqual({
			field: 'date_created_gmt',
			direction: 'desc',
		});
	});

	it('commits search through the store only after the input debounce', () => {
		render(<CouponsScreen />);

		fireEvent.change(screen.getByTestId('search-coupons'), {
			target: { value: 'summer' },
		});
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
		expect(mockDataTableProps.sort).toEqual({
			field: 'code',
			direction: 'asc',
		});
	});
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// The legacy string loses the recovery action.
it('distinguishes an empty store from search results and clears search', () => {
	render(<CouponsScreen />);
	let empty = mockDataTableProps.noDataMessage as React.ReactElement<{
		kind: string;
		action?: { onPress: () => void };
	}>;
	expect(empty.props.kind).toBe('empty');
	fireEvent.change(screen.getByTestId('search-coupons'), { target: { value: 'missing' } });
	act(() => jest.advanceTimersByTime(250));
	empty = mockDataTableProps.noDataMessage as typeof empty;
	expect(empty.props.kind).toBe('no-results');
	act(() => empty.props.action!.onPress());
	expect(latestState().search).toBe('');
});

jest.mock('../components/management-bar', () => ({
	ManagementBar: ({ children, search }: { children: React.ReactNode; search: React.ReactNode }) => (
		<>
			{search}
			{children}
		</>
	),
}));
jest.mock('./display-options', () => ({ DisplayOptions: () => null }));
jest.mock('./row', () => ({ CouponRow: () => null }));
jest.mock('./cells/date', () => ({ DateCell: () => null }));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: { children: React.ReactNode }) => children,
}));

it('shows a skeleton while the resource suspends', () => {
	const resource = mockBinding.resource;
	mockBinding.resource = new ObservableResource(new Subject());
	render(<CouponsScreen />);
	expect(screen.getByTestId('skeleton-coupons')).toBeTruthy();
	mockBinding.resource = resource;
});
it.each([
	[true, true],
	[false, false],
	[false, true],
])('keeps add rules for readOnly=%s capability=%s', (readOnly, canCreate) => {
	mockReadOnly = readOnly;
	mockCanCreate = canCreate;
	render(<CouponsScreen />);
	const button = screen.getByTestId('coupons-add-button') as HTMLButtonElement;
	expect(button.disabled).toBe(readOnly || !canCreate);
	mockPush.mockClear();
	fireEvent.click(button);
	if (!readOnly && canCreate) expect(mockPush).toHaveBeenCalledWith({ pathname: '/coupons/add' });
	else expect(mockPush).not.toHaveBeenCalled();
});

it('clears both filters and search from no-results', () => {
	render(<CouponsScreen />);
	const actions = mockDataTableProps.actions as { setFilter: (key: string, value: string) => void };
	act(() => actions.setFilter('status', 'draft'));
	fireEvent.change(screen.getByTestId('search-coupons'), { target: { value: 'missing' } });
	act(() => jest.advanceTimersByTime(250));
	const empty = mockDataTableProps.noDataMessage as React.ReactElement<{
		kind: string;
		action: { onPress: () => void };
	}>;
	expect(empty.props.kind).toBe('no-results');
	act(() => empty.props.action.onPress());
	expect(latestState()).toMatchObject({ search: '', filters: {} });
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
		const { unmount } = render(<CouponsScreen />);
		expect(screen.getByTestId('coupons-searching-line')).toBeTruthy();
		act(() => source.next({ ...source.value, searchState: 'answered' }));
		expect(screen.queryByTestId('coupons-searching-line')).toBeNull();
		unmount();
	} finally {
		mockBinding.resource = original;
	}
});

jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ children }: React.PropsWithChildren) => children,
}));
