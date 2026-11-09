/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { OverlayHostProvider } from '@wcpos/components/lib/overlay-host';

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
function opener({
	onPress,
	testID,
	count,
}: {
	onPress?: () => void;
	testID?: string;
	count?: number;
}) {
	return <button data-testid={testID} data-count={count} onClick={onPress} />;
}
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: opener }));
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
		<div
			data-testid={testID}
			data-side={side}
			data-size={size}
			// The host DialogContent resolves: a named one, else the nearest provided.
			data-host={
				portalHost ?? jest.requireActual('@wcpos/components/lib/overlay-host').useOverlayHost()
			}
		>
			{children}
		</div>
	),
}));

beforeEach(() => {
	jest.clearAllMocks();
	triggerChild = undefined;
});

it('opens the sheet and marks seen from the opener', () => {
	render(
		<OverlayHostProvider name="pos">
			<NotificationBell testID="register-bar-bell" />
		</OverlayHostProvider>
	);
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

// The count is the glyph's (`IconButton count` → `Icon count`), so the bell's badge sits on its
// glyph as Store health's sits on its own (Paul, 2026-11-08: "too high, it does not look like the
// badge on the logs icon"); the bell places no Badge of its own.
it('hands the unread count to the IconButton', () => {
	render(<NotificationBell testID="page-bar-bell" />);
	expect(screen.getByTestId('page-bar-bell').getAttribute('data-count')).toBe('2');
});
