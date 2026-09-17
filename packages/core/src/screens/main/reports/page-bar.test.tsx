/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { HISTORY_DAYS } from '@wcpos/sync-core';

import { PageBar } from './page-bar';
import { ReportsScreen } from './index';

import type { ClosureScope } from './closures/use-closure-rows';

jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
jest.mock('@wcpos/components/button', () => ({
	ButtonText: require('react-native').Text,
	Button: ({
		onPress,
		testID,
		children,
		disabled,
	}: {
		onPress: () => void;
		testID: string;
		children: React.ReactNode;
		disabled?: boolean;
	}) => {
		// The real Button wraps a single string only; sibling text crashes native Pressable.
		if (Array.isArray(children) && children.some((child) => typeof child === 'string'))
			throw new Error('Native Button requires text children to be wrapped');
		return (
			<button data-testid={testID} onClick={onPress} disabled={disabled}>
				{children}
			</button>
		);
	},
}));
jest.mock('@wcpos/components/tabs', () => {
	const C = require('react').createContext(() => {});
	return {
		Tabs: ({
			children,
			onValueChange,
		}: {
			children: React.ReactNode;
			onValueChange: (s: string) => void;
		}) => <C.Provider value={onValueChange}>{children}</C.Provider>,
		TabsList: ({ children }: { children: React.ReactNode }) => children,
		TabsTrigger: ({
			children,
			value,
			testID,
		}: {
			children: React.ReactNode;
			value: string;
			testID: string;
		}) => {
			const change = React.useContext(C) as (s: string) => void;
			return (
				<button data-testid={testID} onClick={() => change(value)}>
					{children}
				</button>
			);
		},
	};
});
jest.mock('@wcpos/components/popover', () => {
	const C = require('react').createContext({ open: false, change: () => {} });
	return {
		Popover: ({
			children,
			open,
			onOpenChange,
		}: {
			children: React.ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}) => {
			const [local, setLocal] = React.useState(false);
			return (
				<C.Provider
					value={{
						open: open ?? local,
						change: (value: boolean) => {
							setLocal(value);
							onOpenChange?.(value);
						},
					}}
				>
					{children}
				</C.Provider>
			);
		},
		PopoverTrigger: React.forwardRef(function MockPopoverTrigger(
			{ children }: { children: React.ReactElement<{ onPress: () => void }> },
			ref
		) {
			const { change } = React.useContext(C) as { change: (value: boolean) => void };
			React.useImperativeHandle(ref, () => ({ close: () => change(false) }));
			return React.cloneElement(children, { onPress: () => change(true) });
		}),
		PopoverContent: ({ children }: { children: React.ReactNode }) =>
			(React.useContext(C) as { open: boolean }).open ? children : null,
	};
});
const calendar = jest.fn();
jest.mock('@wcpos/components/calendar', () => ({
	Calendar: (props: unknown) => {
		calendar(props);
		return null;
	},
}));
jest.mock('../components/header/left', () => ({ HeaderLeft: () => null }));
jest.mock('../components/header/right', () => ({ HeaderRight: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../jest/translate').createTestT(),
}));
jest.mock('../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: require('date-fns').format }),
	convertLocalDateToUTCString: (d: Date) => d.toISOString(),
}));
let isPro = false;
const stores = of([
	{ id: 1, name: 'Shop' },
	{ id: 2, name: 'Second', timezone: 'Pacific/Kiritimati' },
]);
const cashiers = of([
	{ id: 7, display_name: 'Pat' },
	{ id: 8, display_name: 'Alex' },
]);
const session = {
	store: { id: 1, name: 'Shop', timezone: 'America/Los_Angeles' },
	wpCredentials: { id: 7, populate$: () => stores },
	site: { populate$: () => cashiers },
};
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => session,
	useStoreSession: () => session,
}));
jest.mock('../../../hooks/use-app-info', () => ({ useAppInfo: () => ({ license: { isPro } }) }));
jest.mock('../../../services/register/use-register-binding', () => ({
	useRegisterDirectory: (id: number) => ({
		registers:
			id === 2
				? [{ id: 'remote', name: 'Remote till' }]
				: [
						{ id: 'r', name: 'Front' },
						{ id: 'other', name: 'Back' },
					],
	}),
	useRegisterBinding: () => ({
		registerId: 'r',
		registerName: 'Front',
		registers: [
			{ id: 'r', name: 'Front' },
			{ id: 'other', name: 'Back' },
		],
	}),
}));
jest.mock('@wcpos/query', () => ({ useDocField: () => undefined }));
const get = jest.fn();
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: () => ({ get }) }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
const change = jest.fn();
const room = jest.fn();
const scope: ClosureScope = { from: '2026-09-16', to: '2026-09-16', storeId: 1, registerId: 'r' };
beforeEach(() => {
	jest.clearAllMocks();
	isPro = false;
	jest.useFakeTimers().setSystemTime(new Date('2026-09-17T01:00:00Z'));
});
afterEach(() => jest.useRealTimers());
function draw() {
	return render(
		<PageBar room="closures" onRoomChange={room} scope={scope} onScopeChange={change} />
	);
}
// Revert: replace the room segments with the Sales-only page, or derive presets in UTC.
it('switches rooms and selects Yesterday in store time', () => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId('reports-room-sales'));
	expect(room).toHaveBeenCalledWith('sales');
	fireEvent.click(screen.getByTestId('reports-room-closures'));
	expect(room).toHaveBeenCalledWith('closures');
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-yesterday'));
	expect(change).toHaveBeenCalledWith(
		expect.objectContaining({ from: '2026-09-15', to: '2026-09-15' })
	);
});
// Revert: apply a locked selection before checking Pro, or give every locked edge generic copy.
it.each([
	['reports-period-yesterday', 'Earlier closures'],
	['reports-period-thisWeek', 'Earlier closures'],
	['reports-period-lastWeek', 'Earlier closures'],
	['reports-period-thisMonth', 'Earlier closures'],
	['reports-period-lastMonth', 'Earlier closures'],
	['reports-period-previous', 'Earlier closures'],
	['reports-period-custom', 'Custom ranges'],
	['reports-register-other', 'Other registers'],
	['reports-store-2', 'Other stores'],
])('names the locked edge %s without changing scope or fetching', (id, label) => {
	draw();
	fireEvent.click(screen.getByTestId(id.includes('period') ? 'reports-period' : 'reports-scope'));
	fireEvent.click(screen.getByTestId(id));
	expect(screen.getByTestId('reports-lock-hint').textContent).toBe(`${label} are in WCPOS Pro`);
	expect(screen.getByTestId(id).textContent).not.toContain('Locked');
	expect(screen.getByTestId(id).querySelector('[data-icon="lock"]')).toBeTruthy();
	expect(screen.getAllByTestId('reports-see-pro')).toHaveLength(1);
	expect(change).not.toHaveBeenCalled();
	expect(get).not.toHaveBeenCalled();
});
// Revert: omit minDate/maxDate on the custom calendar, or ignore the closer selection.
it('caps custom history and applies the cashier filter', () => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-custom'));
	const props = calendar.mock.calls.at(-1)?.[0];
	expect(props.maxDate).toBe('2026-09-16');
	expect(props.minDate).toBe('2026-06-16');
	expect(HISTORY_DAYS).toBeGreaterThan(0);
	fireEvent.click(screen.getByTestId('reports-cashier'));
	fireEvent.click(screen.getByTestId('reports-cashier-8'));
	expect(change).toHaveBeenCalledWith(expect.objectContaining({ cashier: 8 }));
});

