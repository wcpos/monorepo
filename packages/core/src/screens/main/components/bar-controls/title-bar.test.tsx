/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { TitleBarStripContent } from './title-bar';

let mockStatus = 'online-website-available';
const mockRequestCashierSheet = jest.fn();
// Jest resolves the native portal, which has no strip: render in place to read the strip's row.
jest.mock('@wcpos/components/edge-surface', () => ({
	TitleBarStripPortal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('expo-router', () => ({ useNavigation: () => ({ openDrawer: jest.fn() }) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { name: 'Main Street' } }),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: unknown) => unknown) => read(doc),
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status: mockStatus }),
}));
jest.mock('../cashier-entry/cashier-sheet-request', () => ({
	requestCashierSheet: () => mockRequestCashierSheet(),
}));
jest.mock('../notification-bell/notification-bell', () => ({
	NotificationBell: ({ testID }: { testID: string }) => <div data-testid={testID} />,
}));
jest.mock('../cashier-entry', () => ({
	CashierEntry: ({ testID }: { testID: string }) => <div data-testid={testID} />,
}));

// The title bar (Paul, 2026-10-29): the store name, the door to the cashier sheet; then Offline,
// the bell and the avatar, the strip's own pair.
it('is the store name, then Offline, the bell and the avatar', () => {
	mockStatus = 'offline';
	render(<TitleBarStripContent />);
	expect(screen.getByText('Main Street')).toBeTruthy();
	fireEvent.click(screen.getByTestId('title-bar-store'));
	expect(mockRequestCashierSheet).toHaveBeenCalledTimes(1);
	expect(screen.getByTestId('title-bar-status')).toBeTruthy();
	expect(screen.getByTestId('title-bar-bell')).toBeTruthy();
	expect(screen.getByTestId('title-bar-avatar')).toBeTruthy();
});
