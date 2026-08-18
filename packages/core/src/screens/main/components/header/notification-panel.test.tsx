/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { NotificationPanelContent } from './notification-panel';

jest.mock('../../../../contexts/novu', () => ({
	useNovuNotifications: () => ({
		notifications: [],
		unreadCount: 1,
		markAsRead: jest.fn(),
		markAllAsRead: jest.fn(),
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../hooks/use-date-format', () => ({ useDateFormat: () => '' }));

jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		size,
		onPress,
	}: React.PropsWithChildren<{ size?: string; onPress?: () => void }>) => (
		<button data-size={size} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

function passthrough({ children }: React.PropsWithChildren) {
	return <div>{children}</div>;
}

jest.mock('@wcpos/components/hstack', () => ({ HStack: passthrough }));
jest.mock('@wcpos/components/vstack', () => ({ VStack: passthrough }));
jest.mock('@wcpos/components/text', () => ({ Text: passthrough }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Root: passthrough,
	List: () => null,
	Item: passthrough,
}));
jest.mock('react-native', () => ({ Pressable: passthrough, View: passthrough }));

describe('NotificationPanelContent', () => {
	it('keeps a touch-safe hit area on the compact mark-all-read action', () => {
		render(<NotificationPanelContent />);

		expect(
			screen.getByRole('button', { name: 'common.mark_all_as_read' }).getAttribute('data-size')
		).toBe('compact');
	});
});
