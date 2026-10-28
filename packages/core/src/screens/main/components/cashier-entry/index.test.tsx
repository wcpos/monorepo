/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

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
		onSwitchRegister,
	}: {
		open: boolean;
		portalHost?: string | null;
		onSwitchRegister?: () => void;
	}) =>
		open ? (
			<div data-testid="user-sheet" data-host={String(portalHost)}>
				{onSwitchRegister && <button data-testid="switch-register" onClick={onSwitchRegister} />}
			</div>
		) : null,
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

// The redirect-return claim, once for every host (the bars below `lg`, the rail on `lg`): after a
// full-page OAuth return the sheet opens for THIS site's login only, so the Add user consumer
// mounts to claim the one-shot result; any other return leaves it closed.
it.each([
	['this site', 'https://shop.test/login', true],
	['another site', 'https://other.test/login', false],
	['no return', null, false],
])('claims a redirect return for %s: open %s', (_case, url, open) => {
	if (url) returnFrom(url);
	render(<CashierEntry testID="bar-avatar" placement="bar" portalHost={null} />);
	expect(screen.queryByTestId('user-sheet') !== null).toBe(open);
});

// The phone POS mounts a register bar on each tab, so two entries are on screen at once: the
// return is taken once, and only one sheet opens.
it('opens one sheet for one return when two entries are mounted', () => {
	returnFrom('https://shop.test/login');
	render(
		<>
			<CashierEntry testID="products-avatar" placement="bar" portalHost="pos" />
			<CashierEntry testID="cart-avatar" placement="bar" portalHost="pos" />
		</>
	);
	expect(screen.getAllByTestId('user-sheet')).toHaveLength(1);
});

it('opens the one cashier surface from the avatar, on the host and with the rows it is given', () => {
	const onSwitchRegister = jest.fn();
	render(
		<CashierEntry
			testID="register-bar-avatar"
			placement="rail"
			portalHost="pos"
			onSwitchRegister={onSwitchRegister}
		/>
	);
	expect(screen.queryByTestId('user-sheet')).toBeNull();
	fireEvent.click(screen.getByTestId('register-bar-avatar'));
	expect(screen.getByTestId('user-sheet').getAttribute('data-host')).toBe('pos');
	fireEvent.click(screen.getByTestId('switch-register'));
	expect(onSwitchRegister).toHaveBeenCalledTimes(1);
});
