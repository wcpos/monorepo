import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { IconButton } from './index';

/**
 * A `sm` or `xs` icon button is drawn under 44, so it asks the pressable surface for the 44 pt
 * band (`lib/min-target`); the full-size button needs none.
 */

// react-native-web drops `className` from a View; a plain div keeps it for the assertions.
jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		View: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => (
			<div data-testid={testID}>{children}</div>
		),
	};
});
jest.mock('../icon', () => ({ Icon: () => null }));

it.each(['xs', 'sm'] as const)('a %s button carries the 44 pt band inside itself', (size) => {
	render(<IconButton name="refresh" size={size} accessibilityLabel="Sync" />);
	expect(screen.getByRole('button').contains(screen.getByTestId('min-target-band'))).toBe(true);
});

it('a full-size button carries no band', () => {
	render(<IconButton name="refresh" accessibilityLabel="Sync" />);
	expect(screen.queryByTestId('min-target-band')).toBeNull();
});
