/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import type { UserDatabase } from '@wcpos/database';
import {
	readRegister,
	recordCarriedFrom,
	type RegisterDocument,
} from '@wcpos/query/register-session';
import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import { createTestT } from '../../../../../jest/translate';
import { SwitchConfirm, type SwitchRequest } from './switch-confirm';
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeSiteCredentials: () => of(mockCredentials),
	observeCredentialStores: () => of(PENDING_USER_DB_READ, mockOtherStores),
}));

let mockOnline = true;
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnline ? 'online-website-available' : 'offline' }),
}));
jest.mock('../checkout/payments/payment-in-flight', () => ({
	usePaymentInFlight: () => false,
}));

jest.mock('@wcpos/components/radio-group', () => {
	const ReactMock = jest.requireActual('react') as typeof React;
	const Ctx = ReactMock.createContext({ value: '', select: (_value: string) => {} });
	return {
		RadioGroup: ({
			children,
			value,
			onValueChange,
			testID,
		}: React.PropsWithChildren<{
			value: string;
			onValueChange: (value: string) => void;
			testID: string;
		}>) => (
			<Ctx.Provider value={{ value, select: onValueChange }}>
				<div data-testid={testID}>{children}</div>
			</Ctx.Provider>
		),
		RadioGroupOption: ({
			value,
			label,
			description,
			disabled,
			testID,
		}: {
			value: string;
			label: string;
			description?: string;
			disabled?: boolean;
			testID: string;
		}) => {
			const group = ReactMock.useContext(Ctx);
			return (
				<button
					data-testid={testID}
					aria-checked={group.value === value}
					disabled={disabled}
					onClick={() => group.select(value)}
				>
					{label}
					{description}
				</button>
			);
		},
	};
});

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('@wcpos/components/alert-dialog', () => {
	function Box({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	return {
		AlertDialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
			open ? <div>{children}</div> : null,
		AlertDialogContent: ({
			children,
			side,
			testID,
		}: React.PropsWithChildren<{ side: string; testID: string }>) => (
			<div data-testid={testID} data-side={side}>
				{children}
			</div>
		),
		DialogDescription: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
			<div data-testid={testID}>{children}</div>
		),
		AlertDialogHeader: Box,
		AlertDialogTitle: Box,
		AlertDialogDescription: Box,
		AlertDialogFooter: jest.requireActual('../../../../../jest/footer.test-utils')
			.AlertDialogFooter,
		AlertDialogAction: Box,
		AlertDialogCancel: Box,
	};
});
jest.mock('@wcpos/components/portal', () => ({
	Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/toast', () => ({ Toast: { show: jest.fn() } }));

jest.mock('@wcpos/components/image', () => ({ Image: () => null }));

let mockOtherStores = [{ id: 2, localID: 'other-store' }];
const mockLogout = jest.fn();
const mockReplace = jest.fn();
let mockStoreId = 2;
const mockStoreTimezone = 'UTC';
let mockStores = ['store-a'];
let mockSwitching = false;
const mockSwitch = jest.fn(async () => {});
jest.mock('../../hooks/store-list-resource', () => ({ storeListResource: () => 'stores' }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('./use-switch-store', () => ({
	useSwitchStore: () => ({
		...jest.requireActual('./use-switch-store').useSwitchStore(),
		...(mockSwitching ? { isSwitching: true } : {}),
	}),
}));
const mockLogin = jest.fn(async (_input: unknown) => {});
const mockCredentials = [
	{ uuid: 'current', display_name: 'Cashier' },
	{
		uuid: 'other',
		display_name: 'Other cashier',
	},
];
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: (resource: unknown) =>
		resource === 'stores'
			? mockStores.map((localID) => ({ localID, name: localID }))
			: mockCredentials,
}));

const mockPush = jest.fn();
let mockSegments = ['(app)', '(drawer)', '(pos)'];
let mockCartSide = 'left';
let mockLastAccess = '2026-10-28T13:05:00Z';
jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: mockReplace, push: mockPush }),
	useSegments: () => mockSegments,
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));
jest.mock('@wcpos/query/local-data-reset', () => ({
	clearLocalDataNow: jest.fn(),
	scheduleLocalDataReset: jest.fn(),
}));
jest.mock('../../../../utils/reload-app', () => ({ reloadApp: jest.fn() }));
jest.mock('@wcpos/utils/platform', () => ({
	Platform: { OS: 'web', isWeb: true },
}));