// Revert: clamp only the start, allowing a custom range to end before retained history.
it('keeps both custom endpoints inside retained history', () => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-custom'));
	act(() =>
		calendar.mock.calls
			.at(-1)![0]
			.onDateRangeChange({ from: new Date(2026, 5, 1), to: new Date(2026, 5, 1) })
	);
	fireEvent.click(screen.getByTestId('reports-period-apply'));
	expect(change).toHaveBeenCalledWith(
		expect.objectContaining({ from: '2026-06-16', to: '2026-06-16' })
	);
});

// Revert: print ISO boundaries instead of locale-formatted calendar dates.
it('formats custom period titles', () => {
	render(
		<PageBar
			room="closures"
			onRoomChange={room}
			onScopeChange={change}
			scope={{ from: '2026-09-01', to: '2026-09-04', registerId: 'r', storeId: 1 }}
		/>
	);
	expect(screen.getByTestId('reports-period').textContent).toBe('1 Sep – 4 Sep');
});

// Revert: keep reading the bound store directory after changing the browsing store.
it('offers the selected Pro store registers without rebinding the till', () => {
	isPro = true;
	function Browse() {
		const [selected, select] = React.useState(scope);
		return <PageBar room="closures" onRoomChange={room} scope={selected} onScopeChange={select} />;
	}
	render(<Browse />);
	fireEvent.click(screen.getByTestId('reports-scope'));
	fireEvent.click(screen.getByTestId('reports-store-2'));
	expect(screen.queryByTestId('reports-register-other')).toBeNull();
	fireEvent.click(screen.getByTestId('reports-scope'));
	fireEvent.click(screen.getByTestId('reports-register-remote'));
	expect(screen.getByTestId('reports-scope').textContent).toContain('Remote till · Second');
});

// Revert: omit the page identity ahead of the room control.
it('identifies Reports before the room segments', () => {
	draw();
	expect(screen.getByTestId('reports-title').textContent).toBe('Reports');
	expect(
		screen
			.getByTestId('reports-title')
			.compareDocumentPosition(screen.getByTestId('reports-room-sales')) &
			Node.DOCUMENT_POSITION_FOLLOWING
	).toBeTruthy();
});

