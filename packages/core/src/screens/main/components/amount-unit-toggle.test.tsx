/** @jest-environment jsdom */
import * as React from 'react';
import type { ViewProps } from 'react-native';

import { render, screen } from '@testing-library/react';

import { AmountUnitToggle } from './amount-unit-toggle';

// Expose the group's classes: RN-web otherwise drops the Uniwind className under test.
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({ children, className, testID }: ViewProps) => (
		<div className={className} data-testid={testID}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ currencySymbol: '$', currency: 'USD' }),
}));

it('gives the group a fixed width so the amount field beside it keeps the rest of the row', () => {
	render(<AmountUnitToggle percent={false} onChange={jest.fn()} testID="fee-percent" />);
	const group = screen.getByTestId('fee-percent-group');
	expect(group.className.split(' ')).toEqual(expect.arrayContaining(['w-28', 'shrink-0']));
});
