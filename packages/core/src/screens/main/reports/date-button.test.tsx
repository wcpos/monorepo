/** @jest-environment jsdom */
import * as React from 'react';
import * as ReactNative from 'react-native';

import { TZDate } from '@date-fns/tz';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { HISTORY_DAYS } from '@wcpos/sync-core';

import { Bar, CashierButton } from './bar';
import { DateButton } from './date-button';
import { ReportsScreen } from './index';

import type { ClosureScope } from './closures/use-closure-rows';

jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
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
		className,
	}: {
		onPress: () => void;
		testID: string;
		children: React.ReactNode;
		disabled?: boolean;
		className?: string;
	}) => {
		// The real Button wraps a single string only; sibling text crashes native Pressable.
		if (Array.isArray(children) && children.some((child) => typeof child === 'string'))
			throw new Error('Native Button requires text children to be wrapped');
		return (
			<button data-testid={testID} onClick={onPress} disabled={disabled} className={className}>
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
let mockTokyoDevice = false;
jest.mock('date-fns', () => ({
	...jest.requireActual('date-fns'),
	parseISO: (value: string) =>
		mockTokyoDevice && /^\d{4}-\d{2}-\d{2}$/.test(value)
			? new TZDate(`${value}T00:00:00+09:00`, 'Asia/Tokyo')
			: jest.requireActual('date-fns').parseISO(value),
}));
const popoverContent = jest.fn();
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
			const { open, change } = React.useContext(C) as {
				open: boolean;
				change: (value: boolean) => void;
			};
			React.useImperativeHandle(ref, () => ({
				open: () => change(true),
				close: () => change(false),
			}));
			return React.cloneElement(children, { onPress: () => change(!open) });
		}),
		PopoverContent: (props: React.PropsWithChildren) => {
			const open = (React.useContext(C) as { open: boolean }).open;
			if (open) popoverContent(props);
			return open ? props.children : null;
		},
	};
});
const calendar = jest.fn();
const nativeCalendar = jest.fn();
jest.mock('@wcpos/components/calendar', () => ({
	Calendar: (props: unknown) => {
		calendar(props);
		const RealCalendar = jest.requireActual('@wcpos/components/calendar').Calendar;
		return <RealCalendar {...(props as React.ComponentProps<typeof RealCalendar>)} />;
	},
}));
jest.mock('uniwind', () => ({ useCSSVariable: () => [] }));
jest.mock('react-native-calendars', () => ({
	Calendar: (props: { onDayPress: (day: { dateString: string }) => void }) => {
		nativeCalendar(props);
		const { onDayPress } = props;
		return (
			<>
				{['2026-09-10', '2026-09-20'].map((day) => (
					<button
						key={day}
						data-testid={`day-${day}`}
						onClick={() => onDayPress({ dateString: day })}
					>
						{day}
					</button>
				))}
			</>
		);
	},
}));
jest.mock('../components/header/upgrade-notice', () => ({ UpgradeNotice: () => null }));
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
function Controls({
	room: currentRoom,
	scope: currentScope,
	onScopeChange,
	onRoomChange,
}: {
	room: 'sales' | 'closures';
	scope: ClosureScope;
	onScopeChange: (scope: ClosureScope) => void;
	onRoomChange: (room: string) => void;
}) {
	return (
		<>
			<Bar
				room={currentRoom}
				scope={currentScope}
				onScopeChange={onScopeChange}
				onBack={() => onRoomChange('sales')}
			/>
			<DateButton
				scope={currentScope}
				storeId={currentScope.storeId}
				onScopeChange={onScopeChange}
				lockedScopeName="Earlier closures"
			/>
			<CashierButton scope={currentScope} onScopeChange={onScopeChange} />
		</>
	);
}
function draw() {
	return render(
		<Controls room="closures" onRoomChange={room} scope={scope} onScopeChange={change} />
	);
}
let mockRoute: Record<string, string> = {};
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockRoute,
	useNavigation: () => ({ openDrawer: jest.fn() }),
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
let mockScreenSize = 'sm';
jest.mock('../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: mockScreenSize }) }));
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
	...jest.requireActual('./closures/use-closure-rows'),
	useClosureRows: (scope: ClosureScope) => mockClosureRows(scope),
}));

