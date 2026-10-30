/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { consumeCashierSheetRequest, requestCashierSheet } from './cashier-sheet-request';
import { CurrentOrderContext } from '../../pos/contexts/current-order/context';
import { CashierEntry } from './index';
import {
	__resetRedirectResultForTesting,
	saveRedirectState,
} from '../../../../hooks/use-wcpos-auth/redirect-result';

// The real redirect-return module: its one-shot is what is under test. Only the ESM it pulls in is stubbed.
jest.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'wcpos://callback' }));
jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'coarse' }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { wcpos_login_url: 'https://shop.test/login' },
		wpCredentials: { display_name: 'Jane' },
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: unknown, pick: (doc: unknown) => unknown) => pick(doc),
}));
jest.mock('../user-avatar', () => ({ UserAvatar: () => null }));
jest.mock('../../pos/cart/user-sheet', () => ({
	UserSheet: ({
		open,
		portalHost,

		onOpenRegister,
	}: {
		open: boolean;
		portalHost?: string | null;

		onOpenRegister?: (pane?: 'register' | 'count') => void;
	}) =>
		open ? (
			<div
				data-testid="user-sheet"
				data-host={String(portalHost)}
				// What the sheet's register rows read: no order in context disables every switch.
				data-order={String(
					jest.requireActual('../../pos/contexts/current-order/context').useCurrentOrderOptional()
						?.uuid
				)}
			>
				{onOpenRegister && <button data-testid="open-register" onClick={() => onOpenRegister()} />}
			</div>
		) : null,
}));

jest.mock('../../pos/cart/register-panel', () => ({
	RegisterPanel: ({
		open,
		portalHost,
		initialPane,
	}: {
		open: boolean;
		portalHost?: string | null;
		initialPane?: 'register' | 'count';
	}) => (
		<div
			data-testid="register-panel"
			data-open={String(open)}
			data-portal={String(portalHost)}
			data-pane={initialPane}
		/>
	),
}));

const CSRF = 'a'.repeat(64);

/** A popup-blocked OAuth login for `loginUrl`: the saved state, then the reload with the tokens. */
function returnFrom(loginUrl: string) {
	window.history.replaceState({}, '', '/pos');
	saveRedirectState(loginUrl, CSRF);
	window.history.replaceState(
		{},
		'',
		`/pos?access_token=at&refresh_token=rt&uuid=u&id=7&display_name=Jane&expires_at=1755648000&state=${CSRF}`
	);
}

beforeEach(() => {
	__resetRedirectResultForTesting();
	sessionStorage.clear();
	window.history.replaceState({}, '', '/pos');
});

// The redirect-return claim, once for every host (the bars, on every size): after a
// full-page OAuth return the sheet opens for THIS site's login only, so the Add user consumer
// mounts to claim the one-shot result; any other return leaves it closed.
it.each([
	['this site', 'https://shop.test/login', true],
	['another site', 'https://other.test/login', false],
	['no return', null, false],
])('claims a redirect return for %s: open %s', (_case, url, open) => {
	if (url) returnFrom(url);
	render(<CashierEntry testID="bar-avatar" portalHost={null} />);
	expect(screen.queryByTestId('user-sheet') !== null).toBe(open);
});

// The phone POS mounts a register bar on each tab, so two entries are on screen at once: the
// return is taken once, and only one sheet opens.
it('opens one sheet for one return when two entries are mounted', () => {
	returnFrom('https://shop.test/login');
	render(
		<>
			<CashierEntry testID="products-avatar" portalHost="pos" />
			<CashierEntry testID="cart-avatar" portalHost="pos" />
		</>
	);
	expect(screen.getAllByTestId('user-sheet')).toHaveLength(1);
});

it('opens the one cashier surface from the avatar, on the host and with the rows it is given', () => {
	render(<CashierEntry testID="register-bar-avatar" portalHost="pos" />);
	expect(screen.queryByTestId('user-sheet')).toBeNull();
	fireEvent.click(screen.getByTestId('register-bar-avatar'));
	expect(screen.getByTestId('user-sheet').getAttribute('data-host')).toBe('pos');
});

it("on the till the bar's door is used and the entry mounts no panel", () => {
	const onOpenRegister = jest.fn();
	render(<CashierEntry testID="avatar" portalHost="pos" onOpenRegister={onOpenRegister} />);
	fireEvent.click(screen.getByTestId('avatar'));
	fireEvent.click(screen.getByTestId('open-register'));
	expect(onOpenRegister).toHaveBeenCalledTimes(1);
	expect(screen.queryByTestId('register-panel')).toBeNull();
});

let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
it('opens one sheet for one request when two entries are mounted and one is focused', () => {
	requestCashierSheet();
	mockFocused = false;
	render(<CashierEntry testID="hidden" portalHost="pos" />);
	mockFocused = true;
	render(<CashierEntry testID="shown" portalHost="pos" />);
	expect(screen.getAllByTestId('user-sheet')).toHaveLength(1);
	expect(consumeCashierSheetRequest()).toBe(false);
});

// The desktop title bar's entry is outside the till (#3074). On POS a till bar keeps an avatarless
// entry inside CurrentOrderProvider; the title bar's avatar and store name REQUEST the sheet and that
// entry opens it with the order (an empty cart: the register rows stay live). Off the till there is
// no focused till entry and the title bar's own entry opens it.
function Till({ children }: React.PropsWithChildren) {
	const value = { currentOrderRecord: { uuid: 'empty-cart' } } as unknown as React.ContextType<
		typeof CurrentOrderContext
	>;
	return <CurrentOrderContext.Provider value={value}>{children}</CurrentOrderContext.Provider>;
}
it.each([
	['the avatar', () => fireEvent.click(screen.getByTestId('title-bar-avatar'))],
	['the store name', () => requestCashierSheet()],
])('on POS, %s in the title bar opens the till sheet with the order', (_door, open) => {
	mockFocused = true;
	render(
		<>
			<CashierEntry testID="title-bar-avatar" portalHost="scene" />
			<Till>
				<CashierEntry testID="register-bar-avatar" portalHost="pos" headless />
			</Till>
		</>
	);
	expect(screen.queryByTestId('register-bar-avatar')).toBeNull();
	React.act(() => open());
	const sheets = screen.getAllByTestId('user-sheet');
	expect(sheets).toHaveLength(1);
	expect(sheets[0].getAttribute('data-host')).toBe('pos');
	expect(sheets[0].getAttribute('data-order')).toBe('empty-cart');
});

it('off the till, the title bar opens its own sheet', () => {
	mockFocused = true;
	render(<CashierEntry testID="title-bar-avatar" portalHost="scene" />);
	fireEvent.click(screen.getByTestId('title-bar-avatar'));
	expect(screen.getByTestId('user-sheet').getAttribute('data-host')).toBe('scene');
	expect(screen.getByTestId('user-sheet').getAttribute('data-order')).toBe('undefined');
});

it("outside the till, the drawer door opens the register panel in place, on the entry's host", () => {
	render(<CashierEntry testID="avatar" portalHost="scene" />);
	expect(screen.queryByTestId('register-panel')).toBeNull();
	fireEvent.click(screen.getByTestId('avatar'));
	expect(screen.queryByTestId('register-panel')).toBeNull();
	fireEvent.click(screen.getByTestId('open-register'));
	const panel = screen.getByTestId('register-panel');
	expect(panel.getAttribute('data-open')).toBe('true');
	expect(panel.getAttribute('data-portal')).toBe('scene');
	expect(panel.getAttribute('data-pane')).toBe('register');
});
