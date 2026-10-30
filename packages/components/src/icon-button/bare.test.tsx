import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { IconButton } from './index';

/**
 * `bare` is a title-bar item (Paul, 2026-10-30): no surface on hover or press; the glyph goes
 * from muted to the foreground under the pointer or the finger instead.
 */
let mockState = { hovered: false, pressed: false };
jest.mock('react-native', () => {
	const actual = jest.requireActual<typeof import('react-native')>('react-native');
	return {
		...actual,
		Pressable: ({ className, children }: { className?: string; children: any }) => (
			<div data-testid="surface" data-class={className}>
				{typeof children === 'function' ? children(mockState) : children}
			</div>
		),
	};
});
jest.mock('../icon', () => ({
	Icon: ({ className }: { className?: string }) => <i data-testid="glyph" data-class={className} />,
}));

it.each([
	[{ hovered: false, pressed: false }, 'text-muted-foreground'],
	[{ hovered: true, pressed: false }, 'text-foreground'],
	[{ hovered: false, pressed: true }, 'text-foreground'],
])('a bare button has no surface and its glyph reads %j as %s', (state, ink) => {
	mockState = state;
	render(<IconButton name="notifications" variant="bare" accessibilityLabel="Notifications" />);
	expect(screen.getByTestId('surface').getAttribute('data-class')).not.toMatch(/bg-/);
	expect(screen.getByTestId('glyph').getAttribute('data-class')?.split(' ')).toContain(ink);
});