// Revert: replace the room segments with the Sales-only page, or derive presets in UTC.
it('returns to Sales from Closures and selects Yesterday in store time', () => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId('reports-back-sales'));
	expect(room).toHaveBeenCalledWith('sales');
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
		<Controls
			room="closures"
			onRoomChange={room}
			onScopeChange={change}
			scope={{ from: '2026-09-01', to: '2026-09-04', registerId: 'r', storeId: 1 }}
		/>
	);
	expect(screen.getByTestId('reports-period').textContent).toBe('1–4 Sep');
});

// Revert: initialize the custom draft only at mount instead of when Custom opens.
it('seeds Custom from the current scope after selecting another range', () => {
	isPro = true;
	const view = draw();
	view.rerender(
		<Controls
			room="closures"
			onRoomChange={room}
			scope={{ ...scope, from: '2026-09-01', to: '2026-09-04' }}
			onScopeChange={change}
		/>
	);
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-apply'));
	expect(change).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: '2026-09-01', to: '2026-09-04' })
	);
});

// Revert: call useStoreDay() without the viewed store id.
it('uses the viewed store day for presets and custom history bounds', () => {
	isPro = true;
	render(
		<Controls
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
	fireEvent.click(screen.getByTestId('reports-period-yesterday'));
	expect(change).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: '2026-09-16', to: '2026-09-16' })
	);
	expect(calendar.mock.calls.at(-1)?.[0]).toMatchObject({
		minDate: '2026-06-17',
		maxDate: '2026-09-17',
	});
});

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
		expect(screen.getByTestId('reports-period').textContent).toBe('Today · Wed 16 Sep');
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

// Revert: clamp only inside the rows hook, leaving the route's old/future heading and selection.
it.each([
	['2026-01-01', '2026-06-16', 'Tue 16 Jun'],
	['2026-09-18', '2026-09-16', 'Today · Wed 16 Sep'],
])(
	'clamps a Pro link for %s before the bar and list, and explains why it cannot open',
	(businessDay, bound, heading) => {
		isPro = true;
		// The target id also exists in the bounded scope: it must not open as an unrelated day.
		mockRoute = { closureId: 'last-closure', businessDay, registerId: 'r' };
		try {
			render(<ReportsScreen />);
			expect(mockClosureRows).toHaveBeenLastCalledWith(
				expect.objectContaining({ from: bound, to: bound })
			);
			expect(screen.getByTestId('reports-period').textContent).toBe(heading);
			expect(screen.queryByTestId('selected-closure')).toBeNull();
			expect(screen.getByTestId('reports-lock-hint').textContent).toBe(
				'This closure is outside available history'
			);
			expect(screen.queryByTestId('reports-see-pro')).toBeNull();
			fireEvent.click(screen.getByTestId('reports-period-today'));
			expect(screen.queryByTestId('reports-lock-hint')).toBeNull();
		} finally {
			mockRoute = {};
		}
	}
);

// Revert: let the shared calendar keep the preset start on the first custom tap.
it('replaces September 1–30 with September 10–20 using two day taps', () => {
	isPro = true;
	jest.setSystemTime(new Date('2026-09-30T12:00:00Z'));
	render(
		<Controls
			room="closures"
			onRoomChange={room}
			onScopeChange={change}
			scope={{ ...scope, from: '2026-09-01', to: '2026-09-30' }}
		/>
	);
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('day-2026-09-10'));
	fireEvent.click(screen.getByTestId('day-2026-09-20'));
	fireEvent.click(screen.getByTestId('reports-period-apply'));
	expect(change).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: '2026-09-10', to: '2026-09-20' })
	);
});

