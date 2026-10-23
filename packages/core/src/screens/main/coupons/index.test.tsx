/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { CouponsScreen } from './index';

import type { QueryStateOf } from '../../../query';

// The coupons query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
const answered = (hits: unknown[] = []) =>
	fakeQueryHandle({
		result: { hits, searchActive: false, searchState: 'answered' },
		total: 27,
	});
let mockCanCreate = true;
const mockPush = jest.fn();
let mockHandle: FakeHandle = answered();
const mockUseCollectionQueryHandle = jest.fn((_collection: unknown, _state: unknown) => mockHandle);
let mockPointer = 'fine';
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
		useCollectionQueryHandle: (collection: unknown, state: unknown) =>
			mockUseCollectionQueryHandle(collection, state),
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
// The real boundary with a reset control: the screen wires `onReset` to the handle's retry.
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({
			children,
			onReset,
			resetKeys,
		}: {
			children: React.ReactNode;
			onReset?: () => void;
			resetKeys?: unknown[];
		}) => (
			<ErrorBoundary
				onReset={onReset}
				resetKeys={resetKeys}
				fallbackRender={({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => (
					<button data-testid="coupons-error-reset" onClick={() => resetErrorBoundary()} />
				)}
			>
				{children}
			</ErrorBoundary>
		),
	};
});
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
jest.mock('../components/data-table', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		// The real table draws the deferred handle's rows and suspends on an unanswered one.
		const handle = React.useDeferredValue(props.handle as FakeHandle);
		const snapshot = React.useSyncExternalStore(handle.subscribe, () => handle.value);
		if (!snapshot.ready) throw handle.whenAnswered();
		const { result } = snapshot;
		const renderItem = props.renderItem as
			((args: { item: { original: { record: { uuid: string } } } }) => React.ReactNode) | undefined;
		return (
			<div data-testid="coupons-table">
				{(result.hits as { record: { uuid: string } }[]).map((hit) => (
					<React.Fragment key={hit.record.uuid}>
						{renderItem ? renderItem({ item: { original: hit } }) : null}
					</React.Fragment>
				))}
			</div>
		);
	},
}));
jest.mock('../components/data-table/skeleton', () => ({
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
	useMutation: () => ({ patchRecord: mockPatch }),
}));
jest.mock('../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: jest.fn() }),
}));
jest.mock('../hooks/use-date-format', () => ({
	useDateFormat: (value: string | undefined) => value ?? '',
}));
jest.mock('./filter-bar', () => ({ FilterBar: () => <div data-testid="coupons-filter-bar" /> }));
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
	const call = mockUseCollectionQueryHandle.mock.calls.at(-1);
	if (!call) throw new Error('coupons handle was not asked for');
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
		mockPointer = 'fine';
	});

	afterEach(() => jest.useRealTimers());

	it('asks for the coupons handle with the existing default sort and page size', () => {
		render(<CouponsScreen />);

		expect(latestState()).toEqual({
			search: '',
			filters: {},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			handle: mockHandle,
			sort: { field: 'date_created_gmt', direction: 'desc' },
		});
		expect(mockUseCollectionQueryHandle).toHaveBeenLastCalledWith('coupons', latestState());
		expect(mockDataTableProps).not.toHaveProperty('query');
		expect(mockDataTableProps).not.toHaveProperty('resource');
	});

	it('patches an inline edit through the coupons mutation', () => {
		render(<CouponsScreen />);
		const { meta } = mockDataTableProps.tableConfig as {
			meta: { onChange: (args: { document: unknown; changes: unknown }) => void };
		};
		const document = { uuid: 'one' };
		meta.onChange({ document, changes: { code: 'SAVE10' } });
		expect(mockPatch).toHaveBeenCalledWith({ document, data: { code: 'SAVE10' } });
	});

	it('keeps the upgrade tooltip available when adding is read-only', () => {
		mockReadOnly = true;

		render(<CouponsScreen />);

		expect(mockTooltipProps.showOnNative).toBe(true);
	});

	it('initializes the query sort from valid persisted coupon settings', () => {
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
jest.mock('./row', () => ({
	CouponRow: ({ record }: { record: { uuid: string } }) => (
		<div data-testid={`coupons-row-${record.uuid}`} />
	),
}));
jest.mock('./cells/date', () => ({ DateCell: () => null }));
jest.mock('@wcpos/components/lib/device', () => ({
	usePointer: () => mockPointer,
	useIsPhone: () => false,
}));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: { children: React.ReactNode }) => children,
}));

