/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { useDocField } from '@wcpos/query';
import { Skeleton } from '@wcpos/components/skeleton';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { type Notification, useNovuNotifications } from '../../../../contexts/novu';
import { NotificationPanelContent } from './notification-panel';

jest.mock('../../../../contexts/novu', () => ({ useNovuNotifications: jest.fn() }));
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({ site: {} }) }));
jest.mock('@wcpos/query', () => ({ useDocField: jest.fn(() => 'https://store.test') }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/use-date-format', () => ({ useDateFormat: () => 'just now' }));
jest.mock('../../../../hooks/use-store-day', () => ({
	useStoreDay: () => ({
		timezone: 'UTC',
		today: () => ({ year: 2026, month: 10, day: 28 }),
	}),
	storeDayBounds: () => ({ from: new Date(0), to: new Date(8.64e15) }),
}));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

function passthrough({ children, testID }: React.PropsWithChildren<{ testID?: string }>) {
	return <div data-testid={testID}>{children}</div>;
}

jest.mock('@wcpos/components/dialog', () => ({
	DialogHeader: passthrough,
	DialogTitle: passthrough,
	DialogBody: passthrough,
	DialogFooter: jest.requireActual('../../../../../jest/footer.test-utils').DialogFooter,
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		testID,
		onPress,
	}: React.PropsWithChildren<{
		testID?: string;
		onPress?: () => void;
	}>) => (
		<button
			data-testid={testID}
			onClick={(event) => {
				event.stopPropagation();
				onPress?.();
			}}
		>
			{children}
		</button>
	),
	ButtonText: passthrough,
}));
jest.mock('@wcpos/components/list-row', () => ({
	ListRow: ({
		children,
		leading,
		trailing,
		testID,
		onPress,
	}: React.PropsWithChildren<{
		leading?: React.ReactNode;
		trailing?: React.ReactNode;
		testID?: string;
		onPress?: () => void;
	}>) => (
		<div data-testid={testID} onClick={onPress}>
			{leading}
			{children}
			{trailing}
		</div>
	),
}));
jest.mock('@wcpos/components/empty-state', () => ({ EmptyState: passthrough }));
jest.mock('@wcpos/components/skeleton', () => ({ Skeleton: jest.fn(() => null) }));
jest.mock('@wcpos/components/notice', () => ({ Notice: passthrough }));
jest.mock('@wcpos/components/hstack', () => ({ HStack: passthrough }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: passthrough }));
jest.mock('@wcpos/components/text', () => ({ Text: passthrough }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('react-native', () => ({ Pressable: passthrough, View: passthrough }));

const notification: Notification = {
	id: 'n-1',
	title: 'A plugin update',
	body: 'New release',
	status: 'unread',
	seen: false,
	createdAt: Date.now(),
	workflowId: 'plugin-update',
};
const mockState = {
	notifications: [] as Notification[],
	unreadCount: 1,
	unseenCount: 1,
	isLoading: false,
	isConnected: true,
	markAsRead: jest.fn(),
	markAllAsRead: jest.fn(),
	markAllAsSeen: jest.fn(),
	refresh: jest.fn(),
};

beforeEach(() => {
	jest.clearAllMocks();
	mockState.notifications = [];
	mockState.unreadCount = 1;
	mockState.isLoading = false;
	mockState.isConnected = true;
	jest.mocked(useNovuNotifications).mockReturnValue(mockState);
	jest.mocked(useDocField).mockReturnValue('https://store.test');
});

describe('NotificationPanelContent', () => {
	it("renders the footer's mark-all-read action only while something is unread", () => {
		const { rerender } = render(<NotificationPanelContent />);
		fireEvent.click(screen.getByTestId('notifications-mark-all-read'));
		expect(mockState.markAllAsRead).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('notifications-close')).toBeTruthy();
		mockState.unreadCount = 0;
		rerender(<NotificationPanelContent />);
		expect(screen.queryByTestId('notifications-mark-all-read')).toBeNull();
		expect(screen.getByTestId('notifications-close')).toBeTruthy();
	});

	it('shows the shared empty state when there is nothing and nothing is loading', () => {
		render(<NotificationPanelContent />);
		expect(screen.getByTestId('notifications-empty')).toBeTruthy();
		expect(Skeleton).not.toHaveBeenCalled();
	});

	it('shows skeleton rows while the first fetch is loading', () => {
		mockState.isLoading = true;
		render(<NotificationPanelContent />);
		expect(
			jest.mocked(Skeleton).mock.calls.filter(([props]) => props.shape !== 'line')
		).toHaveLength(4);
		expect(
			jest.mocked(Skeleton).mock.calls.filter(([props]) => props.shape === 'line')
		).toHaveLength(12);
		expect(screen.queryByTestId('notifications-empty')).toBeNull();
	});

	it('shows the offline notice when disconnected', () => {
		mockState.isConnected = false;
		const { rerender } = render(<NotificationPanelContent />);
		expect(screen.getByTestId('notifications-offline')).toBeTruthy();
		mockState.isConnected = true;
		rerender(<NotificationPanelContent />);
		expect(screen.queryByTestId('notifications-offline')).toBeNull();
	});

	it("the action button marks the row read and opens the kind's url", () => {
		mockState.notifications = [notification];
		render(<NotificationPanelContent />);
		fireEvent.click(screen.getByTestId('notification-action-n-1'));
		expect(mockState.markAsRead).toHaveBeenCalledWith('n-1');
		expect(openExternalURL).toHaveBeenCalledWith('https://store.test/wp-admin/plugins.php');
		expect(mockState.markAsRead.mock.invocationCallOrder[0]).toBeLessThan(
			jest.mocked(openExternalURL).mock.invocationCallOrder[0]
		);
	});

	it('keeps cached rows while loading and marks only unread rows on press', () => {
		mockState.isLoading = true;
		mockState.notifications = [notification];
		const { rerender } = render(<NotificationPanelContent />);
		fireEvent.click(screen.getByTestId('notification-row-n-1'));
		expect(mockState.markAsRead).toHaveBeenCalledTimes(1);
		expect(Skeleton).not.toHaveBeenCalled();
		mockState.notifications = [{ ...notification, status: 'read' }];
		rerender(<NotificationPanelContent />);
		fireEvent.click(screen.getByTestId('notification-row-n-1'));
		expect(mockState.markAsRead).toHaveBeenCalledTimes(1);
	});

	it('keeps the update action visible without a site URL but opens nothing', () => {
		mockState.notifications = [notification];
		jest.mocked(useDocField).mockReturnValue('');
		render(<NotificationPanelContent />);
		fireEvent.click(screen.getByTestId('notification-action-n-1'));
		expect(openExternalURL).not.toHaveBeenCalled();
	});
});
