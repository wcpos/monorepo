/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import ProductsRoute from '../../../../../../apps/main/app/(app)/(drawer)/products';

jest.mock(
	'@wcpos/core/screens/main/components/pro-guard',
	() => ({
		withProAccess: (Component: React.ComponentType) => () => (
			<div data-testid="route-guard">
				<Component />
			</div>
		),
	}),
	{ virtual: true }
);
jest.mock(
	'@wcpos/core/screens/main/products',
	() => ({ ProductsScreen: () => <div data-testid="products-screen" /> }),
	{ virtual: true }
);
it('exports the screen without wrapping the management bar in the guard', () => {
	render(<ProductsRoute />);
	expect(screen.getByTestId('products-screen')).toBeTruthy();
	expect(screen.queryByTestId('route-guard')).toBeNull();
});