const mockObserve = jest.fn((..._args: unknown[]) =>
	of({
		hits: [{ record: { payload: { total: '12.30' } } }, { record: { payload: { total: '7.70' } } }],
	})
);
jest.mock('../../../../../../query/src/engine-query', () => ({
	observeEngineQuery: (...args: unknown[]) => mockObserve(...args),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
	useQueryRuntime: () => ({ engine: 'engine', locale: 'en' }),
	observeCashierSalesTotal: jest.fn(
		jest.requireActual('../../../../../../query/src/reads/cashier-sales').observeCashierSalesTotal
	),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ login: mockLogin, store: { timezone: mockStoreTimezone } }),
	useStoreSession: () => ({
		userDB: mockUserDB,
		wpCredentials: {
			id: 7,
			uuid: 'current',
			display_name: 'Cashier',
			stores: mockStores,
			last_access: mockLastAccess,
		},
		switchStore: mockSwitch,
		store: { localID: 'store-a', id: mockStoreId, name: 'UK Store', price_num_decimals: 2 },
		site: { uuid: 'site', url: 'https://shop.example', populateResource: () => ({}) },
		logout: mockLogout,
	}),
}));
const mockT = createTestT();
jest.mock('../../../../contexts/translations', () => ({ useT: () => mockT }));
let mockAwaitingStore = 0;
jest.mock('../checkout/use-awaiting-store', () => ({
	useAwaitingStoreCount: () => mockAwaitingStore,
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	convertLocalDateToUTCString: (date: Date) => date.toISOString().slice(0, -5),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `$${n.toFixed(2)}` }),
}));
jest.mock('../../../auth/components/add-user-button', () => ({ AddUserButton: () => null }));
const mockBind = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
const mockDirectory = [
	{
		id: 'A',
		name: 'Front counter',
		session: {
			id: 's',
			status: 'open',
			opened_at_gmt: '2026-10-28T09:02:00Z',
			opened_by: { id: 7, name: 'Amy' },
		},
	},
	{ id: 'back', name: 'Back office', last_closure: { number: 41 } },
];
let mockRegisters = mockDirectory;
let mockBindingStatus = 'bound';
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterDirectory: jest.fn(() => mockDirectoryY),
	useRegisterBinding: () => ({
		registers: mockRegisters,
		registerName: 'Front counter',
		registerId: 'A',
		status: mockBindingStatus,
		bind: mockBind,
		refresh: mockRefresh,
	}),
}));
let mockRegisterData: RegisterDocument;
const mockRegisterDoc = {
	toJSON: () => ({ data: mockRegisterData }),
	incrementalModify: async (fn: (data: RegisterDocument) => RegisterDocument) => {
		mockRegisterData = fn(mockRegisterData);
		mockRegisterSource.next(mockRegisterDoc);
		return mockRegisterDoc;
	},
};
const mockRegisterSource = new BehaviorSubject(mockRegisterDoc);
const mockUserDB = {
	getLocal: async () => mockRegisterDoc,
	getLocal$: () => mockRegisterSource,
} as unknown as UserDatabase;
beforeEach(async () => {
	mockRegisterData = { id: 'device', name: 'Device', platform: 'web', created_at: '', sites: {} };
	await readRegister(mockUserDB);
	mockBind.mockClear();
	mockRefresh.mockClear();
});
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => mockCartSide }));

