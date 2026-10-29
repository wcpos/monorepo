/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import type { UserDatabase } from '@wcpos/database';
import {
	readRegister,
	recordLiveSession,
	type RegisterDocument,
} from '@wcpos/query/register-session';
import { Toast } from '@wcpos/components/toast';
import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { LEDGER_META_KEY } from '@wcpos/order-math';

import { createTestT } from '../../../../../jest/translate';
import { consumeRegisterPanelRequest } from './register-panel-request';
import { DrawerTile, UserSheet, useSalesToday } from './user-sheet';
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeSiteCredentials: () => of(mockCredentials),
	observeCredentialStores: () => of(PENDING_USER_DB_READ, mockOtherStores),
}));

let mockPaying = false;
let mockOnline = true;
jest.mock('../checkout/payments/payment-in-flight', () => ({
	usePaymentInFlight: () => mockPaying,
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockOnline ? 'online-website-available' : 'offline' }),
}));

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

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
const mockLogError = jest.fn();
jest.mock('@wcpos/utils/logger', () => {
	const actual = jest.requireActual('@wcpos/utils/logger');
	return {
		...actual,
		log: { ...actual.log, error: (...args: unknown[]) => mockLogError(...args) },
	};
});

jest.mock('@wcpos/components/image', () => ({ Image: () => null }));

let mockOtherStores = [{ id: 2, localID: 'other-store' }];
const mockLogout = jest.fn();
const mockReplace = jest.fn();
let mockStoreId = 2;
let mockStoreTimezone: string | undefined;
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
let mockT: (key: string, options?: Record<string, unknown>) => string = (key) => key;
jest.mock('../../../../contexts/translations', () => ({ useT: () => mockT }));
let mockAwaitingStore = 0;
const mockOpenOrdersHandle = { subscribe: () => () => {}, value: { count: 0 } };
jest.mock('../contexts/current-order/use-open-orders-handle', () => ({
	useOpenOrdersHandle: () => mockOpenOrdersHandle,
}));
jest.mock('../checkout/use-awaiting-store', () => ({
	useAwaitingStoreCount: () => mockAwaitingStore,
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	convertLocalDateToUTCString: (date: Date) => date.toISOString().slice(0, -5),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../../auth/components/add-user-button', () => ({
	AddUserButton: () => <button data-testid="another-account">Another account…</button>,
}));
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
	useRegisterDirectory: () => ({ registers: [], registerId: null }),
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
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

it('switches credentials without retaining the previous cashier authentication override', async () => {
	requestStateManager.setRefreshedToken('previous-cashier-token');
	render(<UserSheet open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('user-sheet-user-other'));
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	await waitFor(() =>
		expect(mockLogin).toHaveBeenCalledWith({
			siteID: 'site',
			wpCredentialsID: 'other',
			storeID: 'other-store',
		})
	);
	expect(requestStateManager.getRefreshedToken()).toBeNull();
});
it('signs out to connect when the other cashier has no stores', async () => {
	mockOtherStores = [];
	mockLogin.mockClear();
	render(<UserSheet open onOpenChange={jest.fn()} />);
	fireEvent.click(screen.getByTestId('user-sheet-user-other'));
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/connect'));
	expect(mockLogout).toHaveBeenCalledTimes(1);
	expect(mockLogin).not.toHaveBeenCalled();
	mockOtherStores = [{ id: 2, localID: 'other-store' }];
});
afterEach(() => requestStateManager.reset());

it.each([
	[2, '2'],
	[0, 'woocommerce-pos'],
] as const)(
	'sums local completed orders for store %s and device-local day',
	async (storeId, posStoreId) => {
		mockStoreId = storeId;
		mockObserve.mockClear();
		const { result } = renderHook(() => useSalesToday());
		await waitFor(() => expect(result.current).toEqual({ total: 20, count: 2 }));
		const descriptor = mockObserve.mock.calls[0][1] as { selector: { date_created_gmt: unknown } };
		expect(descriptor).toMatchObject({
			collection: 'orders',
			selector: {
				status: 'completed',
				posUserId: '7',
				posStoreId,
			},
		});
		const today = new Date();
		const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
		expect(descriptor.selector.date_created_gmt).toEqual({
			$gte: start.toISOString().slice(0, -5),
			$lt: end.toISOString().slice(0, -5),
		});
	}
);

