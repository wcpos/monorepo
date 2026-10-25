/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { LEDGER_META_KEY } from '@wcpos/order-math';

import { createTestT } from '../../../../../jest/translate';
import { UserSheet, useSalesToday } from './user-sheet';
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeSiteCredentials: () => of(mockCredentials),
	observeCredentialStores: () => of(PENDING_USER_DB_READ, mockOtherStores),
}));

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));

jest.mock('@wcpos/components/alert-dialog', () => {
	function Box({ children }: React.PropsWithChildren) {
		return <div>{children}</div>;
	}
	return {
		AlertDialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) =>
			open ? <div>{children}</div> : null,
		AlertDialogContent: Box,
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
let mockStoreTimezone: string | undefined;
let mockStores = ['store-a'];
const mockLogin = jest.fn(async (_input: unknown) => {});
const mockCredentials = [
	{
		uuid: 'other',
		display_name: 'Other cashier',
	},
];
jest.mock('observable-hooks', () => ({
	...jest.requireActual('observable-hooks'),
	useObservableSuspense: () => mockCredentials,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
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
		wpCredentials: { id: 7, uuid: 'current', display_name: 'Cashier', stores: mockStores },
		store: { id: mockStoreId, price_num_decimals: 2 },
		site: { uuid: 'site', url: 'https://shop.example', populateResource: () => ({}) },
		logout: mockLogout,
	}),
}));
let mockT: (key: string, options?: Record<string, unknown>) => string = (key) => key;
jest.mock('../../../../contexts/translations', () => ({ useT: () => mockT }));
let mockAwaitingStore = 0;
jest.mock('../checkout/use-awaiting-store', () => ({
	useAwaitingStoreCount: () => mockAwaitingStore,
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: (date: Date) => date.toISOString().slice(0, -5),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: String }),
}));
jest.mock('../../../auth/components/add-user-button', () => ({ AddUserButton: () => null }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registers: [{ id: 'A' }, { id: 'B' }] }),
}));
jest.mock('../contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
jest.mock('./switch-store-sheet', () => ({
	SwitchStoreSheet: ({ open, portalHost }: { open: boolean; portalHost?: string | null }) =>
		open ? <div data-testid="switch-store-sheet" data-host={String(portalHost)} /> : null,
}));
jest.mock('@wcpos/components/dialog', () => {
	function Box({ children }: { children: React.ReactNode }) {
		return <div>{children}</div>;
	}
	return {
		Dialog: Box,
		DialogContent: Box,
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
	render(<UserSheet open onOpenChange={jest.fn()} onSwitchRegister={jest.fn()} />);
	fireEvent.click(screen.getByTestId('user-sheet-user-other'));
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
		await waitFor(() => expect(result.current).toBe(20));
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
jest.mock('../contexts/current-order/context', () => ({ useCurrentOrderOptional: () => mockCart }));
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
	const switchRegister = jest.fn();
	render(
		<UserSheet open onOpenChange={jest.fn()} onSwitchRegister={switchRegister} portalHost={null} />
	);
	const button = screen.getByTestId('user-sheet-switch-register');
	expect(button.getAttribute('aria-disabled') === 'true').toBe(blocked);
	expect(!!screen.queryByText('register.switch_register_blocked_cart')).toBe(attributed === true);
	expect(!!screen.queryByText('register.switch_register_unavailable_here')).toBe(
		attributed === undefined
	);
	fireEvent.click(button);
	expect(switchRegister).toHaveBeenCalledTimes(blocked ? 0 : 1);
});

it('allows switching from an empty attributed template', () => {
	mockCart = {
		payload: { status: 'pos-open', meta_data: [{ key: '_wcpos_register', value: 'A' }] },
	};
	const switchRegister = jest.fn();
	render(<UserSheet open onOpenChange={jest.fn()} onSwitchRegister={switchRegister} />);
	const button = screen.getByTestId('user-sheet-switch-register');
	expect(button.getAttribute('aria-disabled')).not.toBe('true');
	expect(screen.queryByText('register.switch_register_blocked_cart')).toBeNull();
	fireEvent.click(button);
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
		const switchRegister = jest.fn();
		render(<UserSheet open onOpenChange={jest.fn()} onSwitchRegister={switchRegister} />);
		const button = screen.getByTestId('user-sheet-switch-register');
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(screen.getByText('register.switch_register_blocked_cart')).toBeTruthy();
		fireEvent.click(button);
		expect(switchRegister).not.toHaveBeenCalled();
	}
);

describe('switch store', () => {
	afterEach(() => {
		mockStores = ['store-a'];
	});

	it('offers no store switch on a login with one store', () => {
		render(<UserSheet open onOpenChange={jest.fn()} />);
		expect(screen.queryByTestId('user-sheet-switch-store')).toBeNull();
	});

	it('closes the sheet and opens the store switch on its own host when the login has more stores', () => {
		mockStores = ['store-a', 'store-b'];
		const onOpenChange = jest.fn();
		render(<UserSheet open onOpenChange={onOpenChange} portalHost={null} />);
		expect(screen.queryByTestId('switch-store-sheet')).toBeNull();
		fireEvent.click(screen.getByTestId('user-sheet-switch-store'));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		// Off the POS the sheet portals to the root host, so the store sheet must too.
		expect(screen.getByTestId('switch-store-sheet').getAttribute('data-host')).toBe('null');
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
