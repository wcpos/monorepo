/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NotificationBell } from './notification-bell';

const mockSeen = jest.fn();
const mockPanel = jest.fn(() => null);
let openChange: ((open: boolean) => void) | undefined;
let triggerChild: React.ReactElement<{ onPress?: () => void; testID?: string }> | undefined;
jest.mock('../../../../contexts/novu', () => ({
	useNovuNotificationsSummary: () => ({ unreadCount: 2, markAllAsSeen: mockSeen }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../pos/contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
jest.mock('./notification-panel', () => ({ NotificationPanelContent: () => mockPanel() }));
function passthrough({
	children,
	testID,
	className,
	pointerEvents,
}: React.PropsWithChildren<{ testID?: string; className?: string; pointerEvents?: string }>) {
	return (
		<div data-testid={testID} className={className} data-pointer-events={pointerEvents}>
			{children}
		</div>
	);
}
function opener({ onPress, testID }: { onPress?: () => void; testID?: string }) {
	return <button data-testid={testID} onClick={onPress} />;
}
jest.mock('react-native', () => ({ View: passthrough }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: opener }));
jest.mock('@wcpos/components/badge', () => ({
	Badge: ({ count }: { count: number }) => <span data-testid="badge">{count}</span>,
}));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: ({
		children,
		onOpenChange,
	}: React.PropsWithChildren<{ onOpenChange: (open: boolean) => void }>) => {
		openChange = onOpenChange;
		return children;
	},
	DialogTrigger: ({ children }: { children: NonNullable<typeof triggerChild> }) => {
		triggerChild = children;
		return React.cloneElement(children, { onPress: () => openChange?.(true) });
	},
	DialogContent: ({
		children,
		testID,
		side,
		size,
		portalHost,
	}: React.PropsWithChildren<{
		testID?: string;
		side?: string;
		size?: string;
		portalHost?: string;
	}>) => (
		<div data-testid={testID} data-side={side} data-size={size} data-host={portalHost}>
			{children}
		</div>
	),
}));

beforeEach(() => {
	jest.clearAllMocks();
	triggerChild = undefined;
});

it('opens the sheet and marks seen from the opener', () => {
	render(<NotificationBell testID="register-bar-bell" portalHost="pos" />);
	expect(triggerChild?.props.testID).toBe('register-bar-bell');
	expect(mockPanel).not.toHaveBeenCalled();
	expect(mockSeen).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('register-bar-bell'));
	expect(mockSeen).toHaveBeenCalledTimes(1);
	expect(mockPanel).toHaveBeenCalledTimes(1);
	const sheet = screen.getByTestId('notifications-sheet');
	expect(sheet.getAttribute('data-side')).toBe('right');
	expect(sheet.getAttribute('data-size')).toBe('lg');
	expect(sheet.getAttribute('data-host')).toBe('pos');
});

// The badge's offsets are the drawer's, measured from the icon box (`drawer-content/index.tsx`
// centres a `size-6` box over Store health's `xl` glyph and `LogsBadge` sits at `-top-1 -right-0.5`
// in it). The bell's button is 44 (`size-ctl`) around an 18 glyph, so the same offsets from the
// button put the badge 13 further up and out than the logs badge (Paul, 2026-11-08: "too high").
it('anchors the badge to a centred glyph-sized box, not the button', () => {
	render(<NotificationBell testID="page-bar-bell" />);
	const badge = screen.getByTestId('badge');
	const offset = badge.parentElement!;
	expect(offset.className).toBe('absolute -top-1 -right-0.5');
	const glyphBox = offset.parentElement!;
	expect(glyphBox.className).toBe('relative size-4.5');
	const overlay = glyphBox.parentElement!;
	expect(overlay.className).toBe('absolute inset-0 items-center justify-center');
	// The overlay covers the whole button and is drawn over it: without `none` the bell is dead.
	expect(overlay.getAttribute('data-pointer-events')).toBe('none');
	// The overlay and the opener share the button's frame.
	expect(overlay.parentElement).toBe(screen.getByTestId('page-bar-bell').parentElement);
});