it('keeps only the WordPress admin and desktop links beside the till actions', () => {
	const { openExternalURL } = jest.requireMock('@wcpos/utils/open-external-url');
	render(<UserSheet open onOpenChange={jest.fn()} />);
	// Settings and Support are the drawer's; the local reset lives in Settings (Paul, 2026-10-23).
	expect(screen.queryByTestId('user-sheet-settings')).toBeNull();
	expect(screen.queryByTestId('user-sheet-support')).toBeNull();
	expect(screen.queryByTestId('user-sheet-clear-local-data')).toBeNull();
	expect(screen.getByTestId('user-sheet-sign-out')).toBeTruthy();
	const foot = screen.getByTestId('user-sheet-foot');
	expect(foot.contains(screen.getByTestId('user-sheet-wp-admin'))).toBe(true);
	expect(foot.lastElementChild).toBe(screen.getByTestId('user-sheet-desktop-app'));
	expect(foot.parentElement?.lastElementChild).toBe(foot);
	fireEvent.click(screen.getByTestId('user-sheet-wp-admin'));
	expect(openExternalURL).toHaveBeenCalledWith('https://shop.example/wp-admin');
	fireEvent.click(screen.getByTestId('user-sheet-desktop-app'));
	expect(openExternalURL).toHaveBeenCalledWith('https://github.com/wcpos/electron/releases');
});

it('omits the desktop download and WordPress admin on native', () => {
	const { Platform } = jest.requireMock('@wcpos/utils/platform');
	Platform.isWeb = false;
	try {
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('user-sheet-desktop-app')).toBeNull();
		expect(screen.queryByTestId('user-sheet-wp-admin')).toBeNull();
	} finally {
		Platform.isWeb = true;
	}
});

let mockCart:
	| {
			payload: {
				status?: string;
				meta_data: { key: string; value: string }[];
				line_items?: { product_id: number }[];
			};
	  }
	| undefined = {
	payload: { meta_data: [] as { key: string; value: string }[] },
};
jest.mock('../contexts/current-order/context', () => ({
	useCurrentOrderOptional: () => mockCart,
}));
// Undefined is the rail variant: outside CurrentOrderProvider, switching fails closed.
it.each([true, false, undefined])('guards cart and rail switching: %s', (attributed) => {
	mockCart =
		attributed === undefined
			? undefined
			: {
					payload: {
						meta_data: attributed ? [{ key: '_wcpos_register', value: 'A' }] : [],
						line_items: attributed ? [{ product_id: 1 }] : [],
					},
				};
	const blocked = attributed !== false;
	const switchRegister = mockBind;
	render(<UserSheet open onOpenChange={jest.fn()} portalHost={null} />);
	const button = screen.getByTestId('user-sheet-register-back');
	expect(button.getAttribute('aria-disabled') === 'true').toBe(blocked);
	// The rail's sheet has no cart to finish: its reason is that the switch is not available here.
	const reason =
		attributed === undefined
			? 'register.switch_register_unavailable_here'
			: 'register.switch_register_blocked_cart';
	expect(button.textContent?.includes(reason)).toBe(blocked);

	fireEvent.click(button);
	if (!blocked) fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	expect(switchRegister).toHaveBeenCalledTimes(blocked ? 0 : 1);
});

it('allows switching from an empty attributed template', () => {
	mockCart = {
		payload: { status: 'pos-open', meta_data: [{ key: '_wcpos_register', value: 'A' }] },
	};
	const switchRegister = mockBind;
	render(<UserSheet open onOpenChange={jest.fn()} />);
	const button = screen.getByTestId('user-sheet-register-back');
	expect(button.getAttribute('aria-disabled')).not.toBe('true');
	expect(screen.queryByText('register.switch_register_blocked_cart')).toBeNull();
	fireEvent.click(button);
	fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
	expect(switchRegister).toHaveBeenCalledTimes(1);
});

it.each(['pos-partial', 'ledger'])(
	'blocks a line-empty attributed cart with %s payment state',
	(state) => {
		mockCart = {
			payload: {
				status: state === 'pos-partial' ? state : 'pos-open',
				meta_data: [{ key: '_wcpos_register', value: 'A' }],
			},
		};
		if (state === 'ledger')
			mockCart.payload.meta_data.push({
				key: LEDGER_META_KEY,
				value: JSON.stringify({
					schema: 1,
					payments: [{ id: 'p1', amount: '50', method: 'cash', status: 'captured' }],
				}),
			});
		const switchRegister = mockBind;
		render(<UserSheet open onOpenChange={jest.fn()} />);
		const button = screen.getByTestId('user-sheet-register-back');
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(button.textContent).toContain('register.switch_register_blocked_cart');
		fireEvent.click(button);
		expect(switchRegister).not.toHaveBeenCalled();
	}
);

