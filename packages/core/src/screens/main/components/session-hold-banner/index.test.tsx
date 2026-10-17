/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const mockTrigger = jest.fn();
const mockSessionRestored = jest.fn();
const mockWarn = jest.fn();
const mockInfo = jest.fn();
let mockWpCredentials = { id: 1, access_token: 'initial', refresh_token: 'refresh' };
let mockWriteSessionHeld = false;
let mockAuthRequired = false;
let mockSyncBacklogSales = 3;
let mockStatus = { writeSessionHeld: false, authRequired: false };

function mockRepublishStatus() {
	mockStatus = { ...mockStatus };
}

jest.mock('../../hooks/use-engine-monitor', () => ({
	useEngineStatus: () => {
		if (
			mockStatus.writeSessionHeld !== mockWriteSessionHeld ||
			mockStatus.authRequired !== mockAuthRequired
		) {
			mockStatus = { writeSessionHeld: mockWriteSessionHeld, authRequired: mockAuthRequired };
		}
		return mockStatus;
	},
	useMutationCounts: () => ({ syncBacklogSales: mockSyncBacklogSales }),
}));

jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({
		site: { name: 'Shop' },
		wpCredentials: mockWpCredentials,
		logout: jest.fn(),
	}),
}));

jest.mock('../../hooks/use-rest-http-client/use-session-login-flow', () => ({
	useSessionLoginFlow: () => ({ triggerAuthFlow: mockTrigger }),
}));

jest.mock('@wcpos/utils/logger', () => ({
	// Deferred so the factory can run while the state manager module loads, before the
	// mock fns above are initialised.
	getLogger: () => ({
		warn: (...args: unknown[]) => mockWarn(...args),
		info: (...args: unknown[]) => mockInfo(...args),
		debug: jest.fn(),
	}),
}));

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine: { sessionRestored: mockSessionRestored } }),
	useDocField: <T, R>(doc: T, select: (value: T) => R) => select(doc),
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
import { resetSessionHoldBannerState, SessionHoldBanner, SessionHoldProvider } from './index';

// One owner, as the app mounts it; a test that needs two bars renders two banners inside it.
function Held() {
	return (
		<SessionHoldProvider>
			<SessionHoldBanner />
		</SessionHoldProvider>
	);
}

