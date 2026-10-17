/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { DrawerItem } from './drawer-item';

jest.mock('@wcpos/components/nav-item', () => ({
	NavItem: ({
		label,
		selected,
		testID,
	}: {
		label?: React.ReactNode;
		selected?: boolean;
		testID?: string;
	}) => (
		<div data-testid={testID} data-selected={String(selected)}>
			{label}
		</div>
	),
}));

it('passes a string label and the focus through to the nav row', () => {
	render(<DrawerItem label="Orders" focused onPress={jest.fn()} testID="drawer-item-orders" />);
	expect(screen.getByTestId('drawer-item-orders').textContent).toBe('Orders');
	expect(screen.getByTestId('drawer-item-orders').getAttribute('data-selected')).toBe('true');
});

// Revert: drop a drawerLabel callback's element, leaving an unnamed icon-only row.
it("keeps a drawerLabel callback's rendered element", () => {
	render(
		<DrawerItem
			label={({ focused }) => <span data-testid="styled">{focused ? 'On' : 'Off'}</span>}
			onPress={jest.fn()}
			testID="drawer-item-reports"
		/>
	);
	expect(screen.getByTestId('styled').textContent).toBe('Off');
});