describe('store band', () => {
	beforeEach(() => {
		mockStores = ['store-a', 'store-b'];
		mockSwitch.mockClear();
		mockReplace.mockClear();
	});
	afterEach(() => {
		mockStores = ['store-a'];
		mockSwitching = false;
	});
	it('offers no store band on a login with one store', () => {
		mockStores = ['store-a'];
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('user-sheet-store-band')).toBeNull();
	});
	it('lists the other stores in the Store band when the login has more', () => {
		render(<UserSheet open onOpenChange={jest.fn()} portalHost={null} />);
		expect(screen.getByTestId('user-sheet-store-store-a').getAttribute('aria-checked')).toBe(
			'true'
		);
		expect(screen.getByTestId('user-sheet-store-store-b')).toBeTruthy();
	});
	it('switches to the chosen store from the band', async () => {
		const onOpenChange = jest.fn();
		render(<UserSheet open onOpenChange={onOpenChange} />);
		await act(async () => fireEvent.click(screen.getByTestId('user-sheet-store-store-b')));
		await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
		expect(mockSwitch).toHaveBeenCalledWith(expect.objectContaining({ localID: 'store-b' }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
	it('blocks the app and refuses dismissal while a switch is hydrating', () => {
		mockSwitching = true;
		const onOpenChange = jest.fn();
		render(<UserSheet open onOpenChange={onOpenChange} />);
		expect(screen.getByTestId('store-switch-overlay')).toBeTruthy();
		fireEvent.click(screen.getByTestId('dismiss'));
		expect(onOpenChange).not.toHaveBeenCalled();
		const row = screen.getByTestId('user-sheet-store-store-b');
		expect(row.getAttribute('aria-disabled')).toBe('true');
		fireEvent.click(row);
		expect(mockSwitch).not.toHaveBeenCalled();
	});
	it('holds every other session-changing action while a switch is hydrating', () => {
		mockSwitching = true;
		render(<UserSheet open onOpenChange={jest.fn()} />);
		const other = screen.getByTestId('user-sheet-user-other');
		expect(other.getAttribute('aria-disabled')).toBe('true');
		fireEvent.click(other);
		expect(mockLogin).not.toHaveBeenCalled();
		expect(screen.getByTestId('user-sheet-register-back').getAttribute('aria-disabled')).toBe(
			'true'
		);
		fireEvent.click(screen.getByTestId('user-sheet-register-back'));
		expect(mockBind).not.toHaveBeenCalled();
		const signOut = screen.getByTestId('user-sheet-sign-out') as HTMLButtonElement;
		expect(signOut.disabled).toBe(true);
		mockLogout.mockClear();
		fireEvent.click(signOut);
		expect(mockLogout).not.toHaveBeenCalled();
	});
	it('holds the store band while a cashier switch is in flight', async () => {
		let finish: () => void = () => {};
		mockLogin.mockClear();
		mockLogin.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
		const storeId = mockStoreId;
		mockStoreId = 2;
		try {
			render(<UserSheet open onOpenChange={jest.fn()} />);
			await act(async () => fireEvent.click(screen.getByTestId('user-sheet-user-other')));
			await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
			await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
			const row = screen.getByTestId('user-sheet-store-store-b');
			expect(row.getAttribute('aria-disabled')).toBe('true');
			fireEvent.click(row);
			expect(mockSwitch).not.toHaveBeenCalled();
			await act(async () => finish());
			expect(row.getAttribute('aria-disabled')).not.toBe('true');
		} finally {
			mockStoreId = storeId;
		}
	});
	it('holds the store band while a register bind is pending', async () => {
		let finish: () => void = () => {};
		mockBind.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
		const cart = mockCart;
		mockCart = { payload: { meta_data: [] } };
		try {
			render(<UserSheet open onOpenChange={jest.fn()} />);
			await act(async () => fireEvent.click(screen.getByTestId('user-sheet-register-back')));
			await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
			expect(mockBind).toHaveBeenCalledWith('back');
			const row = screen.getByTestId('user-sheet-store-store-b');
			expect(row.getAttribute('aria-disabled')).toBe('true');
			fireEvent.click(row);
			expect(mockSwitch).not.toHaveBeenCalled();
			await act(async () => finish());
			expect(row.getAttribute('aria-disabled')).not.toBe('true');
		} finally {
			mockCart = cart;
		}
	});
	it('keeps the sheet open and shows a toast when hydration fails', async () => {
		mockSwitch.mockRejectedValueOnce(new Error('hydration failed'));
		const onOpenChange = jest.fn();
		render(<UserSheet open onOpenChange={onOpenChange} />);
		await act(async () => fireEvent.click(screen.getByTestId('user-sheet-store-store-b')));
		await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
		expect(screen.getByTestId('user-sheet')).toBeTruthy();
		expect(screen.queryByTestId('store-switch-overlay')).toBeNull();
	});
});

it('uses the store day, re-subscribes at store midnight and cleans up its timer', async () => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-10-25T10:59:59Z'));
	mockStoreTimezone = 'Pacific/Pago_Pago';
	mockObserve.mockClear();
	try {
		const { unmount } = renderHook(() => useSalesToday());
		expect(mockObserve).toHaveBeenCalledTimes(1);
		const { observeCashierSalesTotal } = jest.requireMock('@wcpos/query');
		expect(observeCashierSalesTotal).toHaveBeenLastCalledWith(
			'engine',
			expect.objectContaining({ fromGmt: '2026-10-24T11:00:00', toGmt: '2026-10-25T11:00:00' })
		);
		await act(async () => {
			jest.advanceTimersByTime(1001);
		});
		expect(mockObserve).toHaveBeenCalledTimes(2);
		const descriptor = mockObserve.mock.calls[1][1] as { selector: { date_created_gmt: unknown } };
		expect(descriptor.selector.date_created_gmt).toEqual({
			$gte: '2026-10-25T11:00:00',
			$lt: '2026-10-26T11:00:00',
		});
		await act(async () => {
			jest.advanceTimersByTime(new Date('2026-10-26T11:00:00Z').getTime() - Date.now());
		});
		expect(mockObserve).toHaveBeenCalledTimes(3);
		expect(mockObserve.mock.calls[2][1]).toMatchObject({
			selector: {
				date_created_gmt: {
					$gte: '2026-10-26T11:00:00',
					$lt: '2026-10-27T11:00:00',
				},
			},
		});
		unmount();
		// Async React act queues microtasks; they are not the midnight timer.
		jest.runAllTicks();
		expect(jest.getTimerCount()).toBe(0);
	} finally {
		mockStoreTimezone = undefined;
		jest.useRealTimers();
	}
});

describe('awaiting store', () => {
	beforeEach(() => {
		mockT = createTestT();
	});
	afterEach(() => {
		mockAwaitingStore = 0;
		mockT = (key) => key;
	});

	it('shows nothing when the store has heard every sale', () => {
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('user-sheet-awaiting-store')).toBeNull();
	});

	it('tells the cashier the sale is kept for them on this till', () => {
		mockAwaitingStore = 1;
		render(<UserSheet open onOpenChange={jest.fn()} />);
		const row = screen.getByTestId('user-sheet-awaiting-store');
		expect(row.textContent).toContain('Awaiting store');
		expect(row.textContent).toContain('1 sale');
		expect(row.textContent).not.toContain('1 sales');
		expect(row.textContent).toContain('Sent when you are signed in online.');
	});

	it('counts several sales', () => {
		mockAwaitingStore = 3;
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('user-sheet-awaiting-store').textContent).toContain('3 sales');
	});
});