jest.mock('@wcpos/components/dialog', () => {
	function Box({ children }: { children: React.ReactNode }) {
		return <div>{children}</div>;
	}
	return {
		Dialog: ({
			children,
			onOpenChange,
		}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => (
			<div>
				<button data-testid="dismiss" onClick={() => onOpenChange(false)} />
				{children}
			</div>
		),
		DialogContent: ({
			children,
			side,
			testID,
		}: React.PropsWithChildren<{ side: string; testID: string }>) => (
			<div data-testid={testID} data-side={side}>
				{children}
			</div>
		),
		DialogDescription: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) => (
			<div data-testid={testID}>{children}</div>
		),
		DialogHeader: Box,
		DialogTitle: Box,
		DialogBody: Box,
		DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
		disabled,
		'aria-disabled': ariaDisabled,
	}: {
		children: React.ReactNode;
		testID: string;
		onPress: () => void;
		disabled?: boolean;
		'aria-disabled'?: boolean;
	}) => (
		<button data-testid={testID} onClick={onPress} disabled={disabled} aria-disabled={ariaDisabled}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	...jest.requireActual('@wcpos/components/text'),
	Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
		<span data-testid={testID}>{children}</span>
	),
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let mockDirectoryY: {
	registerId: string | null;
	registers: { id: string; name?: string; session?: { opened_at_gmt: string } | null }[];
	loaded?: boolean;
};
// The open-orders handle as the confirm reads it: one stable handle, a snapshot swapped whole
// (useSyncExternalStore needs the same object back until the store changes).
const mockOpenOrdersHandle = { subscribe: () => () => {}, value: { count: 0 } };
jest.mock('../contexts/current-order/use-open-orders-handle', () => ({
	useOpenOrdersHandle: jest.fn(() => mockOpenOrdersHandle),
}));
let mockDrawer = {
	session: { id: 'source', status: 'open', opened_at_gmt: '2026-10-28T09:02:00Z', opened_by: 7 },
	unsyncedCount: 0,
	expected: { cash: 345.03 },
	figuresPending: false,
	blind: false,
	salesCount: 3,
	lastClosure: null as { number: number; server_number?: number | null } | null,
	binding: { status: 'bound', registerName: 'Front counter', registerId: 'front' },
};
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => mockDrawer,
}));

const amy = { uuid: 'amy', display_name: 'Amy Okafor' } as Extract<
	SwitchRequest,
	{ kind: 'cashier' }
>['credential'];
const store = { id: 2, name: 'Other store' } as Extract<SwitchRequest, { kind: 'store' }>['store'];
const onOpenChange = jest.fn();
const onConfirm = jest.fn();
const onSignOutAnyway = jest.fn();
const show = (request: SwitchRequest | null) =>
	render(
		<SwitchConfirm
			request={request}
			onOpenChange={onOpenChange}
			onConfirm={onConfirm}
			onSignOutAnyway={onSignOutAnyway}
		/>
	);
