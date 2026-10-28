/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { CashierEntry } from './index';

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'coarse' }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { wcpos_login_url: 'https://shop.test/login' },
		wpCredentials: { display_name: 'Jane' },
	}),
}));
let mockRedirectUrl: string | null = null;
jest.mock('../../../../hooks/use-wcpos-auth/redirect-result', () => ({
	peekRedirectLoginUrl: () => mockRedirectUrl,
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

beforeEach(() => {
	mockRedirectUrl = null;
});

// The redirect-return claim, once for every host (the bars below `lg`, the rail on `lg`): after a
// full-page OAuth return the sheet opens on mount for THIS site's login only, so the Add user
// consumer mounts to claim the one-shot result; any other return leaves it closed.
it.each([
	['this site', 'https://shop.test/login', true],
	['another site', 'https://other.test/login', false],
	['no return', null, false],
])('claims a redirect return for %s: open %s', (_case, url, open) => {
	mockRedirectUrl = url;
	render(<CashierEntry testID="bar-avatar" placement="bar" portalHost={null} />);
	expect(screen.queryByTestId('user-sheet') !== null).toBe(open);
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