describe('side and header', () => {
	afterEach(() => {
		mockT = (key) => key;
		mockSegments = ['(app)', '(drawer)', '(pos)'];
		mockStoreTimezone = undefined;
	});
	it('comes from the products side on the POS, whichever host portals it, and from the right elsewhere', () => {
		mockCartSide = 'left';
		let r = render(<UserSheet open onOpenChange={jest.fn()} portalHost="pos" />);
		expect(screen.getByTestId('user-sheet').getAttribute('data-side')).toBe('left');
		r.unmount();
		r = render(<UserSheet open onOpenChange={jest.fn()} portalHost={null} />);
		expect(screen.getByTestId('user-sheet').getAttribute('data-side')).toBe('left');
		r.unmount();
		mockCartSide = 'right';
		r = render(<UserSheet open onOpenChange={jest.fn()} portalHost={null} />);
		expect(screen.getByTestId('user-sheet').getAttribute('data-side')).toBe('right');
		r.unmount();
		mockCartSide = 'left';
		mockSegments = ['(app)', '(drawer)', 'orders'];
		render(<UserSheet open onOpenChange={jest.fn()} portalHost={null} />);
		expect(screen.getByTestId('user-sheet').getAttribute('data-side')).toBe('right');
	});
	it('describes the cashier by store, register and sign-in time', () => {
		mockT = createTestT();
		mockStoreTimezone = 'UTC';
		render(<UserSheet open onOpenChange={jest.fn()} portalHost="pos" />);
		expect(screen.getByTestId('user-sheet-description').textContent).toBe(
			'UK Store · Front counter · since 13:05'
		);
	});
	it('drops the sign-in time when the credential carries an unreadable stamp', () => {
		mockT = createTestT();
		mockLastAccess = 'not a date';
		try {
			render(<UserSheet open onOpenChange={jest.fn()} portalHost="pos" />);
			expect(screen.getByTestId('user-sheet-description').textContent).toBe(
				'UK Store · Front counter'
			);
		} finally {
			mockLastAccess = '2026-10-28T13:05:00Z';
		}
	});
});