beforeEach(() => {
	mockOpenOrdersHandle.value = { count: 0 };
	mockAwaitingStore = 0;
	mockDrawer.figuresPending = false;
	mockDrawer.unsyncedCount = 0;
	mockOnline = true;
	mockDrawer.blind = false;
	mockDirectoryY = { registerId: null, registers: [], loaded: true };
	onOpenChange.mockClear();
	onConfirm.mockClear();
	onSignOutAnyway.mockClear();
});
it('renders nothing while there is no request', () => {
	show(null);
	expect(screen.queryByTestId('switch-confirm')).toBeNull();
});
it('hand over: the tiles, the waiting notice and the verb', () => {
	mockOpenOrdersHandle.value = { count: 2 };
	mockAwaitingStore = 1;
	show({ kind: 'cashier', credential: amy });
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		'Hand the till to Amy Okafor?'
	);
	expect(screen.getByTestId('switch-confirm-waits').textContent).toBe(
		'Waits here for you2 open carts · 1 unsent sale'
	);
	// The cashier's own scope: this cashier, this store, this register.
	const { useOpenOrdersHandle } = jest.requireMock(
		'../contexts/current-order/use-open-orders-handle'
	);
	expect(useOpenOrdersHandle).toHaveBeenLastCalledWith(7, mockStoreId, 'front');
	expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('Drawer stays at');
	// Two completed orders of this cashier today (the engine mock), not the register's 3.
	expect(screen.getByTestId('user-sheet-sales-today').textContent).toContain(
		'2 sales · since 13:05'
	);
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	expect(onConfirm).toHaveBeenCalledWith({ kind: 'cashier', credential: amy });
	expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('hand over: no notice when nothing waits', () => {
	show({ kind: 'cashier', credential: amy });
	expect(screen.queryByTestId('switch-confirm-waits')).toBeNull();
});
it('hand over with figures pending: the drawer tile says so', () => {
	mockDrawer.figuresPending = true;
	show({ kind: 'cashier', credential: amy });
	expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('—');
	expect(screen.getByTestId('user-sheet-drawer').textContent).toContain(
		'Figures arrive with the next sync'
	);
});
it.each([
	['closed', null, 'Its register is closed.'],
	['open', { opened_at_gmt: '2026-10-28T09:02:00Z' }, 'Its register is open since 09:02.'],
] as const)('store: %s register in the target store', (_name, session, description) => {
	mockDirectoryY = { registerId: 'target', registers: [{ id: 'target', session }] };
	show({ kind: 'store', store });
	const { useRegisterDirectory } = jest.requireMock(
		'../../../../services/register/use-register-binding'
	);
	expect(useRegisterDirectory).toHaveBeenLastCalledWith(store.id, { fresh: true });
	expect(screen.getByTestId('switch-confirm').textContent).toContain(description);
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		session ? "Front counter's drawer stays open here." : 'Take the drawer with you'
	);
});
it('store: unknown register when the target has several and none bound', () => {
	mockDirectoryY = { registerId: null, registers: [{ id: 'a' }, { id: 'b' }], loaded: true };
	show({ kind: 'store', store });
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		"You'll choose a register there."
	);
});
it('store: says nothing about the register while its directory is still loading', () => {
	mockDirectoryY = { registerId: null, registers: [], loaded: false };
	show({ kind: 'store', store });
	const text = screen.getByTestId('switch-confirm').textContent ?? '';
	expect(text).toContain('The POS reloads in Other store.');
	expect(text).not.toContain('register');
});
it("store: the target register's time is told in the target store's day", () => {
	mockDirectoryY = {
		registerId: 'target',
		registers: [{ id: 'target', session: { opened_at_gmt: '2026-10-28T09:02:00Z' } }],
		loaded: true,
	};
	show({ kind: 'store', store: { ...store, timezone: 'America/New_York' } });
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		'Its register is open since 05:02.'
	);
});
it('register: the state notice and the verb', () => {
	const request: SwitchRequest = {
		kind: 'register',
		register: { id: 'back', name: 'Back office', session: null },
		state: 'Closed · last closure #41',
		open: false,
	};
	show(request);
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		"Closed · last closure #41You'll open it with a float."
	);
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	expect(onConfirm).toHaveBeenCalledWith(request);
});
it('register: joins a register the device knows to be open, whatever the directory row says', () => {
	show({
		kind: 'register',
		register: { id: 'back', name: 'Back office', session: null },
		state: 'Open since 09:02 · Amy Okafor',
		open: true,
	});
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		'Open since 09:02 · Amy OkaforYou join it.'
	);
});
it('sign out: close first, or sign out anyway', () => {
	show({ kind: 'sign-out' });
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		'Front counter is still open at $345.03. Close it first?'
	);
	fireEvent.click(screen.getByTestId('switch-confirm-secondary'));
	expect(onSignOutAnyway).toHaveBeenCalledTimes(1);
	expect(onConfirm).not.toHaveBeenCalled();
	expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('sign out with figures pending: Close register is disabled, Sign out anyway is not', () => {
	mockDrawer.figuresPending = true;
	show({ kind: 'sign-out' });
	expect((screen.getByTestId('switch-confirm-confirm') as HTMLButtonElement).disabled).toBe(true);
	expect((screen.getByTestId('switch-confirm-secondary') as HTMLButtonElement).disabled).toBe(
		false
	);
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		'Figures arrive with the next sync'
	);
});
it('sign out for a blind cashier names no amount', () => {
	mockDrawer.blind = true;
	show({ kind: 'sign-out' });
	expect(screen.getByTestId('switch-confirm').textContent).toContain(
		'Front counter is still open. Close it first?'
	);
	expect(screen.getByTestId('switch-confirm').textContent).not.toContain('345.03');
});

