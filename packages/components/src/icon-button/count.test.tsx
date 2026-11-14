import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { IconButton } from './index';

/**
 * The button's count is its glyph's (`Icon count`), so the badge is measured from the glyph and
 * not from the 44 button (Paul, 2026-11-08: "too high, it does not look like the badge on the
 * logs icon").
 */
jest.mock('../icon', () => ({
	Icon: ({ count }: { count?: number }) => <i data-testid="glyph" data-count={count} />,
}));

it('hands its count to the glyph', () => {
	const { rerender } = render(
		<IconButton name="notifications" count={3} accessibilityLabel="Notifications" />
	);
	expect(screen.getByTestId('glyph').getAttribute('data-count')).toBe('3');
	rerender(<IconButton name="notifications" accessibilityLabel="Notifications" />);
	expect(screen.getByTestId('glyph').hasAttribute('data-count')).toBe(false);
});