let mockDrawer = {
	session: { opened_at_gmt: '2026-10-28T09:02:00Z', opened_by: 7, status: 'open' } as {
		opened_at_gmt: string;
		opened_by: number;
		status: string;
	} | null,
	expected: { cash: 345.03 },
	figuresPending: false,
	blind: false,
	salesCount: 3,
	lastClosure: null as { number: number; server_number?: number | null } | null,
	binding: { status: 'bound', registerName: 'Front counter' },
	countingHere: false,
	countingBy: null as { id: number; name: string | null; at: string | null } | null,
	loaded: true,
	actions: { startCounting: jest.fn(async () => {}) },
};
jest.mock('../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => mockDrawer,
}));
describe('drawer door', () => {
	const onOpenChange = jest.fn();
	beforeEach(() => {
		mockT = createTestT();
		onOpenChange.mockClear();
		mockPush.mockClear();
	});
	afterEach(() => {
		mockT = (key) => key;
		mockDrawer.figuresPending = false;
		mockDrawer.blind = false;
		mockDrawer.binding.status = 'bound';
		mockDrawer.loaded = true;
	});
	it('shows the drawer as a door and opens the register panel on the POS', () => {
		const onOpenRegister = jest.fn();
		render(
			<UserSheet
				open
				onOpenChange={onOpenChange}
				portalHost="pos"
				onOpenRegister={onOpenRegister}
			/>
		);
		expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('345.03');
		fireEvent.click(screen.getByTestId('user-sheet-drawer'));
		expect(onOpenRegister).toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
	});
	// The one door to the register (Paul, 2026-10-29) reads as one: the row's chevron. The confirm's
	// tile only shows, so it has none.
	it('the door carries a chevron; the tile with no door does not', () => {
		const { unmount } = render(<UserSheet open onOpenChange={onOpenChange} portalHost="pos" />);
		const chevron = '[data-icon="chevronRight"]';
		expect(screen.getByTestId('user-sheet-drawer').querySelector(chevron)).not.toBeNull();
		unmount();
		render(<DrawerTile label="Drawer stays at" />);
		expect(screen.getByTestId('user-sheet-drawer').querySelector(chevron)).toBeNull();
	});
	it('from a page bar, the drawer door goes to the POS and asks for the panel', () => {
		mockSegments = ['(app)', '(drawer)', 'orders'];
		render(<UserSheet open onOpenChange={onOpenChange} portalHost={null} />);
		fireEvent.click(screen.getByTestId('user-sheet-drawer'));
		expect(mockPush).toHaveBeenCalledWith('/(app)/(drawer)/(pos)');
		expect(consumeRegisterPanelRequest()).toBe('register');
		mockSegments = ['(app)', '(drawer)', '(pos)'];
	});
	it("opening the sheet before a seeded session's first refresh shows the drawer as unknown", () => {
		mockDrawer.figuresPending = true;
		render(<UserSheet open onOpenChange={onOpenChange} />);
		expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('—');
		expect(screen.getByTestId('user-sheet-drawer').textContent).toContain(
			'Figures arrive with the next sync'
		);
	});
	it('says the register is closed with its last closure when there is no session', () => {
		const session = mockDrawer.session;
		Object.assign(mockDrawer, { session: null, lastClosure: { number: 12 } });
		render(<UserSheet open onOpenChange={onOpenChange} />);
		expect(screen.getByTestId('user-sheet-drawer').textContent).toContain(
			'Register closed · last closure 12'
		);
		Object.assign(mockDrawer, { session, lastClosure: null });
	});
	it('shows the acknowledged closure number over the provisional one', () => {
		const session = mockDrawer.session;
		Object.assign(mockDrawer, { session: null, lastClosure: { number: 12, server_number: 58 } });
		try {
			render(<UserSheet open onOpenChange={onOpenChange} />);
			expect(screen.getByTestId('user-sheet-drawer').textContent).toContain(
				'Register closed · last closure 58'
			);
		} finally {
			Object.assign(mockDrawer, { session, lastClosure: null });
		}
	});
	it('offers no drawer door when the register panel has no session or closure to show', () => {
		const session = mockDrawer.session;
		Object.assign(mockDrawer, { session: null, lastClosure: null });
		try {
			render(<UserSheet open onOpenChange={onOpenChange} />);
			expect(screen.queryByTestId('user-sheet-drawer')).toBeNull();
		} finally {
			Object.assign(mockDrawer, { session });
		}
	});
	it('shows only the sales count to a blind cashier', () => {
		mockDrawer.blind = true;
		render(<UserSheet open onOpenChange={onOpenChange} />);
		expect(screen.getByTestId('user-sheet-drawer').textContent).toContain('3 sales');
		expect(screen.getByTestId('user-sheet-drawer').textContent).not.toContain('345.03');
	});
	it('has no drawer tile while unbound', () => {
		mockDrawer.binding.status = 'unbound';
		render(<UserSheet open onOpenChange={onOpenChange} />);
		expect(screen.queryByTestId('user-sheet-drawer')).toBeNull();
	});
});

