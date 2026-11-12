/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

type TextMockProps = Record<string, unknown> & { testID?: string };

const mockPush = jest.fn();
const mockDismiss = jest.fn();
let mockArmed = false;
const mockListeners = new Set<() => void>();
const mockNotify = () => mockListeners.forEach((listener) => listener());

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

// A controllable stand-in with the real module's contract: arm and dismiss notify subscribers.
jest.mock('@wcpos/utils/scanner-reset-notice', () => ({
	isScannerResetNoticeArmed: () => mockArmed,
	subscribeScannerResetNotice: (listener: () => void) => {
		mockListeners.add(listener);
		return () => mockListeners.delete(listener);
	},
	dismissScannerResetNotice: () => {
		mockDismiss();
		mockArmed = false;
		mockNotify();
	},
}));

// Keep Notice and its buttons real; native drawing and URL hand-off are outside this suite.
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
// react-native-web drops className; a span Text keeps it so the action labels' classes are readable.
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Text: ({ testID, numberOfLines, maxFontSizeMultiplier, style, ...props }: TextMockProps) =>
		jest.requireActual('react').createElement('span', { ...props, 'data-testid': testID }),
}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

jest.mock('../../../../contexts/translations', () => {
	const { createTestT } = jest.requireActual<typeof import('../../../../../jest/translate')>(
		'../../../../../jest/translate'
	);
	return { useT: () => createTestT() };
});

// eslint-disable-next-line import/first -- the module mocks above must be in place first.
import { ScannerResetNotice } from './index';

describe('ScannerResetNotice', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockArmed = false;
		mockListeners.clear();
	});

	it('renders nothing when the notice is not armed', () => {
		const { container } = render(<ScannerResetNotice gutter="dense" />);

		expect(container.firstChild).toBeNull();
	});

	it('shows the one-sentence notice when armed', () => {
		mockArmed = true;
		render(<ScannerResetNotice gutter="dense" />);

		expect(screen.getByTestId('scanner-reset-notice')).toBeTruthy();
		expect(screen.getByTestId('scanner-reset-notice-title').textContent).toBe(
			'Your barcode scanner settings were reset to their defaults in this update.'
		);
		// Review leads in the accent; Dismiss stays the muted ghost.
		expect(screen.getByText('Review scanner settings').className).toContain('text-primary');
		expect(screen.getByText('Dismiss').className).not.toContain('text-primary');
	});

	it('dismisses and opens Barcode Scanning settings on review', () => {
		mockArmed = true;
		render(<ScannerResetNotice />);

		fireEvent.click(screen.getByTestId('scanner-reset-notice-review'));

		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockPush).toHaveBeenCalledWith('/settings/barcode-scanning');
	});

	it('goes away when dismissed', () => {
		mockArmed = true;
		render(<ScannerResetNotice />);

		fireEvent.click(screen.getByTestId('scanner-reset-notice-dismiss'));

		expect(mockDismiss).toHaveBeenCalledTimes(1);
		expect(mockPush).not.toHaveBeenCalled();
		expect(screen.queryByTestId('scanner-reset-notice')).toBeNull();
	});

	it('appears when the purge arms it after the cart mounted', () => {
		render(<ScannerResetNotice gutter="dense" />);
		expect(screen.queryByTestId('scanner-reset-notice')).toBeNull();

		act(() => {
			mockArmed = true;
			mockNotify();
		});

		expect(screen.getByTestId('scanner-reset-notice')).toBeTruthy();
	});
});