it('shows a skeleton while the handle is unanswered', () => {
	const original = mockHandle;
	mockHandle = fakeQueryHandle({ ready: false });
	try {
		const { unmount } = render(<CouponsScreen />);
		expect(screen.getByTestId('skeleton-coupons')).toBeTruthy();
		expect(screen.queryByTestId('coupons-table')).toBeNull();
		unmount();
	} finally {
		mockHandle = original;
	}
});
it('keeps the current rows, not the skeleton, while a changed query’s handle answers, then shows its rows', async () => {
	mockPointer = 'coarse';
	const original = mockHandle;
	const row = (id: string) => ({ id, record: { uuid: id } });
	mockHandle = answered([row('one')]);
	try {
		render(<CouponsScreen />);
		expect(screen.getByTestId('coupons-row-one')).toBeTruthy();
		// The query changes (a header sort): the screen asks for a new handle, unanswered.
		const next = fakeQueryHandle({ ready: false });
		mockHandle = next;
		act(() =>
			(
				mockDataTableProps.actions as { setSort: (field: string, direction: string) => void }
			).setSort('status', 'asc')
		);
		expect(mockUseCollectionQueryHandle).toHaveBeenLastCalledWith(
			'coupons',
			expect.objectContaining({ sort: { field: 'status', direction: 'asc' } })
		);
		// The old rows stay; no skeleton.
		expect(screen.getByTestId('coupons-row-one')).toBeTruthy();
		expect(screen.queryByTestId('skeleton-coupons')).toBeNull();
		await act(async () =>
			next.set({
				ready: true,
				result: { hits: [row('two')], searchActive: false, searchState: 'answered' },
			})
		);
		expect(screen.getByTestId('coupons-row-two')).toBeTruthy();
		expect(screen.queryByTestId('coupons-row-one')).toBeNull();
	} finally {
		mockHandle = original;
		mockPointer = 'fine';
	}
});
it('throws a failed read to the boundary, whose reset asks the handle again and draws its answer', async () => {
	mockPointer = 'coarse';
	const original = mockHandle;
	const failed = fakeQueryHandle({ ready: false, error: new Error('read failed') });
	const retry = jest.fn(() => {
		failed.set({ error: null, ready: false });
	});
	failed.retry = retry;
	mockHandle = failed;
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		render(<CouponsScreen />);
		expect(screen.getByTestId('coupons-error-reset')).toBeTruthy();
		expect(screen.queryByTestId('coupons-table')).toBeNull();
		// The filter bar stands in its own boundary: a failed read leaves it up.
		expect(screen.getByTestId('coupons-filter-bar')).toBeTruthy();
		// The reset retries through the handle; the reader suspends on the retry.
		act(() => {
			fireEvent.click(screen.getByTestId('coupons-error-reset'));
		});
		expect(retry).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('skeleton-coupons')).toBeTruthy();
		await act(async () =>
			failed.set({
				ready: true,
				result: {
					hits: [{ id: 'one', record: { uuid: 'one' } }],
					searchActive: false,
					searchState: 'answered',
				},
			})
		);
		expect(screen.getByTestId('coupons-row-one')).toBeTruthy();
	} finally {
		consoleError.mockRestore();
		mockHandle = original;
		mockPointer = 'fine';
	}
});
it('clears the fallback on its own when the query changes after a failed read', async () => {
	mockPointer = 'coarse';
	const original = mockHandle;
	mockHandle = fakeQueryHandle({ ready: false, error: new Error('read failed') });
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		render(<CouponsScreen />);
		expect(screen.getByTestId('coupons-error-reset')).toBeTruthy();
		// A search from the bar outside the boundary: a new handle, answered.
		mockHandle = answered([{ id: 'one', record: { uuid: 'one' } }]);
		await act(async () => {
			fireEvent.change(screen.getByTestId('search-coupons'), { target: { value: 'ten' } });
			jest.advanceTimersByTime(250);
		});
		expect(screen.queryByTestId('coupons-error-reset')).toBeNull();
		expect(screen.getByTestId('coupons-row-one')).toBeTruthy();
	} finally {
		consoleError.mockRestore();
		mockHandle = original;
		mockPointer = 'fine';
	}
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
	const original = mockHandle;
	const source = {
		hits: [{ id: 'one', record: { uuid: 'one' } }],
		searchState: 'pending',
		searchActive: true,
	};
	mockHandle = fakeQueryHandle({ result: source, total: 27 });
	try {
		const { unmount } = render(<CouponsScreen />);
		expect(screen.getByTestId('coupons-searching-line')).toBeTruthy();
		act(() => mockHandle.set({ result: { ...source, searchState: 'answered' } }));
		expect(screen.queryByTestId('coupons-searching-line')).toBeNull();
		unmount();
	} finally {
		mockHandle = original;
	}
});

jest.mock('@wcpos/components/docs-link', () => ({
	DocsLink: ({ children }: React.PropsWithChildren) => children,
}));