// Revert: clear only the menu marker, leaving the popover root open.
it.each([
	['reports-period', 'reports-period-yesterday'],
	['reports-scope', 'reports-register-other'],
	['reports-scope', 'reports-store-2'],
	['reports-cashier', 'reports-cashier-8'],
])('closes %s after selecting %s', (trigger, option) => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId(trigger));
	fireEvent.click(screen.getByTestId(option));
	expect(change).toHaveBeenCalled();
	expect(screen.queryByTestId(option)).toBeNull();
});
// Revert: initialize the custom draft only at mount instead of when Custom opens.
it('seeds Custom from the current scope after selecting another range', () => {
	isPro = true;
	const view = draw();
	view.rerender(
		<PageBar
			room="closures"
			onRoomChange={room}
			scope={{ ...scope, from: '2026-09-01', to: '2026-09-04' }}
			onScopeChange={change}
		/>
	);
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-custom'));
	fireEvent.click(screen.getByTestId('reports-period-apply'));
	expect(change).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: '2026-09-01', to: '2026-09-04' })
	);
});

// Revert: call useStoreDay() without the viewed store id.
it('uses the viewed store day for presets and custom history bounds', () => {
	isPro = true;
	render(
		<PageBar
			room="closures"
			onRoomChange={room}
			scope={{ ...scope, storeId: 2 }}
			onScopeChange={change}
		/>
	);
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-today'));
	expect(change).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: '2026-09-17', to: '2026-09-17' })
	);
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-yesterday'));
	expect(change).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: '2026-09-16', to: '2026-09-16' })
	);
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-custom'));
	expect(calendar.mock.calls.at(-1)?.[0]).toMatchObject({
		minDate: '2026-06-17',
		maxDate: '2026-09-17',
	});
});

let mockRoute: Record<string, string> = {};
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockRoute,
	useRouter: () => ({ setParams: jest.fn() }),
}));
jest.mock('../components/pro-guard', () => ({ withProAccess: (component: unknown) => component }));
jest.mock('../contexts/ui-settings', () => ({ useUISettings: () => ({ uiSettings: {} }) }));
jest.mock('./reports', () => ({ Reports: () => null }));
jest.mock('./context', () => ({
	ReportsProvider: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'sm' }) }));
jest.mock('../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({}),
}));
jest.mock('./closures/closure-list', () => ({ ClosureList: () => null }));
jest.mock('./closures/session-card', () => ({ SessionCard: () => null }));
jest.mock('./closures/save-or-share-csv', () => ({ saveOrShareCsv: jest.fn() }));
jest.mock('@wcpos/components/portal', () => ({ PortalHost: () => null }));
jest.mock('./closures/closure-panel', () => ({
	ClosurePanel: ({ row }: { row: { id: string } }) => (
		<div data-testid="selected-closure">{row.id}</div>
	),
}));
jest.mock('@wcpos/components/dropdown-menu', () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => children,
	DropdownMenuContent: () => null,
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => children,
}));
const mockClosureRows = jest.fn((scope: ClosureScope) => ({
	scope,
	rows: [
		{ id: 'historical', business_day: '2026-09-15' },
		{ id: 'last-closure', business_day: '2026-09-16' },
	].filter((row) => row.business_day >= scope.from && row.business_day <= scope.to),
	localRows: [],
	status: 'ready',
	hasMore: false,
	unavailableIds: new Set(),
}));
jest.mock('./closures/use-closure-rows', () => ({
	useClosureRows: (scope: ClosureScope) => mockClosureRows(scope),
}));

// Revert: silently discard a Free historical link's day but keep its selection, or block today's link too.
it.each([
	['2026-09-15', true],
	['2026-09-16', false],
])('handles a Free last-closure link for %s in the store day', (businessDay, locked) => {
	mockRoute = { closureId: locked ? 'historical' : 'last-closure', businessDay, registerId: 'r' };
	try {
		render(<ReportsScreen />);
		expect(mockClosureRows).toHaveBeenLastCalledWith(
			expect.objectContaining({
				from: '2026-09-16',
				to: '2026-09-16',
				registerId: 'r',
				storeId: 1,
			})
		);
		expect(screen.getByTestId('reports-period').textContent).toBe('Today');
		if (locked) {
			expect(screen.queryByTestId('selected-closure')).toBeNull();
			expect(screen.getByTestId('reports-lock-hint').textContent).toBe(
				'Earlier closures are in WCPOS Pro'
			);
			expect(screen.getAllByTestId('reports-see-pro')).toHaveLength(1);
		} else {
			expect(screen.getByTestId('selected-closure').textContent).toBe('last-closure');
			expect(screen.queryByTestId('reports-lock-hint')).toBeNull();
		}
	} finally {
		mockRoute = {};
	}
});