describe('SessionHoldBanner', () => {
	beforeEach(() => {
		resetSessionHoldBannerState();
		jest.clearAllMocks();
		mockWriteSessionHeld = false;
		mockAuthRequired = false;
		mockStatus = { writeSessionHeld: false, authRequired: false };
		mockSyncBacklogSales = 3;
		mockWpCredentials = { id: 1, access_token: 'initial', refresh_token: 'refresh' };
	});

	afterEach(() => {
		requestStateManager.reset();
	});

	it('renders nothing when neither session flag is set', () => {
		const { container } = render(<Held />);

		expect(container.firstChild).toBeNull();
	});

	it.each(['writeSessionHeld', 'authRequired'])('shows %s without waiting sales', (reason) => {
		mockWriteSessionHeld = reason === 'writeSessionHeld';
		mockAuthRequired = reason === 'authRequired';
		mockSyncBacklogSales = 0;
		render(<Held />);

		expect(screen.getByTestId('session-hold-banner').textContent).toContain(
			'Session expired — sign in to reconnect to the store.'
		);
		fireEvent.click(screen.getByTestId('session-hold-login'));
		expect(mockTrigger).toHaveBeenCalledTimes(1);
	});

	it('shows the waiting sales while the write session is held', () => {
		mockWriteSessionHeld = true;
		mockSyncBacklogSales = 2;
		render(<Held />);

		expect(screen.getByTestId('session-hold-banner').textContent).toContain(
			'2 sales waiting to sync. Log in to continue.'
		);
	});

	it('shows a singular sale when only authRequired is set', () => {
		mockAuthRequired = true;
		mockSyncBacklogSales = 1;
		render(<Held />);

		expect(screen.getByTestId('session-hold-banner').textContent).toContain(
			'1 sale waiting to sync. Log in to continue.'
		);
	});

	it('starts the login flow when the login action is pressed', () => {
		mockWriteSessionHeld = true;
		render(<Held />);

		fireEvent.click(screen.getByTestId('session-hold-login'));
		expect(mockTrigger).toHaveBeenCalledTimes(1);
	});

	it('toasts once at hold start and again only after the hold clears', () => {
		const { rerender } = render(<Held />);
		expect(mockWarn).not.toHaveBeenCalled();

		mockWriteSessionHeld = true;
		rerender(<Held />);
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

		rerender(<Held />);
		rerender(<Held />);
		expect(mockWarn).toHaveBeenCalledTimes(1);

		mockWriteSessionHeld = false;
		rerender(<Held />);
		mockWriteSessionHeld = true;
		rerender(<Held />);
		expect(mockWarn).toHaveBeenCalledTimes(2);

		mockWarn.mock.calls[0][1].toast.action.onClick();
		expect(mockTrigger).toHaveBeenCalledTimes(1);
	});

	it('toasts once when authRequired starts and not again when the write hold joins it', () => {
		const { rerender } = render(<Held />);
		mockAuthRequired = true;
		rerender(<Held />);
		expect(mockWarn).toHaveBeenCalledTimes(1);
		expect(mockWarn).toHaveBeenCalledWith(
			'Please log in to continue',
			expect.objectContaining({ code: ERROR_CODES.SESSION_EXPIRED })
		);
		rerender(<Held />);

		mockWriteSessionHeld = true;
		rerender(<Held />);
		expect(mockWarn).toHaveBeenCalledTimes(1);
	});

	it.each(['access_token'] as const)(
		'recovers a failed session only when %s changes after mount',
		(field) => {
			mockAuthRequired = true;
			requestStateManager.setAuthFailed(true);
			requestStateManager.setRefreshedToken('old');
			const { rerender } = render(<Held />);
			expect(screen.getByTestId('session-hold-banner')).toBeTruthy();
			rerender(<Held />);
			expect(requestStateManager.isAuthFailed()).toBe(true);
			expect(requestStateManager.getRefreshedToken()).toBe('old');
			expect(mockInfo).not.toHaveBeenCalled();

			mockWpCredentials = { ...mockWpCredentials, [field]: 'new' };
			rerender(<Held />);
			expect(screen.queryByTestId('session-hold-banner')).toBeNull();
			expect(requestStateManager.isAuthFailed()).toBe(false);
			expect(requestStateManager.getRefreshedToken()).toBeNull();
			expect(mockInfo).toHaveBeenCalledTimes(1);
			expect(mockInfo).toHaveBeenCalledWith('Session renewed by another tab', {
				showToast: true,
				toast: { title: 'Session renewed automatically' },
				context: { siteName: 'Shop' },
			});

			act(() => requestStateManager.setAuthFailed(true));
			requestStateManager.setRefreshedToken('old');
			rerender(<Held />);
			expect(requestStateManager.isAuthFailed()).toBe(true);
			expect(requestStateManager.getRefreshedToken()).toBe('old');
			expect(mockInfo).toHaveBeenCalledTimes(1);

			mockAuthRequired = false;
			rerender(<Held />);
			mockAuthRequired = true;
			rerender(<Held />);
			expect(screen.getByTestId('session-hold-banner')).toBeTruthy();
		}
	);

	it('does not recover for a refresh-token-only change', () => {
		requestStateManager.setAuthFailed(true);
		const { rerender } = render(<Held />);
		mockWpCredentials = { ...mockWpCredentials, refresh_token: 'new' };
		rerender(<Held />);
		expect(requestStateManager.isAuthFailed()).toBe(true);
		expect(mockInfo).not.toHaveBeenCalled();
		expect(mockWarn).not.toHaveBeenCalled();
	});

	it('toasts once across providers, including one mounted during a hold', () => {
		const first = render(<Held />);
		const second = render(<Held />);
		mockAuthRequired = true;
		first.rerender(<Held />);
		second.rerender(<Held />);
		expect(mockWarn).toHaveBeenCalledTimes(1);
		render(<Held />);
		expect(mockWarn).toHaveBeenCalledTimes(1);
	});

	it('hides every mounted bar banner on a renewal, not only the first', () => {
		mockAuthRequired = true;
		requestStateManager.setAuthFailed(true);
		const bars = () => (
			<SessionHoldProvider>
				<SessionHoldBanner />
				<SessionHoldBanner />
			</SessionHoldProvider>
		);
		const { rerender } = render(bars());
		expect(screen.getAllByTestId('session-hold-banner')).toHaveLength(2);
		mockWpCredentials = { ...mockWpCredentials, access_token: 'new' };
		rerender(bars());
		expect(screen.queryAllByTestId('session-hold-banner')).toHaveLength(0);
		expect(mockInfo).toHaveBeenCalledTimes(1);
	});

	it('renders nothing outside a provider', () => {
		mockAuthRequired = true;
		const { container } = render(<SessionHoldBanner />);
		expect(container.firstChild).toBeNull();
	});

	it('notifies the write engine on external credential renewal while awaiting its next snapshot', () => {
		mockAuthRequired = true;
		mockWriteSessionHeld = true;
		mockSyncBacklogSales = 2;
		requestStateManager.setAuthFailed(true);
		const { rerender } = render(<Held />);
		expect(mockSessionRestored).not.toHaveBeenCalled();
		mockWpCredentials = { ...mockWpCredentials, access_token: 'new' };
		rerender(<Held />);
		expect(mockSessionRestored).toHaveBeenCalledTimes(1);
		expect(requestStateManager.isAuthFailed()).toBe(false);
		expect(screen.getByTestId('session-hold-banner').textContent).toContain(
			'2 sales waiting to sync'
		);
	});

	it('shows the banner again when the latch sets after a recovery', () => {
		mockAuthRequired = true;
		requestStateManager.setAuthFailed(true);
		const { rerender } = render(<Held />);
		mockWpCredentials = { ...mockWpCredentials, access_token: 'new' };
		rerender(<Held />);
		expect(screen.queryByTestId('session-hold-banner')).toBeNull();

		act(() => requestStateManager.setAuthFailed(true));
		expect(screen.getByTestId('session-hold-banner')).toBeTruthy();
	});

	it.each([true, false])(
		're-evaluates recovery on a new snapshot with authRequired=%s',
		(required) => {
			mockAuthRequired = true;
			requestStateManager.setAuthFailed(true);
			const { rerender } = render(<Held />);
			mockWpCredentials = { ...mockWpCredentials, access_token: 'new' };
			rerender(<Held />);
			expect(screen.queryByTestId('session-hold-banner')).toBeNull();
			expect(requestStateManager.isAuthFailed()).toBe(false);

			mockAuthRequired = required;
			mockRepublishStatus();
			rerender(<Held />);
			if (required) {
				expect(screen.getByTestId('session-hold-banner')).toBeTruthy();
			} else {
				expect(screen.queryByTestId('session-hold-banner')).toBeNull();
			}
		}
	);

	it('does not clear the cached token or log recovery when auth has not failed', () => {
		requestStateManager.setRefreshedToken('current');
		const { rerender } = render(<Held />);
		mockWpCredentials = { ...mockWpCredentials, access_token: 'new' };
		rerender(<Held />);
		expect(requestStateManager.getRefreshedToken()).toBe('current');
		expect(mockInfo).not.toHaveBeenCalled();
	});
});
