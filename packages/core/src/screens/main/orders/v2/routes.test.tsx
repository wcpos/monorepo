/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import OrdersRoute from '../../../../../../../apps/main/app/(app)/(drawer)/orders';
import ViewRoute from '../../../../../../../apps/main/app/(app)/(drawer)/orders/(modals)/view/[orderId]';

jest.mock(
	'@wcpos/core/screens/main/components/pro-guard',
	() => ({
		withProAccess: (Component: React.ComponentType, page: string) => () => (
			<div data-testid={`guard-${page}`}>
				<Component />
			</div>
		),
	}),
	{ virtual: true }
);
jest.mock(
	'@wcpos/core/screens/main/orders',
	() => ({ OrdersScreen: () => <div data-testid="old-orders" /> }),
	{ virtual: true }
);
jest.mock(
	'@wcpos/core/screens/main/orders/v2',
	() => ({ OrdersScreen: () => <div data-testid="new-orders" /> }),
	{ virtual: true }
);
jest.mock(
	'@wcpos/core/screens/main/orders/view',
	() => ({ ViewOrderScreen: () => <div data-testid="old-view" /> }),
	{ virtual: true }
);
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => ({ orderId: 'order-uuid' }),
	Redirect: ({ href }: { href: { pathname: string; params: { order: string } } }) => (
		<a data-testid="redirect" href={`${href.pathname}?order=${href.params.order}`} />
	),
}));
// The screen guards its own body (the bar stays reachable on Free), so the route no longer wraps it.
it('switches the index to the v2 orders screen, unwrapped', () => {
	render(<OrdersRoute />);
	expect(screen.getByTestId('new-orders')).toBeTruthy();
	expect(screen.queryByTestId('guard-orders')).toBeNull();
	expect(screen.queryByTestId('old-orders')).toBeNull();
});
it('redirects legacy detail links to the list selection', () => {
	render(<ViewRoute />);
	expect(screen.getByTestId('redirect').getAttribute('href')).toBe('/orders?order=order-uuid');
});