it('lists every cashier saved on this device with the current one checked', () => {
	render(<UserSheet open onOpenChange={jest.fn()} />);
	expect(screen.getByTestId('user-sheet-cashier-current').getAttribute('aria-checked')).toBe(
		'true'
	);
	expect(screen.getByTestId('user-sheet-user-other').getAttribute('aria-disabled')).not.toBe(
		'true'
	);
});

describe('register band', () => {
	beforeEach(() => {
		mockT = createTestT();
		mockCart = { payload: { meta_data: [] } };
		mockStoreTimezone = 'UTC';
	});
	afterEach(() => {
		mockRegisters = mockDirectory;
		mockBindingStatus = 'bound';
		mockT = (key) => key;
		mockStoreTimezone = undefined;
	});
	it('refreshes the directory each time the band opens', () => {
		const first = render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(mockRefresh).toHaveBeenCalledTimes(1);
		first.unmount();
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(mockRefresh).toHaveBeenCalledTimes(2);
	});
	it('offers no register band on a store with one register', () => {
		mockRegisters = [mockDirectory[0]];
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('user-sheet-register-band')).toBeNull();
	});
	it('leaves the unbound case to the cart picker', () => {
		mockBindingStatus = 'choose';
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('user-sheet-register-band')).toBeNull();
	});
	it('lists each register with its live state and binds the tapped one', async () => {
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('user-sheet-register-A').textContent).toContain(
			'Open since 09:02 · Amy'
		);
		expect(screen.getByTestId('user-sheet-register-A').getAttribute('aria-checked')).toBe('true');
		expect(screen.getByTestId('user-sheet-register-back').textContent).toContain(
			'Closed · last closure #41'
		);
		fireEvent.click(screen.getByTestId('user-sheet-register-back'));
		fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
		await waitFor(() => expect(mockBind).toHaveBeenCalledWith('back'));
	});
	it('follows the cache after the directory loaded: counting, then cleared', async () => {
		render(<UserSheet open onOpenChange={jest.fn()} />);
		await act(async () =>
			recordLiveSession(mockUserDB, 'site', 'A', {
				session_id: 's',
				status: 'counting',
				opened_at_gmt: '2026-10-28T09:02:00Z',
				opened_by: { id: 7, name: 'Amy' },
				acknowledged: true,
				expected_float: null,
				counted_float: null,
				business_day: null,
			})
		);
		expect(screen.getByTestId('user-sheet-register-A').textContent).toContain('Counting');
		await act(async () => recordLiveSession(mockUserDB, 'site', 'A', null));
		expect(screen.getByTestId('user-sheet-register-A').textContent).toContain(
			'Closed · last closure #—'
		);
	});
	it('disables the other registers with the reason while a cart is attributed, not the cashiers', () => {
		mockCart = {
			payload: {
				meta_data: [{ key: '_wcpos_register', value: 'A' }],
				line_items: [{ product_id: 1 }],
			},
		};
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('user-sheet-register-back').getAttribute('aria-disabled')).toBe(
			'true'
		);
		expect(screen.getByTestId('user-sheet-register-back').textContent).toContain(
			'Finish or park the current sale'
		);
		expect(screen.getByTestId('user-sheet-user-other').getAttribute('aria-disabled')).not.toBe(
			'true'
		);
	});
});

