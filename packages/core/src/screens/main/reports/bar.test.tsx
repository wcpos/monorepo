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
// The strip reaches expo-haptics through IconButton; it has its own suite.
jest.mock('./till-strip', () => ({
	TillStrip: ({ onOpenClosures }: { onOpenClosures: () => void }) => (
		<button data-testid="till-closures" onClick={onOpenClosures} />
	),
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

// Revert: keep reading the bound store directory after changing the browsing store.
it('offers the selected Pro store registers without rebinding the till', () => {
	isPro = true;
	function Browse() {
		const [selected, select] = React.useState(scope);
		return <Controls room="closures" onRoomChange={room} scope={selected} onScopeChange={select} />;
	}
	render(<Browse />);
	fireEvent.click(screen.getByTestId('reports-scope'));
	fireEvent.click(screen.getByTestId('reports-store-2'));
	expect(screen.queryByTestId('reports-register-other')).toBeNull();
	fireEvent.click(screen.getByTestId('reports-scope'));
	fireEvent.click(screen.getByTestId('reports-register-remote'));
	expect(screen.getByTestId('reports-scope').textContent).toContain('Remote till · Second');
});

// Revert: clear only the menu marker, leaving the popover root open.
it.each([
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
// Revert: leave HeaderLeft at the default 40pt height or let its container shrink.
it.each(['sm', 'md'])(
	'keeps the %s page-bar drawer target at least 48pt and non-shrinking',
	(size) => {
		mockScreenSize = size;
		try {
			render(<Controls room="sales" onRoomChange={room} scope={scope} onScopeChange={change} />);
			const button = screen.getByTestId('drawer-open-button');
			expect(button.className).toContain('h-12');
			expect(button.className).toContain('min-w-12');
			expect(button.className).toContain('shrink-0');
		} finally {
			mockScreenSize = 'sm';
		}
	}
);

// Revert: restore the old room segments.
it.each(['sm', 'md', 'lg'])('renders no tabs row on any width (%s)', (size) => {
	mockScreenSize = size;
	try {
		draw();
		expect(screen.queryByTestId('reports-tabs-row')).toBeNull();
		expect(screen.queryAllByTestId(/^reports-room-/)).toHaveLength(0);
	} finally {
		mockScreenSize = 'sm';
	}
});

// Revert: switch storeId without clamping the period to the destination store day.
it.each([
	['2026-09-18', '2026-09-18', '2026-09-17', '2026-09-17'],
	['2026-06-01', '2026-09-18', '2026-06-17', '2026-09-17'],
])('normalises %s–%s before emitting the destination store scope', (from, to, start, end) => {
	isPro = true;
	jest.setSystemTime(new Date('2026-09-18T01:00:00Z'));
	render(
		<Controls
			room="closures"
			onRoomChange={room}
			onScopeChange={change}
			scope={{ ...scope, storeId: 2, from, to }}
		/>
	);
	fireEvent.click(screen.getByTestId('reports-scope'));
	fireEvent.click(screen.getByTestId('reports-store-1'));
	expect(change).toHaveBeenLastCalledWith({ ...scope, from: start, to: end });
});

// Revert: apply a locked selection before checking Pro, or give every locked edge generic copy.
it.each([
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