// Revert: discard the single-day preset when opening Custom.
it('keeps a single-day seed when selecting the custom end', () => {
	isPro = true;
	jest.setSystemTime(new Date('2026-09-30T12:00:00Z'));
	draw();
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('day-2026-09-20'));
	fireEvent.click(screen.getByTestId('reports-period-apply'));
	expect(change).toHaveBeenLastCalledWith(
		expect.objectContaining({ from: '2026-09-16', to: '2026-09-20' })
	);
});

// Revert: remove the custom day override (or let it replace the shared semantic theme).
it('gives custom calendar days at least 44pt targets while retaining the shared theme', () => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId('reports-period'));
	const { theme } = nativeCalendar.mock.calls.at(-1)![0];
	expect(theme['stylesheet.day.basic']?.base?.width ?? 32).toBeGreaterThanOrEqual(44);
	expect(theme['stylesheet.day.basic']?.base?.height ?? 32).toBeGreaterThanOrEqual(44);
	expect(theme.textDayFontSize).toBe(14);
	expect(theme['stylesheet.calendar.header']).toBeDefined();
});

// Revert: serialize custom calendar dates with day(), converting their instant to the store zone.
it('applies the tapped Tokyo calendar days when viewing a Los Angeles store', () => {
	isPro = true;
	jest.setSystemTime(new Date('2026-09-30T12:00:00Z'));
	mockTokyoDevice = true;
	try {
		render(
			<Controls
				room="closures"
				onRoomChange={room}
				onScopeChange={change}
				scope={{ ...scope, from: '2026-09-01', to: '2026-09-30' }}
			/>
		);
		fireEvent.click(screen.getByTestId('reports-period'));
		fireEvent.click(screen.getByTestId('day-2026-09-10'));
		fireEvent.click(screen.getByTestId('day-2026-09-20'));
		fireEvent.click(screen.getByTestId('reports-period-apply'));
		expect(change).toHaveBeenLastCalledWith(
			expect.objectContaining({ from: '2026-09-10', to: '2026-09-20' })
		);
	} finally {
		mockTokyoDevice = false;
	}
});

// Revert: restore the 360pt popover/padding, clipping seven 44pt day cells at 320pt.
it('bounds the custom picker to a 320pt viewport with room for all days and Done', () => {
	isPro = true;
	const dimensions = jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
		width: 320,
		height: 568,
		scale: 1,
		fontScale: 1,
	});
	try {
		draw();
		fireEvent.click(screen.getByTestId('reports-period'));
		const props = popoverContent.mock.calls.at(-1)![0];
		expect(props.style?.width ?? 360).toBeLessThanOrEqual(320);
		expect(props.className).toContain('p-0');
		// Calendar has 5pt padding each side; the popover has a 1pt border.
		expect(props.style.width - 10 - 2).toBeGreaterThanOrEqual(7 * 44);
		expect(screen.getByTestId('reports-period-today')).toBeTruthy();
		expect(screen.getByTestId('reports-period-apply')).toBeTruthy();
	} finally {
		dimensions.mockRestore();
	}
});

// Revert: retain custom mode after dismissal, making the preset choices unreachable on reopening.
it('returns to period choices after dismissing the custom picker', () => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period'));
	expect(screen.getByTestId('reports-period-today')).toBeTruthy();
});

// Revert: close the date menu as soon as a preset is selected.
it('keeps the picker open after a quick range and closes it on Done', () => {
	isPro = true;
	draw();
	fireEvent.click(screen.getByTestId('reports-period'));
	fireEvent.click(screen.getByTestId('reports-period-yesterday'));
	expect(screen.queryByTestId('reports-period-yesterday')).not.toBeNull();
	fireEvent.click(screen.getByTestId('reports-period-apply'));
	expect(screen.queryByTestId('reports-period-yesterday')).toBeNull();
});
