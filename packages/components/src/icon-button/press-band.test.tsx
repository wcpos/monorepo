import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { IconButton } from './index';

/**
 * A `sm` or `xs` icon button is drawn under 44, so it carries a press band the control token
 * tall, centred over the glyph and overflowing it (ledger line 7): hitSlop never reaches past a
 * parent shorter than the target on iOS, and the web ignores it. The full-size button needs none.
 */

// react-native-web drops `className` from a View; a plain div keeps it for the assertions.
jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		View: ({
			children,
			className,
			testID,
		}: React.PropsWithChildren<{ className?: string; testID?: string }>) => (
			<div data-testid={testID} className={className}>
				{children}
			</div>
		),
	};
});
jest.mock('expo-haptics', () => ({
	impactAsync: jest.fn(),
	ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../icon', () => ({ Icon: () => null }));

it.each(['xs', 'sm'] as const)('a %s button carries a control-height press band', (size) => {
	render(<IconButton name="refresh" size={size} accessibilityLabel="Sync" />);
	const band = screen.getByTestId('icon-button-press-band');
	// Inside the button, so a press on the band is the button's own.
	expect(screen.getByRole('button').contains(band)).toBe(true);
	expect(band.firstElementChild).toHaveClass('min-h-ctl', 'w-full');
	expect(band.firstElementChild).not.toHaveClass('min-w-ctl');
});

it('a full-size button carries no band', () => {
	render(<IconButton name="refresh" accessibilityLabel="Sync" />);
	expect(screen.queryByTestId('icon-button-press-band')).toBeNull();
});
