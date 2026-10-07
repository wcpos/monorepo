/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const mockTrigger = jest.fn();
const mockWarn = jest.fn();
let mockWriteSessionHeld = false;
let mockAuthRequired = false;
let mockSyncBacklogSales = 3;

jest.mock('../../hooks/use-engine-monitor', () => ({
	useEngineStatus: () => ({
		writeSessionHeld: mockWriteSessionHeld,
		authRequired: mockAuthRequired,
	}),
	useMutationCounts: () => ({ syncBacklogSales: mockSyncBacklogSales }),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { name: 'Shop' },
		wpCredentials: { id: 1 },
		logout: jest.fn(),
	}),
}));

jest.mock('../../hooks/use-rest-http-client/use-session-login-flow', () => ({
	useSessionLoginFlow: () => ({ triggerAuthFlow: mockTrigger }),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ warn: mockWarn }),
}));

// Render with react-native-web's Text, avoiding raw JSX in @rn-primitives/slot.
jest.mock('@wcpos/components/text', () => {
	const { Text } = jest.requireActual('react-native');
	return { Text };
});

jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

// eslint-disable-next-line import/first -- Initialize the shared logger mock before the banner.
import { SessionHoldBanner } from './session-hold-banner';

describe('SessionHoldBanner', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWriteSessionHeld = false;
		mockAuthRequired = false;
		mockSyncBacklogSales = 3;
	});

	it('renders nothing when neither session flag is set', () => {
		const { container } = render(<SessionHoldBanner />);

		expect(container.firstChild).toBeNull();
	});

	it('renders nothing when the write session is held but no sales are waiting', () => {
		mockWriteSessionHeld = true;
		mockSyncBacklogSales = 0;
		const { container } = render(<SessionHoldBanner />);

		expect(container.firstChild).toBeNull();
	});

	it('shows the waiting sales while the write session is held', () => {
		mockWriteSessionHeld = true;
		mockSyncBacklogSales = 2;
		render(<SessionHoldBanner />);

		expect(screen.getByTestId('session-hold-banner').textContent).toContain(
			'2 sales waiting to sync. Log in to continue.'
		);
	});

	it('shows a singular sale when only authRequired is set', () => {
		mockAuthRequired = true;
		mockSyncBacklogSales = 1;
		render(<SessionHoldBanner />);

		expect(screen.getByTestId('session-hold-banner').textContent).toContain(
			'1 sale waiting to sync. Log in to continue.'
		);
	});

	it('starts the login flow when the login action is pressed', () => {
		mockWriteSessionHeld = true;
		render(<SessionHoldBanner />);

		fireEvent.click(screen.getByTestId('session-hold-login'));
		expect(mockTrigger).toHaveBeenCalledTimes(1);
	});

	it('toasts once at hold start and again only after the hold clears', () => {
		const { rerender } = render(<SessionHoldBanner />);
		expect(mockWarn).not.toHaveBeenCalled();

		mockWriteSessionHeld = true;
		rerender(<SessionHoldBanner />);
		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(mockWarn).toHaveBeenCalledWith(
			'Please log in to continue',
			expect.objectContaining({
				showToast: true,
				code: ERROR_CODES.SESSION_EXPIRED,
				context: { siteName: 'Shop' },
				toast: { action: { label: 'Log in', onClick: expect.any(Function) } },
			})
		);

		rerender(<SessionHoldBanner />);
		rerender(<SessionHoldBanner />);
		expect(mockWarn).toHaveBeenCalledTimes(1);

		mockWriteSessionHeld = false;
		rerender(<SessionHoldBanner />);
		mockWriteSessionHeld = true;
		rerender(<SessionHoldBanner />);
		expect(mockWarn).toHaveBeenCalledTimes(2);

		mockWarn.mock.calls[0][1].toast.action.onClick();
		expect(mockTrigger).toHaveBeenCalledTimes(1);
	});

	it('does not toast when authRequired is already true as the hold starts', () => {
		mockAuthRequired = true;
		const { rerender } = render(<SessionHoldBanner />);

		mockWriteSessionHeld = true;
		rerender(<SessionHoldBanner />);

		expect(mockWarn).not.toHaveBeenCalled();
	});
});
