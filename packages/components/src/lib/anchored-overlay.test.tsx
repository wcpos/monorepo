import '../popover/overlay.test-utils';
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { DeviceScope } from './device';
import { type AnchoredContent, AnchoredOverlay, type OverlayAnchor } from './overlay';

const { View: Part } = jest.requireMock('react-native');
const ANCHOR: OverlayAnchor = {
	Portal: ({ children }) => <div data-testid="portal">{children}</div>,
	Scrim: Part,
	Content: ({ children, align, ...props }) => (
		<Part {...props}>
			<div data-testid="anchored" data-align={align}>
				{children}
			</div>
		</Part>
	),
};
const onOpenChange = jest.fn();
type Case = { open?: boolean; list?: 'menu'; outsidePress?: boolean; content?: AnchoredContent };
function overlay(phone: boolean | undefined, { content, ...props }: Case = {}) {
	return render(
		<DeviceScope phone={phone}>
			<AnchoredOverlay
				anchor={ANCHOR}
				open
				onOpenChange={onOpenChange}
				size="min-w-50"
				content={{
					testID: 'panel',
					className: 'w-auto max-w-80',
					align: 'start',
					inline: true,
					children: <span>rows</span>,
					...content,
				}}
				{...props}
			/>
		</DeviceScope>
	);
}
beforeEach(() => onOpenChange.mockClear());

// The standards' rule, decided once: a phone gets the bottom sheet, anything wider the
// primitive's positioned panel. Unset, the window decides (the harness is 1024 × 768).
it.each([
	[true, 'sheet'],
	[false, 'anchored'],
	[undefined, 'anchored'],
] as const)('phone=%s is the %s', (phone, kind) => {
	overlay(phone);
	const panel = screen.getByTestId('panel');
	if (kind === 'sheet') {
		// The sheet's geometry wins over an anchored caller's width cap; it rises, and its scrim closes it.
		expect(panel).toHaveClass('rounded-t-2xl w-full max-w-full web:animate-sheet-in');
		expect(panel).not.toHaveClass('max-w-80');
		expect(screen.queryByTestId('anchored')).toBeNull();
		fireEvent.click(screen.getByTestId('panel-scrim'));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	} else {
		expect(panel).toHaveClass('bg-card rounded-lg z-50 min-w-50 max-w-80 web:animate-pop-in');
		expect(screen.getByTestId('anchored')).toHaveAttribute('data-align', 'start');
	}
});

it('scrolls a list on the sheet in a container with its role, and leaves the anchored panel bare', () => {
	const sheet = overlay(true, { list: 'menu' });
	expect(screen.getByRole('menu')).toHaveTextContent('rows');
	sheet.unmount();
	overlay(false, { list: 'menu' });
	expect(screen.queryByRole('menu')).toBeNull();
});

it('closes an anchored panel on an outside press only when asked', () => {
	const bare = overlay(false);
	fireEvent.click(screen.getByTestId('panel-scrim'));
	expect(onOpenChange).not.toHaveBeenCalled();
	bare.unmount();
	overlay(false, { outsidePress: true });
	fireEvent.click(screen.getByTestId('panel-scrim'));
	expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('renders nothing closed inline, and goes through the portal otherwise', () => {
	const closed = overlay(true, { open: false });
	expect(closed.container).toBeEmptyDOMElement();
	closed.unmount();
	overlay(false, { content: { inline: false } });
	expect(screen.getByTestId('portal')).toContainElement(screen.getByTestId('panel'));
});