describe('switch confirmations and guards', () => {
	let previous: {
		storeId: typeof mockStoreId;
		cart: typeof mockCart;
		stores: typeof mockStores;
		drawer: typeof mockDrawer;
	};
	beforeEach(() => {
		previous = {
			storeId: mockStoreId,
			cart: mockCart,
			stores: mockStores,
			drawer: { ...mockDrawer },
		};
		mockStoreId = 2;
		mockCart = { payload: { meta_data: [] } };
		mockStores = ['store-a', 'store-b'];
		mockT = createTestT();
		mockLogin.mockClear();
		mockLogout.mockClear();
		mockDrawer.actions.startCounting.mockClear();
		consumeRegisterPanelRequest();
	});
	afterEach(() => {
		mockStoreId = previous.storeId;
		mockCart = previous.cart;
		mockStores = previous.stores;
		mockDrawer = previous.drawer;
		mockPaying = false;
		mockOnline = true;
		mockT = (key) => key;
	});
	it('asks before handing the till over, and runs the login on confirm', async () => {
		render(<UserSheet open onOpenChange={jest.fn()} />);
		fireEvent.click(screen.getByTestId('user-sheet-user-other'));
		expect(screen.getByTestId('switch-confirm')).toBeTruthy();
		expect(mockLogin).not.toHaveBeenCalled();
		await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
		expect(mockLogin).toHaveBeenCalledWith({
			siteID: 'site',
			wpCredentialsID: 'other',
			storeID: 'other-store',
		});
	});
	it('cancelling the confirm leaves everything as it was', () => {
		const close = jest.fn();
		render(<UserSheet open onOpenChange={close} />);
		fireEvent.click(screen.getByTestId('user-sheet-user-other'));
		fireEvent.click(screen.getByTestId('switch-confirm-cancel'));
		expect(screen.queryByTestId('switch-confirm')).toBeNull();
		expect(mockLogin).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
		expect(screen.getByTestId('user-sheet')).toBeTruthy();
	});
	it('holds every row and Sign out while a payment is in flight, and says why once', () => {
		const previous = mockPaying;
		mockPaying = true;
		try {
			const { rerender } = render(<UserSheet open onOpenChange={jest.fn()} />);
			expect(screen.queryByTestId('another-account')).toBeNull();
			expect(screen.getAllByTestId('user-sheet-hold')).toHaveLength(1);
			expect(screen.getByTestId('user-sheet-hold').textContent).toContain(
				'Finish the payment first'
			);
			for (const id of [
				'user-sheet-user-other',
				'user-sheet-store-store-b',
				'user-sheet-register-back',
			]) {
				expect(screen.getByTestId(id).getAttribute('aria-disabled')).toBe('true');
				fireEvent.click(screen.getByTestId(id));
			}
			expect((screen.getByTestId('user-sheet-sign-out') as HTMLButtonElement).disabled).toBe(true);
			expect(screen.queryByTestId('switch-confirm')).toBeNull();
			mockPaying = false;
			rerender(<UserSheet open onOpenChange={jest.fn()} />);
			expect(screen.queryByTestId('user-sheet-hold')).toBeNull();
			expect(screen.getByTestId('another-account')).toBeTruthy();
			for (const id of [
				'user-sheet-user-other',
				'user-sheet-store-store-b',
				'user-sheet-register-back',
			])
				expect(screen.getByTestId(id).getAttribute('aria-disabled')).not.toBe('true');
		} finally {
			mockPaying = previous;
		}
	});
	it('holds only the cashier rows while this device is counting', () => {
		const previous = mockDrawer.countingHere;
		mockDrawer.countingHere = true;
		try {
			render(<UserSheet open onOpenChange={jest.fn()} />);
			expect(screen.getByTestId('user-sheet-user-other').getAttribute('aria-disabled')).toBe(
				'true'
			);
			expect(screen.getByTestId('user-sheet-user-other').textContent).toContain(
				'Finish or abandon the count first'
			);
			for (const id of ['user-sheet-store-store-b', 'user-sheet-register-back'])
				expect(screen.getByTestId(id).getAttribute('aria-disabled')).not.toBe('true');
		} finally {
			mockDrawer.countingHere = previous;
		}
	});
	it('offline: store rows are held and Another account is hidden, a saved cashier is not', async () => {
		const previous = mockOnline;
		mockOnline = false;
		try {
			render(<UserSheet open onOpenChange={jest.fn()} />);
			expect(screen.getByTestId('user-sheet-store-store-b').getAttribute('aria-disabled')).toBe(
				'true'
			);
			expect(screen.getByTestId('user-sheet-store-store-b').textContent).toContain(
				'Needs the store to switch'
			);
			expect(screen.queryByTestId('another-account')).toBeNull();
			expect(screen.getByTestId('user-sheet-user-other').getAttribute('aria-disabled')).not.toBe(
				'true'
			);
			fireEvent.click(screen.getByTestId('user-sheet-user-other'));
			expect(screen.getByTestId('switch-confirm')).toBeTruthy();
			await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
			expect(mockLogin).toHaveBeenCalledTimes(1);
		} finally {
			mockOnline = previous;
		}
	});
	it('Sign out with an open register asks to close first; Close register opens the count', async () => {
		const close = jest.fn();
		render(<UserSheet open onOpenChange={close} />);
		fireEvent.click(screen.getByTestId('user-sheet-sign-out'));
		expect(screen.getByTestId('switch-confirm')).toBeTruthy();
		await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
		expect(mockDrawer.actions.startCounting).toHaveBeenCalledTimes(1);
		expect(consumeRegisterPanelRequest()).toBe('count');
		expect(close).toHaveBeenCalledWith(false);
		expect(mockLogout).not.toHaveBeenCalled();
	});
	it('a refused count keeps the sheet and says so; the register panel is not opened', async () => {
		const close = jest.fn();
		mockDrawer.actions.startCounting.mockRejectedValueOnce(new Error('register_figures_pending'));
		render(<UserSheet open onOpenChange={close} />);
		fireEvent.click(screen.getByTestId('user-sheet-sign-out'));
		await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-confirm')));
		expect(consumeRegisterPanelRequest()).toBeNull();
		expect(close).not.toHaveBeenCalledWith(false);
		expect(mockLogError).toHaveBeenCalledWith(
			'The count could not start',
			expect.objectContaining({ showToast: true })
		);
		expect(mockLogout).not.toHaveBeenCalled();
	});
	it('Sign out anyway signs out', async () => {
		render(<UserSheet open onOpenChange={jest.fn()} />);
		fireEvent.click(screen.getByTestId('user-sheet-sign-out'));
		await act(async () => fireEvent.click(screen.getByTestId('switch-confirm-secondary')));
		expect(mockLogout).toHaveBeenCalledTimes(1);
		expect(mockDrawer.actions.startCounting).not.toHaveBeenCalled();
	});
	it('Sign out waits while a bound register is still loading, never treating it as closed', () => {
		Object.assign(mockDrawer, { session: null, loaded: false });
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect((screen.getByTestId('user-sheet-sign-out') as HTMLButtonElement).disabled).toBe(true);
		expect(mockLogout).not.toHaveBeenCalled();
	});
	it.each(['closed', 'closed but awaiting its closure write', 'unbound'])(
		'Sign out with the register %s signs out at once',
		async (state) => {
			if (state === 'closed') Object.assign(mockDrawer, { session: null });
			else if (state === 'closed but awaiting its closure write')
				Object.assign(mockDrawer, { session: { ...mockDrawer.session, status: 'closed' } });
			else mockDrawer.binding = { ...mockDrawer.binding, status: 'choose' };
			render(<UserSheet open onOpenChange={jest.fn()} />);
			await act(async () => fireEvent.click(screen.getByTestId('user-sheet-sign-out')));
			expect(mockLogout).toHaveBeenCalledTimes(1);
			expect(screen.queryByTestId('switch-confirm')).toBeNull();
		}
	);
});

it('the Register band names the current counter only when the plugin supplies one', () => {
	const previous = mockDrawer,
		previousRegisters = mockRegisters,
		previousT = mockT,
		previousCart = mockCart;
	mockT = createTestT();
	mockCart = { payload: { meta_data: [] } };
	mockRegisters = [
		{
			...mockDirectory[0],
			last_closure: undefined,
			session: { ...mockDirectory[0].session!, status: 'counting' },
		},
		mockDirectory[1],
	];
	mockDrawer = { ...mockDrawer, countingBy: { id: 7, name: 'Alex', at: '2026-10-29T17:41:00Z' } };
	try {
		const view = render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('user-sheet-register-A').textContent).toContain('Alex');
		mockDrawer = { ...mockDrawer, countingBy: null };
		view.rerender(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.getByTestId('user-sheet-register-A').textContent).not.toContain('Alex');
	} finally {
		mockDrawer = previous;
		mockRegisters = previousRegisters;
		mockT = previousT;
		mockCart = previousCart;
	}
});