const closedTarget = { id: 'target', name: 'Market till', session: null };
// Revert the carry body/selection/guards and the server act disappears or moves unknown cash.
it('defaults to taking the drawer to a known closed target; leaving sends no carry', () => {
	mockDirectoryY = { registerId: 'target', registers: [closedTarget] };
	show({ kind: 'store', store });
	expect(screen.getByTestId('switch-confirm-carry')).toBeTruthy();
	expect(screen.getByTestId('switch-confirm-carry-take').getAttribute('aria-checked')).toBe('true');
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	expect(onConfirm).toHaveBeenLastCalledWith({
		kind: 'store',
		store,
		carry: {
			store: { id: 2, name: 'Other store' },
			register: { id: 'target', name: 'Market till' },
		},
	});
	fireEvent.click(screen.getByTestId('switch-confirm-carry-leave'));
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	expect(onConfirm).toHaveBeenLastCalledWith({ kind: 'store', store });
});
it.each(['pending', 'unsent'])(
	'disables take with its reason when %s, then enables after sync',
	(reason) => {
		mockDirectoryY = { registerId: 'target', registers: [closedTarget] };
		mockDrawer.figuresPending = reason === 'pending';
		mockDrawer.unsyncedCount = reason === 'unsent' ? 2 : 0;
		const request = { kind: 'store' as const, store };
		const view = show(request);
		expect(screen.getByTestId('switch-confirm-carry-take').hasAttribute('disabled')).toBe(true);
		expect(screen.getByTestId('switch-confirm-carry-leave').getAttribute('aria-checked')).toBe(
			'true'
		);
		expect(screen.getByTestId('switch-confirm-carry-reason').textContent).toBe(
			reason === 'pending' ? 'Figures arrive with the next sync.' : 'Send 2 sales first'
		);
		fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
		expect(onConfirm).toHaveBeenLastCalledWith(request);
		mockDrawer.figuresPending = false;
		mockDrawer.unsyncedCount = 0;
		view.rerender(
			<SwitchConfirm
				request={request}
				onConfirm={onConfirm}
				onOpenChange={onOpenChange}
				onSignOutAnyway={onSignOutAnyway}
			/>
		);
		expect(screen.getByTestId('switch-confirm-carry-take').hasAttribute('disabled')).toBe(false);
		fireEvent.click(screen.getByTestId('switch-confirm-carry-take'));
		fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
		expect(onConfirm.mock.calls.at(-1)?.[0].carry).toBeTruthy();
	}
);
it.each(['offline', 'open target', 'unknown target', 'closed source', 'counting source'])(
	'omits the carry for %s',
	(reason) => {
		mockDirectoryY = {
			registerId: 'target',
			registers:
				reason === 'unknown target'
					? []
					: [
							{
								...closedTarget,
								session:
									reason === 'open target' ? { opened_at_gmt: '2026-10-28T09:02:00Z' } : null,
							},
						],
		};
		mockOnline = reason !== 'offline';
		const status = mockDrawer.session.status;
		try {
			if (reason === 'closed source') mockDrawer.session.status = 'closed';
			if (reason === 'counting source') mockDrawer.session.status = 'counting';
			show({ kind: 'store', store });
			expect(screen.queryByTestId('switch-confirm-carry')).toBeNull();
		} finally {
			mockDrawer.session.status = status;
		}
	}
);
it('offers Take the drawer back only for the matching carried session', async () => {
	mockDirectoryY = { registerId: 'target', registers: [closedTarget] };
	await recordCarriedFrom(mockUserDB, 'site', 'front', {
		session_id: 'source',
		closure_id: 'c',
		store_id: 2,
		store_name: 'Other store',
		register_id: 'target',
	});
	show({ kind: 'store', store });
	expect(screen.getByTestId('switch-confirm-carry').textContent).toContain('Take the drawer back');
});
