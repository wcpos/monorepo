/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { NotificationBell } from './notification-bell';

const mockSeen = jest.fn();
const mockPanel = jest.fn(() => null);
jest.mock('../../../../contexts/novu', () => ({
	useNovuNotificationsSummary: () => ({ unreadCount: 2, markAllAsSeen: mockSeen }),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../pos/contexts/overlay-side', () => ({ usePanelSide: () => 'right' }));
jest.mock('./notification-panel', () => ({ NotificationPanelContent: () => mockPanel() }));
function passthrough({ children, testID }: React.PropsWithChildren<{ testID?: string }>) {
	return <div data-testid={testID}>{children}</div>;
}
function opener({ onPress, testID }: { onPress?: () => void; testID?: string }) {
	return <button data-testid={testID} onClick={onPress} />;
}
jest.mock('react-native', () => ({ View: passthrough }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/icon-button', () => ({ IconButton: opener }));
jest.mock('@wcpos/components/nav-item', () => ({ NavItem: opener }));
jest.mock('@wcpos/components/badge', () => ({ Badge: () => null }));
jest.mock('@wcpos/components/dialog', () => ({
	Dialog: passthrough,
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

it.each([false, true])('opens the sheet and marks seen from the opener (label=%s)', (showLabel) => {
	jest.clearAllMocks();
	render(<NotificationBell showLabel={showLabel} portalHost="pos" />);
	expect(mockPanel).not.toHaveBeenCalled();
	expect(mockSeen).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('drawer-item-notifications'));
	expect(mockSeen).toHaveBeenCalledTimes(1);
	expect(mockPanel).toHaveBeenCalledTimes(1);
	const sheet = screen.getByTestId('notifications-sheet');
	expect(sheet.getAttribute('data-side')).toBe('right');
	expect(sheet.getAttribute('data-size')).toBe('lg');
	expect(sheet.getAttribute('data-host')).toBe('pos');
});
